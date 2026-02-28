from fastapi import APIRouter, HTTPException, Query
from db.connection import query_df

router = APIRouter()


@router.get("/customers/{external_id}")
def get_customer(external_id: str):
    """Full customer profile: features + prediction + recent transactions."""
    df = query_df(
        """
        SELECT
            c.external_id, c.signup_date, c.country, c.plan_type,
            cf.rfm_tier, cf.rfm_score, cf.recency_days, cf.frequency,
            ROUND(cf.monetary::numeric, 2)             AS total_spend,
            cf.tenure_days, cf.web_sessions_30d,
            cf.ticket_count_90d,
            ROUND(p.churn_prob_30d * 100, 1)           AS churn_prob_30d_pct,
            ROUND(p.churn_prob_90d * 100, 1)           AS churn_prob_90d_pct,
            p.median_survival_days,
            ROUND(p.clv_estimate::numeric, 2)           AS clv_estimate,
            ROUND(p.xgb_churn_prob * 100, 1)            AS xgb_churn_prob_pct
        FROM customers c
        JOIN customer_features cf ON c.customer_id::text = cf.customer_id::text
        JOIN predictions p ON c.customer_id::text = p.customer_id::text
        WHERE c.external_id = :eid
    """,
        {"eid": external_id},
    )

    if df.empty:
        raise HTTPException(status_code=404, detail=f"Customer {external_id} not found")

    customer = df.iloc[0].where(df.iloc[0].notna(), None).to_dict()
    customer["signup_date"] = str(customer.get("signup_date", ""))

    # Last 10 transactions
    txns = query_df(
        """
        SELECT t.transaction_date::DATE::TEXT AS date, t.amount, t.product_category, t.channel
        FROM transactions t
        JOIN customers c ON t.customer_id::text = c.customer_id::text
        WHERE c.external_id = :eid
        ORDER BY t.transaction_date DESC
        LIMIT 10
    """,
        {"eid": external_id},
    )
    customer["recent_transactions"] = txns.to_dict(orient="records")

    return customer


@router.get("/customers")
def search_customers(
    q: str = Query("", description="Search by external_id prefix"),
    tier: str = Query(None),
    limit: int = Query(20, le=100),
):
    """Search customers by ID prefix or filter by RFM tier."""
    filters = []
    params = {"limit": limit}

    if q:
        filters.append("c.external_id ILIKE :q")
        params["q"] = f"{q}%"
    if tier:
        filters.append("cf.rfm_tier = :tier")
        params["tier"] = tier

    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    df = query_df(
        f"""
        SELECT c.external_id, c.plan_type, cf.rfm_tier,
               ROUND(p.churn_prob_30d * 100, 1) AS churn_prob_30d_pct,
               ROUND(p.clv_estimate::numeric, 2) AS clv_estimate
        FROM customers c
        JOIN customer_features cf ON c.customer_id::text = cf.customer_id::text
        JOIN predictions p ON c.customer_id::text = p.customer_id::text
        {where}
        ORDER BY p.churn_prob_30d DESC
        LIMIT :limit
    """,
        params,
    )
    return df.to_dict(orient="records")
