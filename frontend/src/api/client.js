import axios from "axios"

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000"
})

export const fetchKPIs          = () => api.get("/api/kpis").then(r => r.data)
export const fetchSegments       = () => api.get("/api/segments").then(r => r.data)
export const fetchAtRisk         = (tier) => api.get("/api/at-risk", { params: {tier} }).then(r => r.data)
export const fetchChurnTrend     = () => api.get("/api/churn-trend").then(r => r.data)
export const fetchFeatureImport  = () => api.get("/api/feature-importance").then(r => r.data)