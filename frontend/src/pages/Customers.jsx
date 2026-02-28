import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, User } from 'lucide-react'
import { searchCustomers, fetchCustomer } from '../api/client'

const TIER_COLORS = {
  'Champions':           '#f07030',
  'Loyal Customers':     '#f5a623',
  'Potential Loyalists': '#4caf7d',
  'At Risk':             '#e05555',
  'Hibernating':         '#5b9bd5',
  'Lost':                '#9b7fe8',
  "Can't Lose Them":     '#e878a2',
}

// API fields from api/customers.py get_customer():
//   external_id, signup_date, country, plan_type
//   rfm_tier, rfm_score, recency_days, frequency, total_spend, tenure_days
//   web_sessions_30d, ticket_count_90d
//   churn_prob_30d_pct  ← already ×100
//   churn_prob_90d_pct  ← already ×100
//   median_survival_days, clv_estimate
//   xgb_churn_prob_pct  ← already ×100
//   recent_transactions ← array of {date, amount, product_category, channel}

export default function Customers() {
  const [q,          setQ]          = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const { data: results = [] } = useQuery({
    queryKey: ['csearch', q],
    queryFn:  () => searchCustomers({ q, limit: 20 }),
    enabled:  q.length >= 2,
  })

  const { data: customer = {}, isLoading } = useQuery({
    queryKey: ['cust', selectedId],
    queryFn:  () => fetchCustomer(selectedId),
    enabled:  !!selectedId,
  })

  // Key fix: API key is "recent_transactions" not "transactions"
  const txns = Array.isArray(customer.recent_transactions) ? customer.recent_transactions : []

  const tierColor   = TIER_COLORS[customer.rfm_tier] || '#a89880'
  // churn_prob_30d_pct is already 0-100
  const churn30     = customer.churn_prob_30d_pct != null ? `${Number(customer.churn_prob_30d_pct).toFixed(1)}%` : '—'
  const xgbScore    = customer.xgb_churn_prob_pct != null ? `${Number(customer.xgb_churn_prob_pct).toFixed(1)}%` : '—'
  const churnColor  = Number(customer.churn_prob_30d_pct) > 50 ? 'var(--red)' : 'var(--green)'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>

      {/* ── Search panel ── */}
      <div className="chart-panel">
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

        {q.length < 2 && <p style={{ fontSize: 12, color: 'var(--text3)' }}>Type at least 2 characters</p>}
        {q.length >= 2 && results.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: 16 }}>No customers found</p>
        )}

        {results.map((r, i) => (
          <div
            key={i}
            onClick={() => setSelectedId(r.external_id)}
            style={{
              padding: '9px 12px', borderRadius: 6, cursor: 'pointer', marginBottom: 2,
              background: selectedId === r.external_id ? 'var(--surface2)' : 'transparent',
              border: `1px solid ${selectedId === r.external_id ? 'var(--border)' : 'transparent'}`,
              transition: 'all 0.1s',
            }}
          >
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--orange)' }}>
              {r.external_id}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              {/* search returns: external_id, plan_type, rfm_tier, churn_prob_30d_pct */}
              {r.rfm_tier || '—'} · {r.plan_type || '—'} · {r.churn_prob_30d_pct != null ? `${r.churn_prob_30d_pct}% churn` : ''}
            </div>
          </div>
        ))}
      </div>

      {/* ── Detail panel ── */}
      <div>
        {!selectedId ? (
          <div className="chart-panel">
            <div className="empty-state"><User size={48} /><p>Select a customer to see their profile</p></div>
          </div>
        ) : isLoading ? (
          <div className="chart-panel"><div className="loading-spinner"><div className="spinner" /> Loading...</div></div>
        ) : (
          <>
            {/* Header card */}
            <div className="chart-panel" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${tierColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tierColor }}>
                      <User size={18} />
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--cream)', fontWeight: 600 }}>
                        {customer.external_id}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                        {customer.country || '—'} · {customer.plan_type || '—'} · Joined {customer.signup_date ? new Date(customer.signup_date).toLocaleDateString() : '—'}
                      </div>
                    </div>
                  </div>
                  <span className="tier-badge" style={{ background: `${tierColor}22`, color: tierColor }}>
                    {customer.rfm_tier || '—'}
                  </span>
                </div>

                {/* Score grid — all _pct fields already 0-100 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, textAlign: 'right' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>CHURN 30D</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: churnColor }}>{churn30}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>CLV EST.</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: 'var(--amber)' }}>
                      {customer.clv_estimate != null ? `$${Number(customer.clv_estimate).toFixed(0)}` : '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>SURVIVAL</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: 'var(--blue)' }}>
                      {Number(customer.median_survival_days) > 0 ? `${customer.median_survival_days}d` : '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>XGB SCORE</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: 'var(--purple)' }}>{xgbScore}</div>
                  </div>
                </div>
              </div>

              {/* RFM feature stats row */}
              <div style={{ display: 'flex', gap: 24, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                {[
                  { label: 'Recency',     value: `${customer.recency_days ?? '—'}d`  },
                  { label: 'Frequency',   value: customer.frequency ?? '—'            },
                  { label: 'Total Spend', value: customer.total_spend != null ? `$${Number(customer.total_spend).toFixed(0)}` : '—' },
                  { label: 'Tenure',      value: `${customer.tenure_days ?? '—'}d`   },
                  { label: 'RFM Score',   value: customer.rfm_score ?? '—'           },
                  { label: 'Tickets 90d', value: customer.ticket_count_90d ?? '—'    },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text)' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Transactions — API key: "recent_transactions", columns: date, amount, product_category, channel */}
            {txns.length > 0 && (
              <div className="chart-panel">
                <div className="panel-header">
                  <div><div className="panel-title">Recent Transactions</div><div className="panel-sub">Last {txns.length} transactions</div></div>
                  <span className="panel-badge badge-amber">HISTORY</span>
                </div>
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr><th>Date</th><th>Amount</th><th>Category</th><th>Channel</th></tr>
                    </thead>
                    <tbody>
                      {txns.map((t, i) => (
                        <tr key={i}>
                          {/* API returns date (not transaction_date) — already cast to TEXT in SQL */}
                          <td className="mono" style={{ fontSize: 11 }}>{t.date || '—'}</td>
                          <td className="mono" style={{ color: 'var(--green)' }}>
                            ${Number(t.amount || 0).toFixed(2)}
                          </td>
                          <td style={{ fontSize: 12 }}>{t.product_category || '—'}</td>
                          <td><span className="panel-badge badge-blue" style={{ fontSize: 10 }}>{t.channel || '—'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {txns.length === 0 && (
              <div className="chart-panel">
                <div className="empty-state" style={{ padding: 30 }}>
                  <p className="text-muted">No transactions found for this customer</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
