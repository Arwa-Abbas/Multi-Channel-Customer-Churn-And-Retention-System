"""
Ingest support tickets from EITHER:
  (A) Zendesk REST API  — set ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_TOKEN in .env
  (B) CSV file          — pass --csv path/to/tickets.csv

HOW IT CONNECTS:
  - Reads customers table to map external_id → UUID
  - Writes to support_tickets table (UPSERT on external_ticket_id = idempotent)
  - Logs result to ingestion_log table
  - Called daily by the Airflow DAG (airflow/dags/churn_pipeline_dag.py)

USAGE:
  python -m pipelines.ingest_tickets --source zendesk
  python -m pipelines.ingest_tickets --source csv --csv data/raw/tickets.csv
"""

import os
import time
import logging
import argparse
from datetime import datetime, date, timedelta
from typing import Optional

import httpx
import pandas as pd
from tenacity import retry, stop_after_attempt, wait_exponential
from dotenv import load_dotenv

from db.connection import query_df, execute_sql, upsert_df, engine

load_dotenv()
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)


# Zendesk Client


class ZendeskClient:
    """
    Thin Zendesk REST API client.
    Fetches tickets updated in the last N days with exponential retry.
    """

    BASE_URL = "https://{subdomain}.zendesk.com/api/v2"

    def __init__(self):
        self.subdomain = os.environ.get("ZENDESK_SUBDOMAIN", "")
        self.email = os.environ.get("ZENDESK_EMAIL", "")
        self.token = os.environ.get("ZENDESK_TOKEN", "")
        self.auth = (f"{self.email}/token", self.token)
        self.base = self.BASE_URL.format(subdomain=self.subdomain)

    @retry(
        stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=2, max=60)
    )
    def _get(self, url: str, params: dict = None) -> dict:
        """GET with automatic retry on 429 / 5xx."""
        with httpx.Client(auth=self.auth, timeout=30) as client:
            resp = client.get(url, params=params)
            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", 60))
                logger.warning(f"Rate limited. Sleeping {retry_after}s")
                time.sleep(retry_after)
                raise Exception("Rate limited — retry")
            resp.raise_for_status()
            return resp.json()

    def fetch_tickets(self, days_back: int = 1) -> list[dict]:
        """Fetch all tickets updated in the last `days_back` days."""
        start = (datetime.utcnow() - timedelta(days=days_back)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        url = f"{self.base}/incremental/tickets.json"
        params = {
            "start_time": int(
                datetime.fromisoformat(start.replace("Z", "")).timestamp()
            )
        }

        tickets = []
        while url:
            data = self._get(url, params)
            tickets.extend(data.get("tickets", []))
            # Pagination
            url = data.get("next_page") if not data.get("end_of_stream") else None
            params = {}  # next_page already has params encoded
            logger.info(f"  Fetched {len(tickets)} tickets so far...")

        return tickets

    def fetch_satisfaction_ratings(self, ticket_ids: list) -> dict:
        """Returns {ticket_id: csat_score} mapping."""
        ratings = {}
        for tid in ticket_ids:
            try:
                data = self._get(f"{self.base}/tickets/{tid}/satisfaction_rating.json")
                score_map = {"good": 5.0, "bad": 1.0, None: None}
                ratings[tid] = score_map.get(
                    data.get("satisfaction_rating", {}).get("score"), None
                )
            except Exception:
                pass
        return ratings


# Normalisation


def _normalise_zendesk(raw_tickets: list[dict], customer_map: dict) -> pd.DataFrame:
    """
    Convert raw Zendesk API ticket list to a clean DataFrame
    matching the support_tickets table schema.

    customer_map: {external_id: customer_uuid}
    """
    rows = []
    for t in raw_tickets:

        ext_id = str(t.get("external_id") or t.get("requester_id", ""))
        cust_uuid = customer_map.get(ext_id)
        if not cust_uuid:
            continue

        created = t.get("created_at")
        solved = t.get("solved_at") or t.get("updated_at")
        res_days = None
        if created and solved:
            try:
                delta = datetime.fromisoformat(
                    solved.replace("Z", "")
                ) - datetime.fromisoformat(created.replace("Z", ""))
                res_days = round(delta.total_seconds() / 86400, 1)
            except Exception:
                pass

        rows.append(
            {
                "customer_id": cust_uuid,
                "external_ticket_id": str(t["id"]),
                "ticket_date": t.get("created_at"),
                "status": t.get("status"),
                "priority": t.get("priority"),
                "resolution_days": res_days,
                "csat_score": None,  # filled separately if needed
                "sentiment_score": None,  # NLP pipeline can fill this
            }
        )
    return pd.DataFrame(rows)


def _normalise_csv(csv_path: str, customer_map: dict) -> pd.DataFrame:
    """
    Load tickets from a CSV file.
    Expected columns (flexible, mapped below):
      customer_external_id, ticket_id, created_at, status,
      priority, resolution_days, csat_score
    """
    df = pd.read_csv(csv_path, parse_dates=["created_at"])

    # Flexible column mapping
    col_map = {
        "customer_id": ["customer_external_id", "customer_id", "external_id"],
        "ticket_id": ["ticket_id", "id", "zendesk_id"],
        "ticket_date": ["created_at", "date", "ticket_date"],
        "status": ["status"],
        "priority": ["priority"],
        "resolution_days": ["resolution_days", "resolution_time_days"],
        "csat_score": ["csat_score", "satisfaction_score", "csat"],
    }

    rename = {}
    for target, candidates in col_map.items():
        for c in candidates:
            if c in df.columns:
                rename[c] = target
                break

    df = df.rename(columns=rename)

    # Map external_id → UUID
    df["customer_uuid"] = df["customer_id"].astype(str).map(customer_map)
    df = df.dropna(subset=["customer_uuid"])
    df["customer_id"] = df["customer_uuid"]

    return df[
        [
            c
            for c in [
                "customer_id",
                "ticket_id",
                "ticket_date",
                "status",
                "priority",
                "resolution_days",
                "csat_score",
            ]
            if c in df.columns
        ]
    ].rename(columns={"ticket_id": "external_ticket_id"})


# ── Main pipeline


def run_ticket_ingestion(
    source: str = "csv", csv_path: str = None, days_back: int = 1
) -> dict:
    """
    Main entry point called by Airflow DAG and CLI.
    Returns {"rows_loaded": int, "status": str}
    """
    start_time = time.time()
    run_date = date.today()

    logger.info(f"[Tickets] Starting ingestion from source={source}")

    customers_df = query_df("SELECT external_id, customer_id::text FROM customers")
    customer_map = dict(zip(customers_df["external_id"], customers_df["customer_id"]))
    logger.info(f"[Tickets] Loaded {len(customer_map)} customer mappings")

    # Fetch raw data
    if source == "zendesk":
        client = ZendeskClient()
        raw_tickets = client.fetch_tickets(days_back=days_back)
        df = _normalise_zendesk(raw_tickets, customer_map)
    elif source == "csv":
        if not csv_path:
            csv_path = "data/seeds/support_tickets_sample.csv"
        df = _normalise_csv(csv_path, customer_map)
    else:
        raise ValueError(f"Unknown source: {source}. Use 'zendesk' or 'csv'")

    if df.empty:
        logger.warning("[Tickets] No records to load")
        _log_ingestion(
            "support_tickets",
            run_date,
            0,
            0.0,
            "skipped",
            None,
            time.time() - start_time,
        )
        return {"rows_loaded": 0, "status": "skipped"}

    # Data quality check: fail if null rate on key columns > 5%
    key_cols = ["customer_id", "ticket_date"]
    null_rate = df[key_cols].isnull().mean().max()
    if null_rate > 0.05:
        msg = f"Null rate {null_rate:.2%} exceeds threshold on key columns"
        logger.error(f"[Tickets] {msg}")
        _log_ingestion(
            "support_tickets",
            run_date,
            0,
            null_rate,
            "failed",
            msg,
            time.time() - start_time,
        )
        raise ValueError(msg)

    # UPSERT — idempotent on external_ticket_id
    rows_loaded = _upsert_tickets(df)
    duration = time.time() - start_time

    _log_ingestion(
        "support_tickets",
        run_date,
        rows_loaded,
        float(null_rate),
        "success",
        None,
        duration,
    )

    logger.info(f"[Tickets] Done. {rows_loaded} rows in {duration:.1f}s")
    return {"rows_loaded": rows_loaded, "status": "success"}


def _upsert_tickets(df: pd.DataFrame) -> int:
    """
    Insert tickets. Skip duplicates via ON CONFLICT on external_ticket_id.
    This makes the pipeline idempotent (safe to re-run).
    """
    if "external_ticket_id" not in df.columns:
        df["external_ticket_id"] = None

    # Write to temp table then upsert
    df.to_sql("_tmp_tickets", engine, if_exists="replace", index=False)

    upsert_sql = """
    INSERT INTO support_tickets
        (customer_id, external_ticket_id, ticket_date, status,
         priority, resolution_days, csat_score, sentiment_score)
    SELECT
        customer_id::uuid, external_ticket_id, ticket_date::timestamptz,
        status, priority, resolution_days, csat_score, sentiment_score
    FROM _tmp_tickets
    ON CONFLICT (external_ticket_id) DO UPDATE SET
        status          = EXCLUDED.status,
        resolution_days = EXCLUDED.resolution_days,
        csat_score      = EXCLUDED.csat_score;

    DROP TABLE IF EXISTS _tmp_tickets;
    """
    return execute_sql(upsert_sql)


def _log_ingestion(source, run_date, rows, null_rate, status, error, duration):
    execute_sql(
        """
        INSERT INTO ingestion_log (source, run_date, rows_loaded, null_rate, status, error_msg, duration_sec)
        VALUES (:source, :run_date, :rows, :null_rate, :status, :error, :duration)
    """,
        {
            "source": source,
            "run_date": run_date,
            "rows": rows,
            "null_rate": null_rate,
            "status": status,
            "error": error,
            "duration": duration,
        },
    )


#  CSV Sample Generator


def generate_sample_csv(
    output_path: str = "data/seeds/support_tickets_sample.csv", n: int = 2000
):
    """Generates a realistic CSV for local development."""
    import random
    import numpy as np
    from datetime import datetime, timedelta

    customers_df = query_df("SELECT external_id FROM customers LIMIT 1000")
    ext_ids = customers_df["external_id"].tolist()

    random.seed(42)
    np.random.seed(42)

    rows = []
    for i in range(n):
        cid = random.choice(ext_ids)
        created = datetime.now() - timedelta(days=random.randint(0, 600))
        resolved = created + timedelta(days=random.randint(0, 14))
        rows.append(
            {
                "customer_external_id": cid,
                "ticket_id": f"ZD-{100000 + i}",
                "created_at": created.isoformat(),
                "status": random.choice(["solved", "closed", "open", "pending"]),
                "priority": random.choice(["low", "normal", "high", "urgent"]),
                "resolution_days": round(
                    (resolved - created).total_seconds() / 86400, 1
                ),
                "csat_score": random.choice([1.0, 3.0, 4.0, 5.0, None]),
            }
        )

    import os

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    pd.DataFrame(rows).to_csv(output_path, index=False)
    logger.info(f"[Tickets] Sample CSV written to {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="csv", choices=["zendesk", "csv"])
    parser.add_argument("--csv", default=None, help="Path to CSV file")
    parser.add_argument("--days-back", type=int, default=1)
    parser.add_argument("--gen-sample", action="store_true")
    args = parser.parse_args()

    if args.gen_sample:
        generate_sample_csv()
    else:
        run_ticket_ingestion(
            source=args.source, csv_path=args.csv, days_back=args.days_back
        )
