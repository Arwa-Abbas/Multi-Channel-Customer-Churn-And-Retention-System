import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
         ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell } from 'recharts'
import { fetchModelMetrics, fetchLatestMetrics, fetchIngestionLog } from '../api/client'
import { CheckCircle, XCircle, Clock, Database, Activity } from 'lucide-react'

const fmt = (n, d = 4) => n == null ? '—' : Number(n).toFixed(d)

export default function ModelMetrics() {
  const { data: history = [], isLoading: l1 } = useQuery({ queryKey: ['mhist'], queryFn: fetchModelMetrics })
  const { data: latest = {},  isLoading: l2 } = useQuery({ queryKey: ['mlatest'], queryFn: fetchLatestMetrics })
  const { data: logs = [],    isLoading: l3 } = useQuery({ queryKey: ['inglog'], queryFn: fetchIngestionLog })

  const coxHistory = history.filter(h => h.model_type === 'cox')
    .map(h => ({ date: h.run_date, c_index: Number(h.c_index || 0) }))
  const xgbHistory = history.filter(h => h.model_type === 'xgboost')
    .map(h => ({ date: h.run_date, auc: Number(h.roc_auc || 0), brier: Number(h.brier_score || 0) }))

  const cox = latest.cox || {}
  const xgb = latest.xgboost || {}

  const cIdx   = Number(cox.c_index || 0)
  const rocAuc = Number(xgb.roc_auc || 0)
  const brier  = Number(xgb.brier_score || 0)

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: '#221e19', border: '1px solid #332e27', borderRadius: 8, padding: '10px 14px' }}>
        <p style={{ color: '#a89880', fontSize: 11, marginBottom: 6 }}>{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color, fontSize: 12, fontFamily: 'JetBrains Mono' }}>
            {p.name}: {Number(p.value).toFixed(4)}
          </p>
        ))}
      </div>
    )
  }

  return (
    <>
      {/* Champion model cards */}
      <div className="metric-row">
        {/* Cox PH */}
        <div className="metric-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div className="metric-card-label">Cox Proportional Hazards</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                Survival analysis · Target C-index ≥ 0.70
              </div>
            </div>
            {cIdx >= 0.70
              ? <span className="panel-badge badge-green" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={11} /> PASS</span>
              : <span className="panel-badge badge-red"   style={{ display: 'flex', alignItems: 'center', gap: 4 }}><XCircle size={11} /> BELOW TARGET</span>
            }
          </div>
          <div className={`metric-card-value ${cIdx >= 0.70 ? 'pass' : cIdx >= 0.65 ? 'warn' : 'fail'}`}>
            {l2 ? '...' : fmt(cIdx)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6, marginBottom: 14 }}>
            C-index (concordance) · Run {cox.run_date || '—'}
          </div>
          <div className="metric-target-bar">
            <div className={`metric-target-fill ${cIdx >= 0.70 ? 'pass' : 'fail'}`}
              style={{ width: `${Math.min(cIdx / 0.9 * 100, 100)}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
            <span>0</span>
            <span style={{ color: 'var(--text2)' }}>Target: 0.70</span>
            <span>0.90</span>
          </div>
          {cox.run_id && (
            <div style={{ marginTop: 14, padding: '8px 12px', background: 'var(--bg3)', borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                MLflow run_id: {cox.run_id?.slice(0, 20)}...
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>
                Customers: {cox.n_customers || '—'}
              </div>
            </div>
          )}
        </div>

        {/* XGBoost */}
        <div className="metric-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div className="metric-card-label">XGBoost Classifier</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                Binary churn · Target ROC-AUC ≥ 0.78
              </div>
            </div>
            {rocAuc >= 0.78
              ? <span className="panel-badge badge-green" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={11} /> PASS</span>
              : <span className="panel-badge badge-amber" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Activity size={11} /> MONITORING</span>
            }
          </div>
          <div className={`metric-card-value ${rocAuc >= 0.78 ? 'pass' : rocAuc >= 0.70 ? 'warn' : 'fail'}`}>
            {l2 ? '...' : fmt(rocAuc)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6, marginBottom: 14 }}>
            ROC-AUC · Brier: {fmt(brier)} · Run {xgb.run_date || '—'}
          </div>
          <div className="metric-target-bar">
            <div className={`metric-target-fill ${rocAuc >= 0.78 ? 'pass' : 'fail'}`}
              style={{ width: `${Math.min(rocAuc / 0.95 * 100, 100)}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
            <span>0.5</span>
            <span style={{ color: 'var(--text2)' }}>Target: 0.78</span>
            <span>0.95</span>
          </div>
          {xgb.run_id && (
            <div style={{ marginTop: 14, padding: '8px 12px', background: 'var(--bg3)', borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                MLflow run_id: {xgb.run_id?.slice(0, 20)}...
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>
                Customers: {xgb.n_customers || '—'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* History charts */}
      <div className="chart-grid chart-grid-2">
        <div className="chart-panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Cox C-index Over Time</div>
              <div className="panel-sub">Concordance index per training run</div>
            </div>
            <span className="panel-badge badge-orange">COX PH</span>
          </div>
          {l1 ? <div className="loading-spinner"><div className="spinner" /></div> : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={coxHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#332e27" />
                <XAxis dataKey="date" tick={{ fill: '#6b5c4a', fontSize: 9 }} tickLine={false} />
                <YAxis domain={[0.5, 1.0]} tick={{ fill: '#6b5c4a', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0.70} stroke="#f5a623" strokeDasharray="4 4" label={{ value: '0.70 target', fill: '#f5a623', fontSize: 10 }} />
                <Line type="monotone" dataKey="c_index" name="C-index" stroke="#f07030" strokeWidth={2} dot={{ r: 4, fill: '#f07030' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="chart-panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">XGBoost ROC-AUC Over Time</div>
              <div className="panel-sub">Per training run</div>
            </div>
            <span className="panel-badge badge-green">XGB</span>
          </div>
          {l1 ? <div className="loading-spinner"><div className="spinner" /></div> : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={xgbHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#332e27" />
                <XAxis dataKey="date" tick={{ fill: '#6b5c4a', fontSize: 9 }} tickLine={false} />
                <YAxis domain={[0.5, 1.0]} tick={{ fill: '#6b5c4a', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0.78} stroke="#4caf7d" strokeDasharray="4 4" label={{ value: '0.78 target', fill: '#4caf7d', fontSize: 10 }} />
                <Line type="monotone" dataKey="auc" name="ROC-AUC" stroke="#4caf7d" strokeWidth={2} dot={{ r: 4, fill: '#4caf7d' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Ingestion log */}
      <div className="chart-panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">Pipeline Ingestion Log</div>
            <div className="panel-sub">Last 30 pipeline runs</div>
          </div>
          <span className="panel-badge badge-blue">LOGS</span>
        </div>
        {l3 ? <div className="loading-spinner"><div className="spinner" /></div> : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Run Date</th>
                  <th>Source</th>
                  <th>Rows</th>
                  <th>Null Rate</th>
                  <th>Duration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: 30 }}>No logs yet. Run the pipeline first.</td></tr>
                ) : logs.slice(0, 20).map((l, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ fontSize: 12 }}>{l.created_at ? new Date(l.created_at).toLocaleString() : '—'}</td>
                    <td><span className="panel-badge badge-blue">{l.source || '—'}</span></td>
                    <td className="mono">{l.rows_written ?? '—'}</td>
                    <td className="mono">{l.null_rate != null ? `${(Number(l.null_rate) * 100).toFixed(1)}%` : '—'}</td>
                    <td className="mono">{l.duration_seconds != null ? `${l.duration_seconds}s` : '—'}</td>
                    <td>
                      <span className={`log-status ${l.status === 'success' ? 'ok' : l.status === 'running' ? 'running' : 'err'}`}>
                        {l.status || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
