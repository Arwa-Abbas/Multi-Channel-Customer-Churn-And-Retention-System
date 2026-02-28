from fastapi import APIRouter, BackgroundTasks
from db.connection import query_df

router = APIRouter()


@router.get("/ingestion-log")
def get_ingestion_log(limit: int = 30):
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
    """Manually trigger the full pipeline. Runs in background."""

    def run_all():
        import traceback, logging

        logger = logging.getLogger("pipeline")
        try:
            logger.info("[Pipeline] Starting ingestion...")
            from pipelines.ingest_tickets import run_ticket_ingestion

            run_ticket_ingestion(source="csv")

            logger.info("[Pipeline] Running RFM...")
            from pipelines.rfm_pipeline import run_rfm_pipeline

            run_rfm_pipeline()

            logger.info("[Pipeline] Training Cox PH...")
            from models.survival_model import train_cox_model, score_all_customers

            # Fixed: train_cox_model now returns 4 values (cph, df, features, run_id)
            result = train_cox_model()
            if len(result) == 4:
                cph, df, features, run_id = result
                score_all_customers(cph, df, features, run_id)
            else:
                cph, df, run_id = result
                score_all_customers(cph, df, [], run_id)

            logger.info("[Pipeline] Training XGBoost...")
            from models.xgb_model import train_xgb_model, score_all_customers_xgb

            model, _ = train_xgb_model()
            score_all_customers_xgb(model)

            logger.info("[Pipeline] Complete!")
        except Exception:
            logger.error(f"[Pipeline] ERROR:\n{traceback.format_exc()}")

    background_tasks.add_task(run_all)
    return {
        "status": "triggered",
        "message": "Pipeline running in background. Check /api/ingestion-log for progress.",
    }
