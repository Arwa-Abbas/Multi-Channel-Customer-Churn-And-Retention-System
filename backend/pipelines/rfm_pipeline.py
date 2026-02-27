import pandas as pd
import numpy as np
from datetime import datetime
from db.connection import query_df, engine


def compute_rfm() -> pd.DataFrame:
    """Compute Recency, Frequency, Monetary from transactions table."""
    sql = """
    SELECT
        c.customer_id,
        EXTRACT(DAY FROM NOW() - MAX(t.transaction_date)) AS recency_days,
        COUNT(t.id)                                        AS frequency,
        COALESCE(SUM(t.amount), 0)                        AS monetary,
        EXTRACT(DAY FROM NOW() - c.signup_date)            AS tenure_days,
        AVG(t.amount)                                      AS avg_order_value,
        -- Web engagement in last 30 days
        COALESCE(
          (SELECT SUM(we.session_count)
           FROM web_events we
           WHERE we.customer_id = c.customer_id
             AND we.event_date >= NOW() - INTERVAL '30 days'), 0
        ) AS web_sessions_30d,
        -- Support ticket count in last 90 days
        COALESCE(
          (SELECT COUNT(*) FROM support_tickets st
           WHERE st.customer_id = c.customer_id
             AND st.ticket_date >= NOW() - INTERVAL '90 days'), 0
        ) AS ticket_count_90d,
        -- Avg resolution days
        COALESCE(
          (SELECT AVG(st.resolution_days) FROM support_tickets st
           WHERE st.customer_id = c.customer_id), 0
        ) AS avg_resolution_days
    FROM customers c
    LEFT JOIN transactions t ON c.customer_id = t.customer_id
    GROUP BY c.customer_id, c.signup_date
    """
    return query_df(sql)


def assign_scores(df: pd.DataFrame) -> pd.DataFrame:
    """Quintile-bin R, F, M into 1–5 scores. Higher = better."""
    # Recency: lower days = better = score 5
    df["r_score"] = pd.qcut(
        df["recency_days"], q=5, labels=[5, 4, 3, 2, 1], duplicates="drop"
    ).astype(int)
    # Frequency: higher = better = score 5
    df["f_score"] = pd.qcut(
        df["frequency"].rank(method="first"),
        q=5,
        labels=[1, 2, 3, 4, 5],
        duplicates="drop",
    ).astype(int)
    # Monetary: higher = better
    df["m_score"] = pd.qcut(
        df["monetary"].rank(method="first"),
        q=5,
        labels=[1, 2, 3, 4, 5],
        duplicates="drop",
    ).astype(int)
    df["rfm_score"] = df["r_score"] * 100 + df["f_score"] * 10 + df["m_score"]
    return df


def assign_tier(row) -> str:
    r, f, m = row["r_score"], row["f_score"], row["m_score"]
    if r >= 4 and f >= 4:
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


def run_rfm_pipeline():
    print("[RFM] Computing base metrics...")
    df = compute_rfm()
    df = assign_scores(df)
    df["rfm_tier"] = df.apply(assign_tier, axis=1)
    df["churn_flag"] = df["recency_days"] > 90
    df["updated_at"] = datetime.now()

    print(f"[RFM] Writing {len(df)} customer features to DB...")
    df.to_sql(
        "customer_features", engine, if_exists="replace", index=False, chunksize=500
    )
    print("[RFM] Done!")
    print(df["rfm_tier"].value_counts().to_string())
    return df


if __name__ == "__main__":
    run_rfm_pipeline()
