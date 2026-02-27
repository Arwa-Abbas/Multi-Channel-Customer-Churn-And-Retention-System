from fastapi import APIRouter, BackgroundTasks
from db.connection import query_df

# ── Metrics ────────────────────────────────────────────────────────────────
router = APIRouter()


@router.get("/model-metrics")
def get_model_metrics():
    """
    Model performance history for all runs.
    Used by PowerBI 'Model Performance' page and React dashboard.
    """
    df = query_df("SELECT * FROM vw_model_metrics_history LIMIT 50")
    df["run_date"] = df["run_date"].astype(str)
    return df.to_dict(orient="records")


@router.get("/model-metrics/latest")
def get_latest_metrics():
    """Latest champion model metrics for both Cox and XGBoost."""
    df = query_df(
        """
        SELECT DISTINCT ON (model_type)
            model_type, c_index, roc_auc, brier_score, n_customers, run_date, run_id
        FROM model_run_metrics
        WHERE is_champion = TRUE
        ORDER BY model_type, run_date DESC
    """
    )
    df["run_date"] = df["run_date"].astype(str)
    return df.to_dict(orient="records")
