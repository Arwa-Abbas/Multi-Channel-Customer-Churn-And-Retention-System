"""
Nightly DAG that runs the full churn pipeline end-to-end.

SCHEDULE: Every night at 02:00 UTC

TASK GRAPH:
  ingest_tickets
       ↓
  rfm_pipeline
       ↓
  train_survival_model
       ↓
  train_xgb_model
       ↓
  export_powerbi_snapshot    ← writes CSV snapshots for PowerBI data refresh

HOW TO VIEW:
  Open Airflow UI → http://localhost:8080
  Username: admin  Password: admin
  DAG: churn_nightly_pipeline

CONNECTIONS NEEDED IN AIRFLOW UI (Admin → Connections):
  zendesk_default: HTTP conn with host=yoursubdomain.zendesk.com,
                   login=email/token, password=your_token
"""

import sys
import os
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator, BranchPythonOperator
from airflow.operators.empty import EmptyOperator
from airflow.utils.trigger_rule import TriggerRule

# Make backend modules importable inside DAG tasks
sys.path.insert(0, "/opt/airflow/backend")

# ── Default args ────────────────────────────────────────────────────────────
default_args = {
    "owner": "data-team",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
    "execution_timeout": timedelta(minutes=45),
}


# ── Task callables ──────────────────────────────────────────────────────────


def task_ingest_tickets(**context):
    """
    Ingest support tickets.
    Uses Zendesk if ZENDESK_TOKEN is set, otherwise falls back to CSV seed.
    """
    from pipelines.ingest_tickets import run_ticket_ingestion

    use_zendesk = bool(os.environ.get("ZENDESK_TOKEN"))
    source = "zendesk" if use_zendesk else "csv"

    result = run_ticket_ingestion(
        source=source, days_back=2
    )  # 2-day overlap for safety
    context["ti"].xcom_push(key="tickets_result", value=result)
    return result


def task_rfm_pipeline(**context):
    """Run RFM segmentation pipeline."""
    from pipelines.rfm_pipeline import run_rfm_pipeline

    result = run_rfm_pipeline()
    context["ti"].xcom_push(key="rfm_tier_counts", value=result["tier_counts"])
    return result


def task_train_survival(**context):
    """Train Cox PH model and score all customers."""
    from models.survival_model import train_cox_model, score_all_customers

    cph, df, run_id = train_cox_model()
    rows = score_all_customers(cph, df, run_id)
    context["ti"].xcom_push(key="cox_run_id", value=run_id)
    context["ti"].xcom_push(key="cox_rows", value=rows)
    return {"run_id": run_id, "rows": rows}


def task_train_xgb(**context):
    """Train XGBoost classifier and update predictions."""
    from models.xgb_model import train_xgb_model, score_all_customers_xgb

    model, run_id = train_xgb_model()
    rows = score_all_customers_xgb(model)
    context["ti"].xcom_push(key="xgb_run_id", value=run_id)
    return {"run_id": run_id, "rows": rows}


def task_export_powerbi_snapshot(**context):
    """
    Export prediction + segment data to CSV files in /app/data/powerbi/.
    PowerBI can read these CSVs or connect via DirectQuery to the views.

    Files written:
      powerbi/at_risk_customers.csv
      powerbi/segment_summary.csv
      powerbi/model_metrics.csv
      powerbi/monthly_trend.csv
      powerbi/churn_cohort.csv
      powerbi/km_curves.json
    """
    import json
    import joblib
    from pathlib import Path
    from db.connection import query_df

    out_dir = Path("/app/data/powerbi")
    out_dir.mkdir(parents=True, exist_ok=True)
    run_date = datetime.utcnow().strftime("%Y-%m-%d")

    exports = {
        "at_risk_customers.csv": "SELECT * FROM vw_at_risk_customers",
        "segment_summary.csv": "SELECT * FROM vw_segment_summary",
        "model_metrics.csv": "SELECT * FROM vw_model_metrics_history ORDER BY run_date DESC LIMIT 100",
        "monthly_trend.csv": "SELECT * FROM vw_monthly_active_trend",
        "churn_cohort.csv": "SELECT * FROM vw_churn_cohort",
        "kpi_summary.csv": "SELECT * FROM vw_kpi_summary",
    }

    for filename, sql in exports.items():
        df = query_df(sql)
        df.to_csv(out_dir / filename, index=False)

    # Export K-M curves JSON for React dashboard endpoint
    km_path = Path("models/artifacts/km_results.json")
    if km_path.exists():
        import shutil

        shutil.copy(km_path, out_dir / "km_curves.json")

    # Stamp the run
    with open(out_dir / "last_run.json", "w") as f:
        json.dump({"run_date": run_date, "status": "success"}, f)

    return {"files": list(exports.keys()), "output_dir": str(out_dir)}


def task_quality_check(**context):
    """
    Post-run data quality check.
    Raises exception if predictions table has anomalies.
    """
    from db.connection import query_df

    checks = query_df(
        """
        SELECT
            COUNT(*)                            AS total_predictions,
            SUM(CASE WHEN churn_prob_30d IS NULL THEN 1 ELSE 0 END) AS null_30d,
            SUM(CASE WHEN churn_prob_30d > 1 OR churn_prob_30d < 0 THEN 1 ELSE 0 END) AS invalid_probs,
            MAX(scored_at)                      AS last_scored
        FROM predictions
    """
    )

    row = checks.iloc[0]
    if row["null_30d"] > 0:
        raise ValueError(
            f"Quality check FAILED: {row['null_30d']} NULL churn_prob_30d values"
        )
    if row["invalid_probs"] > 0:
        raise ValueError(
            f"Quality check FAILED: {row['invalid_probs']} out-of-range probabilities"
        )

    return {
        "total": int(row["total_predictions"]),
        "last_scored": str(row["last_scored"]),
    }


# ── DAG definition ──────────────────────────────────────────────────────────

with DAG(
    dag_id="churn_nightly_pipeline",
    default_args=default_args,
    description="Nightly churn pipeline: ingest → RFM → survival model → XGBoost → export",
    schedule_interval="0 2 * * *",  # 02:00 UTC every night
    start_date=datetime(2024, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["churn", "production", "ml"],
) as dag:

    # ── Pipeline start ────────────────────────────────────────
    start = EmptyOperator(task_id="pipeline_start")

    # ── Ingestion ─────────────────────────────────────────────
    ingest_tickets = PythonOperator(
        task_id="ingest_tickets",
        python_callable=task_ingest_tickets,
        doc_md="""
        **Ingest Support Tickets**
        Source: Zendesk API (if configured) or CSV fallback.
        Output: support_tickets table, ingestion_log entry.
        """,
    )

    # ── RFM ───────────────────────────────────────────────────
    rfm = PythonOperator(
        task_id="rfm_pipeline",
        python_callable=task_rfm_pipeline,
        doc_md="""
        **RFM Segmentation Engine**
        Reads: transactions, web_events, support_tickets
        Writes: customer_features table with R/F/M scores and tier labels.
        """,
    )

    # ── Models ────────────────────────────────────────────────
    survival = PythonOperator(
        task_id="train_survival_model",
        python_callable=task_train_survival,
        doc_md="""
        **Cox PH Survival Model**
        Trains on customer_features, writes churn_prob_30d/90d to predictions.
        Logs C-index + artifact to MLflow.
        """,
    )

    xgb = PythonOperator(
        task_id="train_xgb_model",
        python_callable=task_train_xgb,
        doc_md="""
        **XGBoost Churn Classifier**
        Updates predictions.xgb_churn_prob + shap_importance table.
        Logs ROC-AUC + SHAP to MLflow.
        """,
    )

    # ── Quality check ─────────────────────────────────────────
    quality = PythonOperator(
        task_id="quality_check",
        python_callable=task_quality_check,
    )

    # ── PowerBI export ────────────────────────────────────────
    export = PythonOperator(
        task_id="export_powerbi_snapshot",
        python_callable=task_export_powerbi_snapshot,
        trigger_rule=TriggerRule.ALL_SUCCESS,
        doc_md="""
        **PowerBI CSV Export**
        Writes CSVs from DB views to /app/data/powerbi/.
        PowerBI can schedule a refresh to pick these up.
        """,
    )

    # ── Done ──────────────────────────────────────────────────
    done = EmptyOperator(
        task_id="pipeline_done",
        trigger_rule=TriggerRule.ALL_SUCCESS,
    )

    # ── Task dependencies ─────────────────────────────────────
    start >> ingest_tickets >> rfm >> survival >> xgb >> quality >> export >> done
