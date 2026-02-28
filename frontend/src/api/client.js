import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 30000,
})

// Safe array extractor — root cause of n?.map is not a function
// API sometimes returns {data:[...]}, sometimes [...], sometimes {rows:[...]}
const toArray = (res) => {
  const d = res.data
  if (Array.isArray(d))       return d
  if (Array.isArray(d?.data)) return d.data
  if (Array.isArray(d?.rows)) return d.rows
  if (d && typeof d === 'object') {
    const first = Object.values(d).find(v => Array.isArray(v))
    if (first) return first
  }
  return []
}

const toObject = (res) => {
  const d = res.data
  if (d && typeof d === 'object' && !Array.isArray(d)) return d
  return {}
}

export const fetchKPIs          = () => api.get('/api/kpis').then(toObject)
export const fetchChurnTrend    = () => api.get('/api/churn-trend').then(toArray)
export const fetchChurnCohort   = () => api.get('/api/churn-cohort').then(toArray)
export const fetchSegments      = () => api.get('/api/segments').then(toArray)
export const fetchAtRisk        = (params) => api.get('/api/at-risk', { params }).then(toArray)
export const fetchShap          = () => api.get('/api/shap').then(toArray)
export const fetchKMCurves      = () => api.get('/api/km-curves').then(toObject)
export const fetchSurvivalSummary = () => api.get('/api/survival-summary').then(toArray)
export const fetchModelMetrics  = () => api.get('/api/model-metrics').then(toArray)
export const fetchLatestMetrics = () => api.get('/api/model-metrics/latest').then(toObject)
export const fetchIngestionLog  = () => api.get('/api/ingestion-log').then(toArray)
export const triggerPipeline    = () => api.post('/api/pipeline/trigger').then(toObject)
export const searchCustomers    = (params) => api.get('/api/customers', { params }).then(toArray)
export const fetchCustomer      = (id) => api.get(`/api/customers/${id}`).then(toObject)
