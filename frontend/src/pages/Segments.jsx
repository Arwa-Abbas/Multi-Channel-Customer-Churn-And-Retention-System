import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
         Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid,
         PolarAngleAxis, ScatterChart, Scatter, ZAxis } from 'recharts'
import { fetchSegments } from '../api/client'

const TIER_COLORS = {
  'Champions':           '#f07030',
  'Loyal Customers':     '#f5a623',
  'Potential Loyalists': '#4caf7d',
  'At Risk':             '#e05555',
  'Hibernating':         '#5b9bd5',
  'Lost':                '#9b7fe8',
  "Can't Lose Them":     '#e878a2',
}

const fmt = (n, d = 0) => n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d })

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#221e19', border: '1px solid #332e27', borderRadius: 8, padding: '10px 14px' }}>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || '#e8d8c4', fontSize: 13 }}>{p.name}: {fmt(p.value, 1)}</p>
      ))}
    </div>
  )
}

export default function Segments() {
  const { data: segments = [], isLoading } = useQuery({ queryKey: ['segments'], queryFn: fetchSegments })
  const [selected, setSelected] = useState(null)

  if (isLoading) return <div className="loading-spinner"><div className="spinner" /> Loading segments...</div>

  const active = selected != null ? segments[selected] : null

  const radarData = active ? [
    { metric: 'Recency',   value: Math.max(0, 100 - Number(active.avg_recency_days || 0) / 3) },
    { metric: 'Frequency', value: Math.min(100, Number(active.avg_monetary || 0) / 50) },
    { metric: 'Monetary',  value: Math.min(100, Number(active.avg_monetary || 0) / 100) },
    { metric: 'CLV',       value: Math.min(100, Number(active.avg_clv || 0) / 100) },
    { metric: 'Loyalty',   value: Math.max(0, 100 - Number(active.avg_churn_prob_30d_pct || active.avg_churn_prob_30d || 0)) },
  ] : []

  return (
    <>
      {/* Segment Cards */}
      <div className="segment-grid">
        {segments.map((s, i) => {
          const color = TIER_COLORS[s.rfm_tier] || '#a89880'
          const churnPct = Number(s.avg_churn_prob_30d_pct || s.avg_churn_prob_30d || 0)
          return (
            <div
              key={i}
              className={`segment-card ${selected === i ? 'selected' : ''}`}
              onClick={() => setSelected(selected === i ? null : i)}
              style={{ borderLeftColor: selected === i ? color : 'transparent' }}
            >
              <div className="segment-card-title">
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {s.rfm_tier}
              </div>
              <div className="segment-stat">
                <span className="segment-stat-label">Customers</span>
                <span className="segment-stat-val">{fmt(s.customer_count)}</span>
              </div>
              <div className="segment-stat">
                <span className="segment-stat-label">Avg Recency</span>
                <span className="segment-stat-val">{fmt(s.avg_recency_days, 0)}d</span>
              </div>
              <div className="segment-stat">
                <span className="segment-stat-label">Avg CLV</span>
                <span className="segment-stat-val">${fmt(s.avg_clv, 0)}</span>
              </div>
              <div className="segment-stat">
                <span className="segment-stat-label">Churn 30d</span>
                <span className="segment-stat-val" style={{ color: churnPct > 50 ? '#e05555' : churnPct > 30 ? '#f5a623' : '#4caf7d' }}>
                  {churnPct.toFixed(1)}%
                </span>
              </div>
              {/* Mini bar */}
              <div style={{ marginTop: 10 }}>
                <div style={{ height: 4, background: '#1c1814', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(churnPct, 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Charts */}
      <div className="chart-grid chart-grid-2">
        <div className="chart-panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">CLV vs Churn Risk by Segment</div>
              <div className="panel-sub">Bubble size = customer count</div>
            </div>
            <span className="panel-badge badge-orange">COMPARISON</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#332e27" />
              <XAxis dataKey="churn" name="Churn %" unit="%" tick={{ fill: '#6b5c4a', fontSize: 10 }} label={{ value: 'Churn 30d %', position: 'insideBottom', offset: -5, fill: '#6b5c4a', fontSize: 11 }} />
              <YAxis dataKey="clv" name="Avg CLV" unit="$" tick={{ fill: '#6b5c4a', fontSize: 10 }} />
              <ZAxis dataKey="count" range={[60, 400]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0]?.payload
                return (
                  <div style={{ background: '#221e19', border: '1px solid #332e27', borderRadius: 8, padding: '10px 14px' }}>
                    <p style={{ color: '#e8d8c4', fontWeight: 600, marginBottom: 4 }}>{d?.tier}</p>
                    <p style={{ color: '#a89880', fontSize: 12 }}>Churn: {d?.churn?.toFixed(1)}%</p>
                    <p style={{ color: '#a89880', fontSize: 12 }}>CLV: ${d?.clv?.toFixed(0)}</p>
                    <p style={{ color: '#a89880', fontSize: 12 }}>Count: {d?.count}</p>
                  </div>
                )
              }} />
              {segments.map((s, i) => (
                <Scatter
                  key={i}
                  name={s.rfm_tier}
                  data={[{
                    tier: s.rfm_tier,
                    churn: Number(s.avg_churn_prob_30d_pct || s.avg_churn_prob_30d || 0),
                    clv: Number(s.avg_clv || 0),
                    count: Number(s.customer_count || 0),
                  }]}
                  fill={TIER_COLORS[s.rfm_tier] || '#a89880'}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">
                {active ? `${active.rfm_tier} — Radar Profile` : 'Select a segment card to inspect'}
              </div>
              <div className="panel-sub">Normalised segment metrics</div>
            </div>
            <span className="panel-badge badge-blue">PROFILE</span>
          </div>
          {active ? (
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#332e27" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: '#a89880', fontSize: 11 }} />
                <Radar dataKey="value" stroke={TIER_COLORS[active.rfm_tier] || '#f07030'}
                  fill={TIER_COLORS[active.rfm_tier] || '#f07030'} fillOpacity={0.25} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding: 40 }}>
              <PieChart size={36} />
              <p>Click a segment card above to see its profile radar</p>
            </div>
          )}
        </div>
      </div>

      {/* Bar comparison */}
      <div className="chart-panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">Avg Monetary Value by Segment</div>
            <div className="panel-sub">Total spend per customer</div>
          </div>
          <span className="panel-badge badge-amber">MONETARY</span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={segments.map(s => ({
            tier: s.rfm_tier?.split(' ').slice(0, 2).join(' '),
            monetary: Number(s.avg_monetary || 0).toFixed(0),
            clv: Number(s.avg_clv || 0).toFixed(0),
            color: TIER_COLORS[s.rfm_tier],
          }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#332e27" />
            <XAxis dataKey="tier" tick={{ fill: '#6b5c4a', fontSize: 10 }} tickLine={false} />
            <YAxis tick={{ fill: '#6b5c4a', fontSize: 10 }} tickLine={false} axisLine={false} unit="$" />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="monetary" name="Avg Monetary $" radius={[4, 4, 0, 0]}>
              {segments.map((s, i) => <Cell key={i} fill={TIER_COLORS[s.rfm_tier] || '#f07030'} />)}
            </Bar>
            <Bar dataKey="clv" name="Avg CLV $" radius={[4, 4, 0, 0]} fill="#5b9bd5" opacity={0.6} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}
