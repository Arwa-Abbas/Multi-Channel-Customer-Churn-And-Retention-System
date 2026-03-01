import axios from 'axios'

// All requests go to /api/ — Nginx proxies to FastAPI:8000
const api = axios.create({
  baseURL: '',
  timeout: 30000,
})

const toArray = (res) => {
  const d = res.data
  if (Array.isArray(d))            return d
  if (Array.isArray(d?.data))      return d.data
  if (Array.isArray(d?.rows))      return d.rows
  if (Array.isArray(d?.results))   return d.results
  if (Array.isArray(d?.items))     return d.items
  // If it's an object with array values, return the first array found
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    const arr = Object.values(d).find(v => Array.isArray(v))
    if (arr) return arr
  }
  if (d && typeof d === 'object') return [d]
  return []
}

const toObject = (res) => {
  const d = res.data
  if (d && typeof d === 'object' && !Array.isArray(d)) return d
  if (Array.isArray(d) && d.length > 0) return d[0]
  return {}
}

// ─── KPI endpoint ────────────────────────────────────────────────────────────
// Returns: {total_customers, churn_rate_pct, avg_clv, revenue_at_risk}
// OR:      [{total_customers,...}]  (some versions return array with 1 row)
const toKPIs = (res) => {
  const d = res.data
  if (Array.isArray(d) && d.length > 0) return d[0]
  if (d && typeof d === 'object' && !Array.isArray(d)) return d
  return {}
}

// ─── model-metrics/latest ────────────────────────────────────────────────────
// Returns: {cox:{...}, xgboost:{...}}  OR  [{model_type:'cox',...}, {...}]
const toLatestMetrics = (res) => {
  const d = res.data
  if (d && typeof d === 'object' && !Array.isArray(d)) return d
  // If array, convert to {cox:{...}, xgboost:{...}}
  if (Array.isArray(d)) {
    return d.reduce((acc, row) => {
      acc[row.model_type || row.type] = row
      return acc
    }, {})
  }
  return {}
}

// ─── km-curves ───────────────────────────────────────────────────────────────
// Returns: {"Champions":{timeline:[],survival:[],...}, ...}
const toKMCurves = (res) => {
  const d = res.data
  // Could be nested: {data: {"Champions":{...}}}
  if (d?.data && typeof d.data === 'object' && !Array.isArray(d.data)) return d.data
  if (d && typeof d === 'object' && !Array.isArray(d)) return d
  return {}
}

// ─── Exports ─────────────────────────────────────────────────────────────────
export const fetchKPIs            = () => api.get('/api/kpis').then(toKPIs)
export const fetchChurnTrend      = () => api.get('/api/churn-trend').then(toArray)
export const fetchChurnCohort     = () => api.get('/api/churn-cohort').then(toArray)
export const fetchSegments        = () => api.get('/api/segments').then(toArray)
export const fetchAtRisk          = (p) => api.get('/api/at-risk', { params: p }).then(toArray)
export const fetchShap            = () => api.get('/api/shap').then(toArray)
export const fetchKMCurves        = () => api.get('/api/km-curves').then(toKMCurves)
export const fetchSurvivalSummary = () => api.get('/api/survival-summary').then(toArray)
export const fetchModelMetrics    = () => api.get('/api/model-metrics').then(toArray)
export const fetchLatestMetrics   = () => api.get('/api/model-metrics/latest').then(toLatestMetrics)
export const fetchIngestionLog    = () => api.get('/api/ingestion-log').then(toArray)
export const triggerPipeline      = () => api.post('/api/pipeline/trigger').then(toObject)
export const searchCustomers      = (p) => api.get('/api/customers', { params: p }).then(toArray)
export const fetchCustomer        = (id) => api.get(`/api/customers/${id}`).then(toObject)