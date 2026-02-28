import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Filter, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react'
import { fetchAtRisk } from '../api/client'

const TIERS = ['All', 'Champions', 'Loyal Customers', 'Potential Loyalists', 'At Risk', 'Hibernating', 'Lost', "Can't Lose Them"]

const TIER_COLORS = {
  'Champions':           '#f07030',
  'Loyal Customers':     '#f5a623',
  'Potential Loyalists': '#4caf7d',
  'At Risk':             '#e05555',
  'Hibernating':         '#5b9bd5',
  'Lost':                '#9b7fe8',
}

export default function AtRisk() {
  const [search,  setSearch]  = useState('')
  const [tier,    setTier]    = useState('')
  const [minProb, setMinProb] = useState(40)
  const [sortCol, setSortCol] = useState('churn_prob_30d')
  const [sortDir, setSortDir] = useState('desc')
  const [selected, setSelected] = useState(null)

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['atrisk', tier, minProb],
    queryFn: () => fetchAtRisk({
      tier: tier || undefined,
      min_prob: minProb / 100,
      limit: 200,
    }),
  })

  const sort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const filtered = rows
    .filter(r => !search || String(r.external_id || r.customer_id || '').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const v = (x) => Number(x[sortCol] ?? 0)
      return sortDir === 'asc' ? v(a) - v(b) : v(b) - v(a)
    })

  const SortIcon = ({ col }) => sortCol === col
    ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
    : null

  const probClass = (p) => {
    const pct = Number(p) * 100
    if (pct >= 70) return 'high'
    if (pct >= 40) return 'medium'
    return 'low'
  }

  const tierColor = (t) => TIER_COLORS[t] || '#a89880'

  return (
    <>
      {/* Summary */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
        <div className="kpi-card red">
          <div className="kpi-label"><AlertTriangle size={12} /> High Risk</div>
          <div className="kpi-value">{rows.filter(r => Number(r.churn_prob_30d) >= 0.7).length}</div>
          <div className="kpi-sub">&gt;70% churn prob</div>
        </div>
        <div className="kpi-card amber">
          <div className="kpi-label"><Filter size={12} /> Medium Risk</div>
          <div className="kpi-value">{rows.filter(r => Number(r.churn_prob_30d) >= 0.4 && Number(r.churn_prob_30d) < 0.7).length}</div>
          <div className="kpi-sub">40–70% churn prob</div>
        </div>
        <div className="kpi-card orange">
          <div className="kpi-label"><Search size={12} /> Showing</div>
          <div className="kpi-value">{filtered.length}</div>
          <div className="kpi-sub">matched customers</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input
            className="filter-input"
            style={{ paddingLeft: 32, width: 220 }}
            placeholder="Search customer ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="filter-select" value={tier} onChange={e => setTier(e.target.value)}>
          {TIERS.map(t => <option key={t} value={t === 'All' ? '' : t}>{t}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="text-muted" style={{ fontSize: 12 }}>Min prob:</span>
          <select className="filter-select" value={minProb} onChange={e => setMinProb(Number(e.target.value))}>
            {[30,40,50,60,70].map(v => <option key={v} value={v}>{v}%</option>)}
          </select>
        </div>
        <span className="text-muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
          {filtered.length} of {rows.length} customers
        </span>
      </div>

      {/* Table */}
      <div className="chart-panel" style={{ padding: 0 }}>
        {isLoading ? (
          <div className="loading-spinner"><div className="spinner" /> Loading customers...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <AlertTriangle size={40} />
            <p>No customers match your filters</p>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th onClick={() => sort('external_id')}>Customer ID <SortIcon col="external_id" /></th>
                  <th>Tier</th>
                  <th onClick={() => sort('churn_prob_30d')}>30d Churn <SortIcon col="churn_prob_30d" /></th>
                  <th onClick={() => sort('churn_prob_90d')}>90d Churn <SortIcon col="churn_prob_90d" /></th>
                  <th onClick={() => sort('clv_estimate')}>CLV Est. <SortIcon col="clv_estimate" /></th>
                  <th onClick={() => sort('median_survival_days')}>Survival Days <SortIcon col="median_survival_days" /></th>
                  <th onClick={() => sort('xgb_churn_prob')}>XGB Score <SortIcon col="xgb_churn_prob" /></th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((r, i) => {
                  const prob30 = Number(r.churn_prob_30d || 0)
                  const prob90 = Number(r.churn_prob_90d || 0)
                  const xgb    = Number(r.xgb_churn_prob || 0)
                  return (
                    <tr
                      key={i}
                      className={selected === i ? 'selected' : ''}
                      onClick={() => setSelected(selected === i ? null : i)}
                    >
                      <td><span className="mono" style={{ fontSize: 12, color: 'var(--orange)' }}>{r.external_id || r.customer_id?.slice(0,8)}</span></td>
                      <td>
                        <span className="tier-badge" style={{ background: `${tierColor(r.rfm_tier)}22`, color: tierColor(r.rfm_tier) }}>
                          {r.rfm_tier || '—'}
                        </span>
                      </td>
                      <td>
                        <div className="prob-bar-wrap">
                          <div className="prob-bar-track">
                            <div className={`prob-bar-fill ${probClass(prob30)}`} style={{ width: `${prob30 * 100}%` }} />
                          </div>
                          <span className={`prob-val text-${probClass(prob30) === 'high' ? 'red' : probClass(prob30) === 'medium' ? 'amber' : 'green'}`}>
                            {(prob30 * 100).toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>{(prob90 * 100).toFixed(1)}%</td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {r.clv_estimate != null ? `$${Number(r.clv_estimate).toFixed(0)}` : '—'}
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {r.median_survival_days > 0 ? `${r.median_survival_days}d` : '—'}
                      </td>
                      <td>
                        <div className="prob-bar-wrap">
                          <div className="prob-bar-track">
                            <div className={`prob-bar-fill ${probClass(xgb)}`} style={{ width: `${xgb * 100}%` }} />
                          </div>
                          <span className="prob-val text-muted" style={{ fontSize: 11 }}>
                            {(xgb * 100).toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {filtered.length > 100 && (
        <p className="text-muted" style={{ fontSize: 12, marginTop: 10, textAlign: 'center' }}>
          Showing first 100 of {filtered.length} results. Refine filters to narrow down.
        </p>
      )}
    </>
  )
}
