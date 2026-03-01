"""
==========================================
Mounts all API routers. Serves the React frontend in production.

RUNS ON: uvicorn main:app --host 0.0.0.0 --port 8000

ROUTES MOUNTED:
  /api/kpis           → kpi summary cards
  /api/segments       → RFM segment breakdown
  /api/at-risk        → filterable at-risk customer list
  /api/churn-trend    → monthly active + revenue trend
  /api/survival       → Cox PH survival curves per tier (for React)
  /api/km-curves      → Kaplan-Meier curves per RFM tier
  /api/shap           → SHAP feature importance
  /api/customers      → customer detail lookup
  /api/metrics        → model performance history
  /health             → liveness probe (used by Docker)
"""

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from api import kpis, segments, customers, survival, metrics, ingestion
from db.connection import health_check

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Churn & Retention System API",
    description="Multi-channel churn prediction with RFM + Survival Analysis",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Docker frontend
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)


# ── Routers ─────────────────────────────────────────────────────────────────
app.include_router(kpis.router, prefix="/api", tags=["KPIs"])
app.include_router(segments.router, prefix="/api", tags=["Segments"])
app.include_router(customers.router, prefix="/api", tags=["Customers"])
app.include_router(survival.router, prefix="/api", tags=["Survival"])
app.include_router(metrics.router, prefix="/api", tags=["Model Metrics"])
app.include_router(ingestion.router, prefix="/api", tags=["Ingestion"])


# ── Health ──────────────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
def health():
    db_ok = health_check()
    return {
        "status": "ok" if db_ok else "degraded",
        "database": "connected" if db_ok else "unreachable",
    }


@app.get("/", tags=["System"])
def root():
    return {"message": "Churn & Retention API", "docs": "/docs"}
