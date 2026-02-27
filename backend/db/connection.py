import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
import pandas as pd

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# SQLAlchemy engine — pool_size handles concurrent API requests
engine = create_engine(DATABASE_URL, pool_size=10, max_overflow=20, echo=False)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency — yields a DB session and closes it after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def query_df(sql: str, params: dict = None) -> pd.DataFrame:
    """Run a SQL query and return a Pandas DataFrame. Use for pipelines."""
    with engine.connect() as conn:
        return pd.read_sql(text(sql), conn, params=params)


def execute_sql(sql: str, params: dict = None):
    """Execute DML (INSERT/UPDATE/DELETE) statements."""
    with engine.begin() as conn:
        conn.execute(text(sql), params or {})
