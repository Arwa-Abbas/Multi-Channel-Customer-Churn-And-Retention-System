"""
Single source of truth for every database connection in the backend.

HOW IT CONNECTS:
    - Reads DATABASE_URL from environment (set in .env or docker-compose).
    - SQLAlchemy engine is created once at module load (connection pooled).
    - FastAPI routes use get_db() as a Depends() injection.
    - Pipelines and models use query_df() / execute_sql() directly.

USED BY:
    backend/api/*.py          → get_db() for session-based queries
    backend/pipelines/*.py    → query_df() + execute_sql() for bulk ops
    backend/models/*.py       → query_df() to load training data
"""

import os
import logging
from contextlib import contextmanager

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text, event
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool

load_dotenv()

logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://churnapp:password123@localhost:5432/churndb"
)


# ── Engine ─────────────────────────────────────────────────────────────────
# pool_size=10, max_overflow=20 handles concurrent FastAPI requests.
# NullPool used for Airflow workers (each task gets its own connection).
def _make_engine(poolclass=None):
    kwargs = dict(
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,  # auto-reconnect on stale connections
        pool_recycle=3600,  # recycle connections hourly
        echo=False,
    )
    if poolclass:
        kwargs = {"poolclass": poolclass, "pool_pre_ping": True}
    return create_engine(DATABASE_URL, **kwargs)


engine = _make_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ── FastAPI Dependency ─────────────────────────────────────────────────────
def get_db():
    """
    Yield a SQLAlchemy Session for FastAPI route injection.

    Usage in routes:
        @router.get("/example")
        def my_route(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ── Pipeline helpers ───────────────────────────────────────────────────────
def query_df(sql: str, params: dict = None) -> pd.DataFrame:
    """
    Run a SQL SELECT and return a Pandas DataFrame.
    Used by all pipeline and model scripts.

    Example:
        df = query_df("SELECT * FROM customer_features WHERE rfm_tier = :tier",
                      {"tier": "At Risk"})
    """
    with engine.connect() as conn:
        result = pd.read_sql(text(sql), conn, params=params or {})
    return result


def execute_sql(sql: str, params: dict = None) -> int:
    """
    Execute a DML statement (INSERT/UPDATE/DELETE/TRUNCATE).
    Returns rowcount.

    Example:
        execute_sql("UPDATE predictions SET model_version = :v WHERE 1=1",
                    {"v": "cox-v2"})
    """
    with engine.begin() as conn:
        result = conn.execute(text(sql), params or {})
        return result.rowcount


def upsert_df(
    df: pd.DataFrame, table: str, if_exists: str = "replace", chunksize: int = 500
) -> int:
    """
    Write a DataFrame to a table. if_exists='replace' truncates first.
    Returns number of rows written.
    """
    df.to_sql(
        table,
        engine,
        if_exists=if_exists,
        index=False,
        chunksize=chunksize,
        method="multi",
    )
    logger.info(f"[DB] Wrote {len(df)} rows to {table}")
    return len(df)


@contextmanager
def get_connection():
    """Context manager for raw connection (used in ingestion pipelines)."""
    with engine.begin() as conn:
        yield conn


def health_check() -> bool:
    """Returns True if database is reachable."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.error(f"[DB] Health check failed: {e}")
        return False
