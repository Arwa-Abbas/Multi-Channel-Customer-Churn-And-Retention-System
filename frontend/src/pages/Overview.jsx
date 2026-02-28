import { useQuery } from '@tanstack/react-query'
import { Users, TrendingDown, DollarSign, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { fetchKPIs, fetchChurnTrend, fetchSegments, fetchShap } from '../api/client'

const TIER_COLORS = {
  'Champions':           '#f07030',
  'Loyal Customers':     '#f5a623',
  'Potential Loyalists': '#4caf7d',
  'At Risk':             '#e05555',
  'Hibernating':         '#5b9bd5',
  'Lost':                '#9b7fe8',
  'Can\'t Lose Them':    '#e878a2',
}

const fmt = (n, decimals = 0) => {
  if (n == null) return '—'
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: decimals })
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#221e19', border: '1px solid #332e27', borderRadius: 8, padding: '10px 14px' }}>
      <p style={{ color: '#a89880', fontSize: 11, marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, fontSize: 13, fontFamily: 'JetBrains Mono' }}>
          {p.name}: {fmt(p.value, 0)}
        </p>
      ))}
    </div>
  )
}

export default function Overview() {
  const { data: kpis = {},     isLoading: l1 } = useQuery({ queryKey: ['kpis'],     queryFn: fetchKPIs })
  const { data: trend = [],    isLoading: l2 } = useQuery({ queryKey: ['trend'],    queryFn: fetchChurnTrend })
  const { data: segments = [], isLoading: l3 } = useQuery({ queryKey: ['segments'], queryFn: fetchSegments })
  const { data: shap = [],     isLoading: l4 } = useQuery({ queryKey: ['shap'],     queryFn: fetchShap })

  const kpiCards = [
    {
      label: 'Total Customers',
      value: fmt(kpis.total_customers),
      sub: 'Active in database',
      accent: 'orange',
      Icon: Users,
    },
    {
      label: 'Churn Rate',
      value: kpis.churn_rate_pct != null ? `${Number(kpis.churn_rate_pct).toFixed(1)}%` : '—',
      sub: 'Last 90 days',
      accent: 'red',
      Icon: TrendingDown,
    },
    {
      label: 'Avg CLV',
      value: kpis.avg_clv != null ? `$${fmt(kpis.avg_clv, 0)}` : '—',
      sub: 'Customer lifetime value',
      accent: 'green',
      Icon: DollarSign,
    },
    {
      label: 'Revenue at Risk',
      value: kpis.revenue_at_risk != null ? `$${fmt(kpis.revenue_at_risk)}` : '—',
      sub: 'From at-risk customers',
      accent: 'amber',
      Icon: AlertCircle,
    },
  ]

  const pieData = segments.map(s => ({
    name: s.rfm_tier,
    value: Number(s.customer_count || 0),
  }))

  const shapData = shap.slice(0, 10).map(s => ({
    feature: s.feature?.replace(/_/g, ' '),
    shap: Number(s.mean_abs_shap || 0).toFixed(4),
  })).reverse()

  const trendData = trend.map(t => ({
    month: t.month || t.period,
    customers: Number(t.active_customers || 0),
    revenue: Number(t.total_revenue || 0),
    churned: Number(t.churned_customers || 0),
  }))

  return (
    <>
      {/* KPI Cards */}
      <div className="kpi-grid">
        {kpiCards.map(({ label, value, sub, accent, Icon }) => (
          <div key={label} className={`kpi-card ${accent}`}>
            <div className="kpi-icon"><Icon size={40} /></div>
            <div className="kpi-label">
              <Icon size={12} /> {label}
            </div>
            <div className="kpi-value">{l1 ? '...' : value}</div>
            <div className="kpi-sub">{sub}</div>
          </div>
        ))}
      </div>

      {/* Trend + Donut */}
      <div className="chart-grid chart-grid-3" style={{ marginBottom: 16 }}>
        <div className="chart-panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Monthly Active Customers & Revenue</div>
              <div className="panel-sub">13-month rolling trend</div>
            </div>
            <span className="panel-badge badge-orange">TREND</span>
          </div>
          {l2 ? <div className="loading-spinner"><div className="spinner" /></div> : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f07030" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f07030" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#4caf7d" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4caf7d" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#332e27" />
                <XAxis dataKey="month" tick={{ fill: '#6b5c4a', fontSize: 10 }} tickLine={false} />
                <YAxis yAxisId="l" tick={{ fill: '#6b5c4a', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="r" orientation="right" tick={{ fill: '#6b5c4a', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area yAxisId="l" type="monotone" dataKey="customers" stroke="#f07030" strokeWidth={2} fill="url(#gc)" name="Customers" />
                <Area yAxisId="r" type="monotone" dataKey="revenue"   stroke="#4caf7d" strokeWidth={2} fill="url(#gr)"  name="Revenue $" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="chart-panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">RFM Segment Mix</div>
              <div className="panel-sub">Customer distribution</div>
            </div>
            <span className="panel-badge badge-amber">SEGMENTS</span>
          </div>
          {l3 ? <div className="loading-spinner"><div className="spinner" /></div> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  paddingAngle={3} dataKey="value">
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={TIER_COLORS[entry.name] || '#6b5c4a'} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [fmt(v), 'Customers']}
                  contentStyle={{ background: '#221e19', border: '1px solid #332e27', borderRadius: 8 }}
                  itemStyle={{ color: '#e8d8c4' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {pieData.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#a89880' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: TIER_COLORS[d.name] || '#6b5c4a', flexShrink: 0 }} />
                {d.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SHAP + Churn by Segment */}
      <div className="chart-grid chart-grid-2">
        <div className="chart-panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">SHAP Feature Importance</div>
              <div className="panel-sub">Mean absolute SHAP value (XGBoost)</div>
            </div>
            <span className="panel-badge badge-blue">EXPLAINABILITY</span>
          </div>
          {l4 ? <div className="loading-spinner"><div className="spinner" /></div> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={shapData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#332e27" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#6b5c4a', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="feature" tick={{ fill: '#a89880', fontSize: 11 }} tickLine={false} width={110} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="shap" name="SHAP" radius={[0, 4, 4, 0]}>
                  {shapData.map((_, i) => (
                    <Cell key={i} fill={i === shapData.length - 1 ? '#f07030' : `rgba(240,112,48,${0.4 + (i / shapData.length) * 0.6})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="chart-panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Avg Churn Probability by Tier</div>
              <div className="panel-sub">30-day churn risk per segment</div>
            </div>
            <span className="panel-badge badge-red">RISK</span>
          </div>
          {l3 ? <div className="loading-spinner"><div className="spinner" /></div> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={segments.map(s => ({
                tier: (s.rfm_tier || '').split(' ').slice(0, 2).join(' '),
                churn: Number(s.avg_churn_prob_30d_pct || s.avg_churn_prob_30d || 0).toFixed(1),
                clv: Number(s.avg_clv || 0).toFixed(0),
              }))} margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#332e27" />
                <XAxis dataKey="tier" tick={{ fill: '#6b5c4a', fontSize: 9 }} tickLine={false} />
                <YAxis tick={{ fill: '#6b5c4a', fontSize: 10 }} tickLine={false} axisLine={false} unit="%" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="churn" name="Churn %" radius={[4, 4, 0, 0]}>
                  {segments.map((s, i) => (
                    <Cell key={i} fill={TIER_COLORS[s.rfm_tier] || '#f07030'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </>
  )
}
