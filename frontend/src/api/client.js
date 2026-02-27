/**
 * src/api/client.js
 * ==================
 * Centralised API client. All components import from here.
 *
 * CONNECTS TO: FastAPI backend at VITE_API_URL (default: http://localhost:8000)
 *
 * In production (Docker), Nginx proxies /api/* to FastAPI so
 * VITE_API_URL is just "" (empty string = same origin).
 */

import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "",
  timeout: 30000,
});

// ── KPIs ────────────────────────────────────────────────────────────────────
export const fetchKPIs         = () => api.get("/api/kpis").then(r => r.data);
export const fetchChurnTrend   = () => api.get("/api/churn-trend").then(r => r.data);
export const fetchChurnCohort  = () => api.get("/api/churn-cohort").then(r => r.data);

// ── Segments ────────────────────────────────────────────────────────────────
export const fetchSegments     = () => api.get("/api/segments").then(r => r.data);
export const fetchShap         = () => api.get("/api/shap").then(r => r.data);

// ── At-risk ─────────────────────────────────────────────────────────────────
export const fetchAtRisk = (params = {}) =>
  api.get("/api/at-risk", { params }).then(r => r.data);

// ── Survival / KM ───────────────────────────────────────────────────────────
export const fetchKMCurves        = () => api.get("/api/km-curves").then(r => r.data);
export const fetchSurvivalSummary = () => api.get("/api/survival-summary").then(r => r.data);

// ── Customers ───────────────────────────────────────────────────────────────
export const fetchCustomer  = (id) => api.get(`/api/customers/${id}`).then(r => r.data);
export const searchCustomers = (params) => api.get("/api/customers", { params }).then(r => r.data);

// ── Model metrics ────────────────────────────────────────────────────────────
export const fetchModelMetrics  = () => api.get("/api/model-metrics").then(r => r.data);
export const fetchLatestMetrics = () => api.get("/api/model-metrics/latest").then(r => r.data);

// ── Ingestion ────────────────────────────────────────────────────────────────
export const fetchIngestionLog  = () => api.get("/api/ingestion-log").then(r => r.data);
export const triggerPipeline    = () => api.post("/api/pipeline/trigger").then(r => r.data);
