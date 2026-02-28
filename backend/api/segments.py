"""
api/segments.py
================
RFM segment endpoints — used by React dashboard and PowerBI DirectQuery.
"""

from fastapi import APIRouter, Query
from db.connection import query_df

router = APIRouter()


@router.get("/segments")
def get_segments():
    """
    Per-tier aggregated metrics.
    Returns: rfm_tier, customer_count, avg_monetary, avg_recency_days,
             avg_clv, avg_churn_prob_30d_pct, churned_count
    """
    df = query_df("SELECT * FROM vw_segment_summary")
    return df.to_dict(orient="records")


@router.get("/at-risk")
def get_at_risk(
    limit: int = Query(100, le=1000),
    tier: str = Query(None, description="Filter by RFM tier"),
    min_prob: float = Query(0.40, description="Minimum 30d churn probability"),
):
    """
    Filterable at-risk customer list.
    Returns top customers ranked by 30d churn probability.
    """
    filters = ["p.churn_prob_30d >= CAST(:min_prob AS numeric)"]
    params = {"limit": limit, "min_prob": min_prob}

    if tier:
        filters.append("cf.rfm_tier = :tier")
        params["tier"] = tier

    where = " AND ".join(filters)
    sql = f"""
        SELECT
            c.external_id,
            c.country,
            c.plan_type,
            cf.rfm_tier,
            cf.recency_days,
            cf.frequency,
            ROUND(cf.monetary::numeric, 2)        AS total_spend,
            ROUND(p.churn_prob_30d * 100, 1)       AS churn_prob_30d_pct,
            ROUND(p.churn_prob_90d * 100, 1)       AS churn_prob_90d_pct,
            p.median_survival_days,
            ROUND(p.clv_estimate::numeric, 2)      AS clv_estimate,
            ROUND(p.xgb_churn_prob * 100, 1)        AS xgb_churn_prob_pct,
            p.scored_at
        FROM predictions p
        JOIN customer_features cf ON p.customer_id::text = cf.customer_id::text
        JOIN customers c ON p.customer_id::text = c.customer_id::text
        WHERE {where}
        ORDER BY p.churn_prob_30d DESC
        LIMIT :limit
    """
    df = query_df(sql, params)
    df["scored_at"] = df["scored_at"].astype(str)
    return df.to_dict(orient="records")


@router.get("/shap")
def get_shap_importance():
    """SHAP feature importance ranking from last XGBoost run."""
    df = query_df(
        "SELECT feature, ROUND(mean_abs_shap::numeric, 4) AS mean_abs_shap, rank_order FROM shap_importance ORDER BY rank_order"
    )
    return df.to_dict(orient="records")
