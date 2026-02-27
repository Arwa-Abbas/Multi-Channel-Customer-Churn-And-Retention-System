from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from db.connection import query_df

app = FastAPI(title="Churn Retention API", version="1.0.0")

# Allow React dev server to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


# ── KPI summary cards ──────────────────────────────────
@app.get("/api/kpis")
def get_kpis():
    df = query_df(
        """
        SELECT
          COUNT(*) AS total_customers,
          ROUND(AVG(CASE WHEN churn_flag THEN 1.0 ELSE 0 END) * 100, 1) AS churn_rate_pct,
          ROUND(AVG(p.clv_estimate)::numeric, 2) AS avg_clv,
          ROUND(SUM(CASE WHEN churn_flag THEN p.clv_estimate ELSE 0 END)::numeric, 2) AS revenue_at_risk
        FROM customer_features cf
        JOIN predictions p USING (customer_id)
    """
    )
    return df.iloc[0].to_dict()


# ── RFM segment distribution ───────────────────────────
@app.get("/api/segments")
def get_segments():
    df = query_df(
        """
        SELECT rfm_tier, COUNT(*) AS count,
               ROUND(AVG(monetary)::numeric, 2) AS avg_monetary,
               ROUND(AVG(recency_days)::numeric, 1) AS avg_recency
        FROM customer_features
        GROUP BY rfm_tier
        ORDER BY count DESC
    """
    )
    return df.to_dict(orient="records")


# ── At-risk customer list ──────────────────────────────
@app.get("/api/at-risk")
def get_at_risk(limit: int = Query(50, le=500), tier: str = Query(None)):
    tier_filter = "AND cf.rfm_tier = :tier" if tier else ""
    df = query_df(
        f"""
        SELECT c.external_id, cf.rfm_tier,
               p.churn_prob_30d, p.churn_prob_90d,
               p.median_survival_days, p.clv_estimate,
               cf.recency_days, cf.frequency, cf.monetary
        FROM predictions p
        JOIN customer_features cf USING (customer_id)
        JOIN customers c USING (customer_id)
        WHERE p.churn_prob_30d > 0.4
        {tier_filter}
        ORDER BY p.churn_prob_30d DESC
        LIMIT :limit
    """,
        {"limit": limit, "tier": tier},
    )
    return df.to_dict(orient="records")


# ── Churn rate trend (last 12 months) ──────────────────
@app.get("/api/churn-trend")
def get_churn_trend():
    df = query_df(
        """
        SELECT DATE_TRUNC('month', transaction_date) AS month,
               COUNT(DISTINCT t.customer_id) AS active_customers
        FROM transactions t
        WHERE transaction_date >= NOW() - INTERVAL '12 months'
        GROUP BY 1 ORDER BY 1
    """
    )
    df["month"] = df["month"].astype(str)
    return df.to_dict(orient="records")


# ── SHAP feature importance ────────────────────────────
@app.get("/api/feature-importance")
def get_feature_importance():
    df = query_df("SELECT * FROM shap_importance ORDER BY mean_abs_shap DESC")
    return df.to_dict(orient="records")
