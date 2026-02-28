import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, User, ShoppingCart, Clock, TrendingDown } from 'lucide-react'
import { searchCustomers, fetchCustomer } from '../api/client'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const TIER_COLORS = {
  'Champions': '#f07030', 'Loyal Customers': '#f5a623',
  'Potential Loyalists': '#4caf7d', 'At Risk': '#e05555',
  'Hibernating': '#5b9bd5', 'Lost': '#9b7fe8',
}

export default function Customers() {
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const { data: results = [] } = useQuery({
    queryKey: ['csearch', q],
    queryFn: () => searchCustomers({ q, limit: 20 }),
    enabled: q.length >= 2,
  })

  const { data: customer = {}, isLoading } = useQuery({
    queryKey: ['cust', selectedId],
    queryFn: () => fetchCustomer(selectedId),
    enabled: !!selectedId,
  })

  const txns = Array.isArray(customer.transactions) ? customer.transactions : []
  const profile = customer.profile || customer

  const tierColor = TIER_COLORS[profile.rfm_tier] || '#a89880'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>
      {/* Left: Search */}
      <div>
        <div className="chart-panel" style={{ marginBottom: 12 }}>
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input
              className="filter-input"
              style={{ paddingLeft: 32, width: '100%' }}
              placeholder="Search by customer ID..."
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          {results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {results.map((r, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedId(r.external_id || r.customer_id)}
                  style={{
                    padding: '9px 12px', borderRadius: 6, cursor: 'pointer',
                    background: selectedId === (r.external_id || r.customer_id) ? 'var(--surface2)' : 'transparent',
                    border: '1px solid transparent',
                    transition: 'all 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                >
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--orange)' }}>
                    {r.external_id || r.customer_id?.slice(0, 12)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                    {r.rfm_tier || '—'} · {r.country || '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
          {q.length >= 2 && results.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: 16 }}>No customers found</p>
          )}
          {q.length < 2 && (
            <p style={{ fontSize: 12, color: 'var(--text3)' }}>Type at least 2 characters to search</p>
          )}
        </div>
      </div>

      {/* Right: Customer detail */}
      <div>
        {!selectedId ? (
          <div className="chart-panel">
            <div className="empty-state">
              <User size={48} />
              <p>Select a customer from the search results to see their full profile</p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="chart-panel">
            <div className="loading-spinner"><div className="spinner" /> Loading customer...</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="chart-panel" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${tierColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tierColor }}>
                      <User size={18} />
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--cream)', fontWeight: 600 }}>
                        {profile.external_id || selectedId}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                        {profile.country || '—'} · Joined {profile.signup_date ? new Date(profile.signup_date).toLocaleDateString() : '—'}
                      </div>
                    </div>
                  </div>
                  <span className="tier-badge" style={{ background: `${tierColor}22`, color: tierColor }}>
                    {profile.rfm_tier || '—'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, textAlign: 'right' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>CHURN 30D</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: Number(profile.churn_prob_30d) > 0.5 ? 'var(--red)' : 'var(--green)' }}>
                      {profile.churn_prob_30d != null ? `${(Number(profile.churn_prob_30d)*100).toFixed(1)}%` : '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>CLV EST.</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--amber)' }}>
                      {profile.clv_estimate != null ? `$${Number(profile.clv_estimate).toFixed(0)}` : '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>MEDIAN SURVIVAL</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--blue)' }}>
                      {profile.median_survival_days > 0 ? `${profile.median_survival_days}d` : '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>XGB SCORE</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--purple)' }}>
                      {profile.xgb_churn_prob != null ? `${(Number(profile.xgb_churn_prob)*100).toFixed(1)}%` : '—'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Transactions */}
            {txns.length > 0 && (
              <div className="chart-panel">
                <div className="panel-header">
                  <div>
                    <div className="panel-title">Recent Transactions</div>
                    <div className="panel-sub">Last {txns.length} transactions</div>
                  </div>
                  <span className="panel-badge badge-amber">HISTORY</span>
                </div>
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Category</th>
                        <th>Channel</th>
                        <th>Refund</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txns.map((t, i) => (
                        <tr key={i}>
                          <td className="mono" style={{ fontSize: 11 }}>{t.transaction_date ? new Date(t.transaction_date).toLocaleDateString() : '—'}</td>
                          <td className="mono" style={{ color: t.is_refund ? 'var(--red)' : 'var(--green)' }}>
                            {t.is_refund ? '−' : '+'}${Number(t.amount || 0).toFixed(2)}
                          </td>
                          <td style={{ fontSize: 12 }}>{t.product_category || '—'}</td>
                          <td><span className="panel-badge badge-blue" style={{ fontSize: 10 }}>{t.channel || '—'}</span></td>
                          <td>{t.is_refund ? <span className="text-red">Yes</span> : <span className="text-muted">No</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
