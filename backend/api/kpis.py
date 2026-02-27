from fastapi import APIRouter, Query
from db.connection import query_df

router = APIRouter()


@router.get("/kpis")
def get_kpis():
    """
    Executive KPI cards for dashboard hero row.
    Returns: total_customers, churn_rate_pct, avg_clv, revenue_at_risk,
             avg_30d_churn_prob_pct, snapshot_date
    """
    df = query_df("SELECT * FROM vw_kpi_summary")
    if df.empty:
        return {}
    row = df.iloc[0].where(df.iloc[0].notna(), None)
    return row.to_dict()


@router.get("/churn-trend")
def get_churn_trend():
    """
    Monthly active customers + revenue for line chart.
    Returns last 13 months (enough for 12-month YoY comparison).
    """
    df = query_df("SELECT * FROM vw_monthly_active_trend")
    df["month"] = df["month"].astype(str)
    return df.to_dict(orient="records")


@router.get("/churn-cohort")
def get_churn_cohort():
    """Signup month cohort churn rates — for heatmap or table in PowerBI."""
    df = query_df("SELECT * FROM vw_churn_cohort")
    df["cohort_month"] = df["cohort_month"].astype(str)
    return df.to_dict(orient="records")
