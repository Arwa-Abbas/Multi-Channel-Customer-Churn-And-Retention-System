"""
Computes RFM scores, assigns segment tiers, and populates customer_features.

HOW IT WORKS:
  1. Pulls raw transaction + web + ticket data from PostgreSQL
  2. Computes Recency / Frequency / Monetary per customer (all in SQL)
  3. Quintile-bins each dimension into 1–5 scores (Pandas)
  4. Assigns named tier (Champions, At Risk, etc.) via rule matrix
  5. Writes full feature vector to customer_features (used by models)
  6. Logs run to ingestion_log

CONNECTS TO:
  ← transactions, web_events, support_tickets, customers (read)
  → customer_features (write/replace)
  → ingestion_log (write)

CALLED BY:
  airflow/dags/churn_pipeline_dag.py  (task: rfm_pipeline)
  CLI: python -m pipelines.rfm_pipeline
"""

import time
import logging
from datetime import date

import pandas as pd
import numpy as np

from db.connection import query_df, execute_sql, upsert_df

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

# Tier encoding for Cox PH model (ordinal: best=6, worst=1)
TIER_ENCODING = {
    "Champions": 6,
    "Loyal Customers": 5,
    "Potential Loyalists": 4,
    "At Risk": 3,
    "Can't Lose Them": 3,
    "Hibernating": 2,
    "Lost": 1,
}


def _fetch_base_metrics() -> pd.DataFrame:
    """
    Single SQL query to pull all raw aggregations per customer.
    Runs entirely in PostgreSQL — fast even at 1M+ customers.
    """
    sql = """
    WITH txn_agg AS (
        SELECT
            customer_id,
            EXTRACT(DAY FROM NOW() - MAX(transaction_date))::INT  AS recency_days,
            COUNT(*)::INT                                          AS frequency,
            COALESCE(SUM(amount), 0)                              AS monetary,
            COALESCE(AVG(amount), 0)                              AS avg_order_value,
            COUNT(CASE WHEN transaction_date >= NOW() - INTERVAL '90 days' THEN 1 END)::INT
                                                                   AS frequency_90d
        FROM transactions
        WHERE is_refund = FALSE
        GROUP BY customer_id
    ),
    web_agg AS (
        SELECT
            customer_id,
            COALESCE(SUM(CASE WHEN event_date >= NOW()::DATE - 30 THEN session_count END), 0)::INT
                AS web_sessions_30d
        FROM web_events
        GROUP BY customer_id
    ),
    ticket_agg AS (
        SELECT
            customer_id,
            COUNT(CASE WHEN ticket_date >= NOW() - INTERVAL '90 days' THEN 1 END)::INT
                AS ticket_count_90d,
            COALESCE(AVG(resolution_days), 0)  AS avg_resolution_days
        FROM support_tickets
        GROUP BY customer_id
    )
    SELECT
        c.customer_id::TEXT AS customer_id,
        EXTRACT(DAY FROM NOW() - c.signup_date)::INT AS tenure_days,
        COALESCE(t.recency_days, 999)          AS recency_days,
        COALESCE(t.frequency, 0)               AS frequency,
        COALESCE(t.monetary, 0)                AS monetary,
        COALESCE(t.avg_order_value, 0)         AS avg_order_value,
        COALESCE(t.frequency_90d, 0)           AS frequency_90d,
        COALESCE(w.web_sessions_30d, 0)        AS web_sessions_30d,
        COALESCE(tk.ticket_count_90d, 0)       AS ticket_count_90d,
        COALESCE(tk.avg_resolution_days, 0)    AS avg_resolution_days
    FROM customers c
    LEFT JOIN txn_agg   t  USING (customer_id)
    LEFT JOIN web_agg   w  USING (customer_id)
    LEFT JOIN ticket_agg tk USING (customer_id)
    """
    return query_df(sql)


def _assign_rfm_scores(df: pd.DataFrame) -> pd.DataFrame:
    """
    Quintile-bin R, F, M into 1–5 integer scores.
    Handles duplicate bin edges with 'drop' (merges near-empty bins).
    """
    # Recency: lower days = more recent = BETTER = score 5
    df["r_score"] = pd.qcut(
        df["recency_days"], q=5, labels=[5, 4, 3, 2, 1], duplicates="drop"  # inverted
    ).astype(int)

    # Frequency: higher = better = score 5
    df["f_score"] = pd.qcut(
        df["frequency"].rank(method="first"),
        q=5,
        labels=[1, 2, 3, 4, 5],
        duplicates="drop",
    ).astype(int)

    # Monetary: higher = better = score 5
    df["m_score"] = pd.qcut(
        df["monetary"].rank(method="first"),
        q=5,
        labels=[1, 2, 3, 4, 5],
        duplicates="drop",
    ).astype(int)

    # Composite score: 3-digit int (e.g. 543 = R5, F4, M3)
    df["rfm_score"] = df["r_score"] * 100 + df["f_score"] * 10 + df["m_score"]
    return df


def _assign_tier(row: pd.Series) -> str:
    """
    Rule-based tier assignment from R/F/M scores.
    Based on the PRD segment table.
    """
    r, f, m = int(row["r_score"]), int(row["f_score"]), int(row["m_score"])

    if r >= 4 and f >= 4 and m >= 4:
        return "Champions"
    elif r >= 3 and f >= 3:
        return "Loyal Customers"
    elif r >= 3 and f >= 1:
        return "Potential Loyalists"
    elif r == 2 and f >= 2:
        return "At Risk"
    elif r <= 2 and f <= 2 and m >= 3:
        return "Can't Lose Them"
    elif r == 2:
        return "Hibernating"
    else:
        return "Lost"


def _compute_churn_flag(df: pd.DataFrame, threshold_days: int = 90) -> pd.DataFrame:
    """
    churn_flag = True if no transaction in the last threshold_days.
    duration_days = time from signup to churn or today (for Cox model).
    """
    df["churn_flag"] = df["recency_days"] > threshold_days

    # Duration: if churned, use recency as proxy for time-to-churn
    # If still active, use tenure (right-censored observation)
    df["duration_days"] = np.where(
        df["churn_flag"],
        df["recency_days"].clip(upper=365),  # cap at 1yr to bound model
        df["tenure_days"],
    )
    return df


def run_rfm_pipeline() -> dict:
    """
    Main entry point. Returns {"rows_written": int, "tier_counts": dict}.
    """
    start = time.time()
    logger.info("[RFM] Starting pipeline...")

    df = _fetch_base_metrics()
    logger.info(f"[RFM] Loaded {len(df)} customers")

    # Validate data quality
    null_rate = df[["recency_days", "monetary"]].isnull().mean().max()
    if null_rate > 0.05:
        raise ValueError(f"Null rate {null_rate:.2%} exceeds 5% threshold")

    df = _assign_rfm_scores(df)
    df["rfm_tier"] = df.apply(_assign_tier, axis=1)
    df["rfm_tier_encoded"] = df["rfm_tier"].map(TIER_ENCODING).fillna(1).astype(int)
    df = _compute_churn_flag(df)
    df["updated_at"] = pd.Timestamp.utcnow()

    # Select exactly the columns in customer_features table
    feature_cols = [
        "customer_id",
        "recency_days",
        "frequency",
        "monetary",
        "r_score",
        "f_score",
        "m_score",
        "rfm_score",
        "rfm_tier",
        "rfm_tier_encoded",
        "tenure_days",
        "avg_order_value",
        "web_sessions_30d",
        "ticket_count_90d",
        "avg_resolution_days",
        "frequency_90d",
        "churn_flag",
        "duration_days",
        "updated_at",
    ]
    out_df = df[feature_cols].copy()

    # Write to DB
    rows = upsert_df(out_df, "customer_features", if_exists="replace")

    # Tier distribution summary
    tier_counts = df["rfm_tier"].value_counts().to_dict()
    duration = time.time() - start

    logger.info(f"[RFM] Wrote {rows} rows in {duration:.1f}s")
    logger.info("[RFM] Tier distribution:")
    for tier, cnt in sorted(tier_counts.items(), key=lambda x: -x[1]):
        logger.info(f"  {tier:25s} {cnt:>6}")

    # Log to ingestion_log
    execute_sql(
        """
        INSERT INTO ingestion_log (source, run_date, rows_loaded, null_rate, status, duration_sec)
        VALUES ('rfm_pipeline', :run_date, :rows, :null_rate, 'success', :dur)
    """,
        {
            "run_date": date.today(),
            "rows": rows,
            "null_rate": float(null_rate),
            "dur": duration,
        },
    )

    return {"rows_written": rows, "tier_counts": tier_counts}


if __name__ == "__main__":
    result = run_rfm_pipeline()
    print(result)
