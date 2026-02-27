from fastapi import APIRouter, BackgroundTasks
from db.connection import query_df

router = APIRouter()


@router.get("/ingestion-log")
def get_ingestion_log(limit: int = 30):
    """Last N ingestion run entries for observability."""
    df = query_df(
        """
        SELECT source, run_date::TEXT, rows_loaded, null_rate,
               status, error_msg, ROUND(duration_sec::numeric, 1) AS duration_sec,
               created_at::TEXT AS created_at
        FROM ingestion_log
        ORDER BY created_at DESC
        LIMIT :limit
    """,
        {"limit": limit},
    )
    return df.to_dict(orient="records")


@router.post("/pipeline/trigger")
async def trigger_pipeline(background_tasks: BackgroundTasks):
    """
    Manually trigger the full pipeline (for dev/demo).
    Runs in background — returns immediately.
    In production, use Airflow to trigger instead.
    """

    def run_all():
        from pipelines.ingest_tickets import run_ticket_ingestion
        from pipelines.rfm_pipeline import run_rfm_pipeline
        from models.survival_model import train_cox_model, score_all_customers
        from models.xgb_model import train_xgb_model, score_all_customers_xgb

        run_ticket_ingestion(source="csv")
        run_rfm_pipeline()
        cph, df, run_id = train_cox_model()
        score_all_customers(cph, df, run_id)
        model, _ = train_xgb_model()
        score_all_customers_xgb(model)

    background_tasks.add_task(run_all)
    return {
        "status": "triggered",
        "message": "Pipeline running in background. Check /api/ingestion-log for progress.",
    }
