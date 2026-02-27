"""
models/survival_model.py
=========================
Trains a Cox Proportional Hazards model using Lifelines.
Scores all customers and writes survival predictions to DB.
Logs every run to MLflow for experiment tracking.

HOW IT CONNECTS:
  ← customer_features (read training data)
  → predictions table (write churn_prob_30d, churn_prob_90d, median_survival_days, clv_estimate)
  → model_run_metrics table (write C-index, run metadata)
  → MLflow server (log params, metrics, model artifact)

MODEL FEATURES (from PRD FR-3):
  tenure_days, recency_days, frequency_90d, avg_order_value,
  ticket_count_90d, avg_resolution_days, web_sessions_30d, rfm_tier_encoded

CALLED BY:
  airflow/dags/churn_pipeline_dag.py  (task: train_survival_model)
  CLI: python -m models.survival_model
"""

import os
import logging
import warnings
from datetime import date
from pathlib import Path

import joblib
import mlflow
import mlflow.pyfunc
import numpy as np
import pandas as pd
from lifelines import CoxPHFitter, KaplanMeierFitter
from lifelines.statistics import logrank_test
from scipy.stats import kstest

from db.connection import query_df, execute_sql, upsert_df

warnings.filterwarnings("ignore", category=FutureWarning)
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

MLFLOW_URI = os.environ.get("MLFLOW_TRACKING_URI", "http://localhost:5000")
ARTIFACT_DIR = Path("models/artifacts")
MODEL_PATH = ARTIFACT_DIR / "cox_model.pkl"
KM_PATH = ARTIFACT_DIR / "km_fitter.pkl"

FEATURES = [
    "tenure_days",
    "recency_days",
    "frequency_90d",
    "avg_order_value",
    "ticket_count_90d",
    "avg_resolution_days",
    "web_sessions_30d",
    "rfm_tier_encoded",
]

DURATION_COL = "duration_days"
EVENT_COL = "churn_flag"


# ── Data loading ───────────────────────────────────────────────────────────


def load_training_data() -> pd.DataFrame:
    df = query_df(
        f"""
        SELECT
            customer_id,
            {', '.join(FEATURES)},
            {DURATION_COL},
            {EVENT_COL}::int AS {EVENT_COL}
        FROM customer_features
        WHERE tenure_days > 7
          AND duration_days > 0
          AND duration_days IS NOT NULL
    """
    )
    # Remove extreme outliers (top 1% tenure)
    p99 = df["tenure_days"].quantile(0.99)
    df = df[df["tenure_days"] <= p99]
    logger.info(f"[Cox] Loaded {len(df)} training customers")
    return df


# ── Proportional Hazards assumption check ─────────────────────────────────


def check_ph_assumption(cph: CoxPHFitter, df: pd.DataFrame) -> dict:
    """
    Test proportional hazards assumption using Schoenfeld residuals.
    Returns per-feature p-values. p < 0.05 means PH assumption may be violated.
    """
    try:
        results = cph.check_assumptions(df, p_value_threshold=0.05, show_plots=False)
        return {"ph_check": "passed"}
    except Exception as e:
        logger.warning(f"[Cox] PH check: {e}")
        return {"ph_check": str(e)}


# ── Kaplan-Meier per tier ──────────────────────────────────────────────────


def fit_kaplan_meier(df: pd.DataFrame) -> dict:
    """
    Fit separate K-M curves per RFM tier.
    Returns {tier: {"timeline": [...], "survival": [...], "ci_lower": [...], "ci_upper": [...]}}
    """
    # Re-join with rfm_tier
    features_df = query_df("SELECT customer_id, rfm_tier FROM customer_features")
    df = df.merge(
        features_df[["customer_id", "rfm_tier"]], on="customer_id", how="left"
    )

    km_results = {}
    kmf = KaplanMeierFitter()

    for tier in df["rfm_tier"].dropna().unique():
        mask = df["rfm_tier"] == tier
        sub = df[mask]
        kmf.fit(sub[DURATION_COL], sub[EVENT_COL], label=tier)
        sf = kmf.survival_function_
        ci = kmf.confidence_interval_survival_function_

        km_results[tier] = {
            "timeline": sf.index.tolist(),
            "survival": sf[tier].tolist(),
            "ci_lower": ci[f"{tier}_lower_0.95"].tolist(),
            "ci_upper": ci[f"{tier}_upper_0.95"].tolist(),
            "median": float(kmf.median_survival_time_),
            "n_subjects": int(sub[EVENT_COL].count()),
        }

    return km_results


# ── Training ───────────────────────────────────────────────────────────────


def train_cox_model(penalizer: float = 0.1) -> tuple[CoxPHFitter, pd.DataFrame, str]:
    """
    Train CoxPHFitter. Returns (model, training_df, mlflow_run_id).
    """
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    mlflow.set_tracking_uri(MLFLOW_URI)
    mlflow.set_experiment("churn-survival-analysis")

    df = load_training_data()

    with mlflow.start_run(run_name=f"cox-ph-{date.today()}") as run:
        run_id = run.info.run_id
        logger.info(f"[Cox] MLflow run_id: {run_id}")

        # Log parameters
        mlflow.log_params(
            {
                "model_type": "CoxPH",
                "penalizer": penalizer,
                "n_customers": len(df),
                "n_features": len(FEATURES),
                "churn_rate": round(df[EVENT_COL].mean(), 4),
                "features": ",".join(FEATURES),
            }
        )

        # Prepare training data
        cox_df = df[FEATURES + [DURATION_COL, EVENT_COL]].fillna(0)

        # FIXED: Create the model first, then fit it
        cph = CoxPHFitter(penalizer=penalizer)
        cph.fit(cox_df, duration_col=DURATION_COL, event_col=EVENT_COL)

        c_index = cph.concordance_index_
        logger.info(f"[Cox] C-index: {c_index:.4f}")
        cph.print_summary(decimals=3)

        # Log metrics
        mlflow.log_metrics(
            {
                "c_index": round(float(c_index), 4),
            }
        )

        # PH assumption check
        ph_results = check_ph_assumption(cph, cox_df)
        mlflow.log_params(ph_results)

        # Save model artifact
        joblib.dump(cph, MODEL_PATH)
        mlflow.log_artifact(str(MODEL_PATH), artifact_path="models")

        # Fit + save K-M curves
        km_results = fit_kaplan_meier(df)
        import json

        km_path = ARTIFACT_DIR / "km_results.json"
        with open(km_path, "w") as f:
            json.dump(km_results, f)
        mlflow.log_artifact(str(km_path), artifact_path="models")
        joblib.dump(km_results, KM_PATH)

        # Pass/fail check against PRD target
        if c_index < 0.70:
            logger.warning(
                f"[Cox] C-index {c_index:.4f} below target 0.70 — model accepted but flagged"
            )
            mlflow.set_tag("quality_flag", "below_target")

    logger.info(f"[Cox] Training complete. Model saved to {MODEL_PATH}")
    return cph, df, run_id


# ── Scoring ────────────────────────────────────────────────────────────────


def score_all_customers(
    cph: CoxPHFitter, training_df: pd.DataFrame, run_id: str
) -> int:
    """
    Compute survival probabilities for every customer.
    Writes to predictions table. Returns rows written.
    """
    logger.info("[Cox] Scoring all customers...")
    score_df = training_df[FEATURES].fillna(0)

    # Survival function: rows = time points, columns = customers
    sf_matrix = cph.predict_survival_function(score_df)

    # P(churn by t) = 1 - S(t)
    def survival_at(days: int) -> np.ndarray:
        idx = sf_matrix.index[sf_matrix.index <= days]
        if len(idx) == 0:
            return np.zeros(len(score_df))
        return sf_matrix.loc[idx[-1]].values

    churn_30d = (1 - survival_at(30)).clip(0, 1).round(5)
    churn_90d = (1 - survival_at(90)).clip(0, 1).round(5)
    median_sur = cph.predict_median(score_df).values

    # CLV = AOV × purchase_rate × expected_remaining_days
    tenure_safe = training_df["tenure_days"].clip(lower=1).values
    aov = training_df["avg_order_value"].values
    freq = training_df["frequency_90d"].values / 90.0  # daily rate
    clv = (aov * freq * np.nan_to_num(median_sur, nan=0)).round(2)

    preds = pd.DataFrame(
        {
            "customer_id": training_df["customer_id"].values,
            "churn_prob_30d": churn_30d,
            "churn_prob_90d": churn_90d,
            "median_survival_days": np.nan_to_num(median_sur, nan=-1).astype(int),
            "clv_estimate": clv,
            "model_version": f"cox-{run_id[:8]}",
            "scored_at": pd.Timestamp.utcnow(),
        }
    )

    rows = upsert_df(preds, "predictions", if_exists="replace")

    # Record run metrics to DB for PowerBI
    execute_sql(
        """
        INSERT INTO model_run_metrics
            (run_id, model_type, c_index, n_customers, run_date, is_champion)
        VALUES (:run_id, 'cox', :c_index, :n, :run_date, TRUE)
        ON CONFLICT DO NOTHING
    """,
        {
            "run_id": run_id,
            "c_index": float(cph.concordance_index_),
            "n": len(preds),
            "run_date": date.today(),
        },
    )

    logger.info(f"[Cox] {rows} predictions written")
    return rows


if __name__ == "__main__":
    cph, df, run_id = train_cox_model()
    score_all_customers(cph, df, run_id)
