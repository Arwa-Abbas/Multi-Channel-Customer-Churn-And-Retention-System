import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
         ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell } from 'recharts'
import { fetchKMCurves, fetchSurvivalSummary } from '../api/client'
import { TrendingUp, Clock } from 'lucide-react'

const COLORS = ['#f07030','#f5a623','#4caf7d','#e05555','#5b9bd5','#9b7fe8','#e878a2']

const fmt = (n, d = 0) => n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d })

// API fields from api/survival.py get_survival_summary():
//   rfm_tier, customer_count, avg_median_survival (NOT median_survival_days),
//   avg_churn_prob_30d_pct (already ×100, NOT avg_churn_prob_30d), avg_clv

export default function SurvivalPage() {
  const { data: kmRaw = {},   isLoading: l1 } = useQuery({ queryKey: ['km'],       queryFn: fetchKMCurves })
  const { data: summary = [], isLoading: l2 } = useQuery({ queryKey: ['surv-sum'], queryFn: fetchSurvivalSummary })
  const [hidden, setHidden] = useState(new Set())

  const tiers  = Object.keys(kmRaw)
  const colors = Object.fromEntries(tiers.map((t, i) => [t, COLORS[i % COLORS.length]]))

  // Build merged time-series for recharts from KM data
  const allTimes = [...new Set(tiers.flatMap(t => kmRaw[t]?.timeline || []))].sort((a,b) => a-b)
  const merged = allTimes.slice(0, 200).map(t => {
    const row = { time: Math.round(t) }
    tiers.forEach(tier => {
      const d = kmRaw[tier]
      if (!d) return
      const idx = d.timeline.findIndex((v, ii) => v <= t && (ii === d.timeline.length - 1 || d.timeline[ii+1] > t))
      row[tier] = idx >= 0 ? Number(d.survival[idx] * 100).toFixed(1) : null
    })
    return row
  })

  const toggleTier = (t) => setHidden(prev => {
    const s = new Set(prev)
    s.has(t) ? s.delete(t) : s.add(t)
    return s
  })

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: '#221e19', border: '1px solid #332e27', borderRadius: 8, padding: '10px 14px' }}>
        <p style={{ color: '#a89880', fontSize: 11, marginBottom: 6 }}>Day {label}</p>
        {payload.filter(p => p.value != null).map((p, i) => (
          <p key={i} style={{ color: p.color, fontSize: 12, fontFamily: 'JetBrains Mono' }}>
            {p.dataKey}: {p.value}%
          </p>
        ))}
      </div>
    )
  }

  return (
    <>
      {/* Summary KPI cards — use avg_median_survival, avg_churn_prob_30d_pct */}
      {!l2 && summary.length > 0 && (
        <div className="kpi-grid" style={{ gridTemplateColumns: `repeat(${Math.min(summary.length, 4)}, 1fr)`, marginBottom: 20 }}>
          {summary.slice(0, 4).map((s, i) => (
            <div key={i} className="kpi-card" style={{ borderTop: `3px solid ${COLORS[i]}` }}>
              <div className="kpi-label"><Clock size={12} /> {s.rfm_tier}</div>
              {/* avg_median_survival is the correct field from survival-summary */}
              <div className="kpi-value" style={{ fontSize: 26, color: COLORS[i] }}>
                {Number(s.avg_median_survival) > 0 ? `${s.avg_median_survival}d` : '∞'}
              </div>
              {/* avg_churn_prob_30d_pct is already ×100 */}
              <div className="kpi-sub">
                Median survival · {Number(s.avg_churn_prob_30d_pct || 0).toFixed(1)}% churn 30d
              </div>
            </div>
          ))}
        </div>
      )}

      {/* KM Curves */}
      <div className="chart-panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">Kaplan-Meier Survival Curves</div>
            <div className="panel-sub">P(customer still active) over time — by RFM tier</div>
          </div>
          <span className="panel-badge badge-green">SURVIVAL</span>
        </div>

        <div className="km-legend">
          {tiers.map(t => (
            <div
              key={t}
              className={`km-legend-item ${hidden.has(t) ? 'off' : ''}`}
              onClick={() => toggleTier(t)}
            >
              <div className="km-legend-dot" style={{ background: colors[t] }} />
              {t}
            </div>
          ))}
        </div>

        {l1 ? (
          <div className="loading-spinner"><div className="spinner" /></div>
        ) : tiers.length === 0 ? (
          <div className="empty-state">
            <TrendingUp size={40} />
            <p>No survival data yet. Run the pipeline first to generate K-M curves.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={merged}>
              <CartesianGrid strokeDasharray="3 3" stroke="#332e27" />
              <XAxis dataKey="time" tick={{ fill: '#6b5c4a', fontSize: 10 }} tickLine={false}
                label={{ value: 'Days since acquisition', position: 'insideBottom', offset: -5, fill: '#6b5c4a', fontSize: 11 }} />
              <YAxis domain={[0, 100]} unit="%" tick={{ fill: '#6b5c4a', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={50} stroke="#6b5c4a" strokeDasharray="4 4"
                label={{ value: '50% (median)', fill: '#6b5c4a', fontSize: 10 }} />
              {tiers.filter(t => !hidden.has(t)).map(t => (
                <Line key={t} type="stepAfter" dataKey={t} stroke={colors[t]} strokeWidth={2} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Median survival bar + summary table */}
      <div className="chart-grid chart-grid-2">
        <div className="chart-panel">
          <div className="panel-header">
            <div><div className="panel-title">Median Survival Days by Tier</div><div className="panel-sub">Days until 50% have churned</div></div>
            <span className="panel-badge badge-amber">MEDIAN</span>
          </div>
          {l2 ? <div className="loading-spinner"><div className="spinner" /></div> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={summary.filter(s => Number(s.avg_median_survival) > 0).map((s, i) => ({
                tier: (s.rfm_tier || '').split(' ').slice(0, 2).join(' '),
                days: Number(s.avg_median_survival || 0),  // correct field name
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#332e27" />
                <XAxis dataKey="tier" tick={{ fill: '#6b5c4a', fontSize: 9 }} tickLine={false} />
                <YAxis tick={{ fill: '#6b5c4a', fontSize: 10 }} tickLine={false} axisLine={false} unit="d" />
                <Tooltip contentStyle={{ background: '#221e19', border: '1px solid #332e27', borderRadius: 8 }} itemStyle={{ color: '#e8d8c4' }} />
                <Bar dataKey="days" name="Median Survival" radius={[4,4,0,0]}>
                  {summary.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="chart-panel">
          <div className="panel-header">
            <div><div className="panel-title">Survival Summary Table</div></div>
            <span className="panel-badge badge-blue">TABLE</span>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Tier</th><th>Median Days</th><th>Churn 30d</th><th>Avg CLV</th></tr>
              </thead>
              <tbody>
                {summary.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text3)', padding: 24 }}>No data yet.</td></tr>
                ) : summary.map((s, i) => (
                  <tr key={i}>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                        {s.rfm_tier}
                      </span>
                    </td>
                    {/* avg_median_survival is correct column name from SQL */}
                    <td className="mono">{Number(s.avg_median_survival) > 0 ? `${s.avg_median_survival}d` : '∞'}</td>
                    {/* avg_churn_prob_30d_pct already ×100 */}
                    <td className="mono" style={{ color: Number(s.avg_churn_prob_30d_pct) > 50 ? '#e05555' : '#4caf7d' }}>
                      {Number(s.avg_churn_prob_30d_pct || 0).toFixed(1)}%
                    </td>
                    <td className="mono">${fmt(s.avg_clv, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
