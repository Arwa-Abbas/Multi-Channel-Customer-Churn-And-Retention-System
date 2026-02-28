import { useState, useCallback } from 'react'
import { QueryClient, QueryClientProvider, useQuery, useMutation } from '@tanstack/react-query'
import { LayoutDashboard, AlertTriangle, PieChart, TrendingUp, BarChart3,
         Users, Activity, Zap, RefreshCw, Database } from 'lucide-react'
import { triggerPipeline } from './api/client'

import Overview      from './pages/Overview'
import AtRisk        from './pages/AtRisk'
import Segments      from './pages/Segments'
import SurvivalPage  from './pages/SurvivalPage'
import ModelMetrics  from './pages/ModelMetrics'
import Customers     from './pages/Customers'

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 5 * 60 * 1000 } }
})

const PAGES = [
  { id: 'overview',  label: 'Overview',       Icon: LayoutDashboard },
  { id: 'atrisk',    label: 'At Risk',         Icon: AlertTriangle },
  { id: 'segments',  label: 'RFM Segments',    Icon: PieChart },
  { id: 'survival',  label: 'Survival Curves', Icon: TrendingUp },
  { id: 'metrics',   label: 'ML Metrics',      Icon: BarChart3 },
  { id: 'customers', label: 'Customers',       Icon: Users },
]

const PAGE_TITLES = {
  overview:  { title: 'Overview',          sub: 'Executive churn intelligence dashboard' },
  atrisk:    { title: 'At-Risk Customers', sub: 'Customers with high churn probability' },
  segments:  { title: 'RFM Segments',      sub: 'Recency · Frequency · Monetary analysis' },
  survival:  { title: 'Survival Analysis', sub: 'Kaplan-Meier curves by RFM tier' },
  metrics:   { title: 'ML Performance',    sub: 'Cox PH & XGBoost model metrics' },
  customers: { title: 'Customer Explorer', sub: 'Search and inspect individual customers' },
}

function Shell() {
  const [page, setPage] = useState('overview')
  const [time, setTime]  = useState(new Date())

  useState(() => {
    const t = setInterval(() => setTime(new Date()), 60000)
    return () => clearInterval(t)
  })

  const { mutate: runPipeline, isPending } = useMutation({
    mutationFn: triggerPipeline,
    onSuccess: () => alert('Pipeline triggered! Check Airflow at localhost:8080'),
    onError:   () => alert('Failed to trigger pipeline'),
  })

  const info = PAGE_TITLES[page]

  const renderPage = () => {
    switch (page) {
      case 'overview':  return <Overview />
      case 'atrisk':    return <AtRisk />
      case 'segments':  return <Segments />
      case 'survival':  return <SurvivalPage />
      case 'metrics':   return <ModelMetrics />
      case 'customers': return <Customers />
      default:          return <Overview />
    }
  }

  return (
    <div className="app-shell">
      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">
            <div className="logo-icon">
              <Activity size={16} />
            </div>
            <h1>Churn Intel</h1>
          </div>
          <p>v2.0 · production</p>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Navigation</div>
          {PAGES.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? 'active' : ''}`}
              onClick={() => setPage(id)}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <button
            className={`pipeline-btn ${isPending ? 'running' : ''}`}
            onClick={() => runPipeline()}
            disabled={isPending}
          >
            {isPending
              ? <><RefreshCw size={14} className="spin-icon" /> Running...</>
              : <><Zap size={14} /> Run Pipeline</>
            }
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="main-area">
        <div className="top-bar">
          <div>
            <div className="top-bar-title">{info.title}</div>
            <div className="top-bar-sub">{info.sub}</div>
          </div>
          <div className="top-bar-right">
            <div className="live-dot" title="Live data" />
            <span className="timestamp">
              {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

        <div className="page-content">
          {renderPage()}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <Shell />
    </QueryClientProvider>
  )
}
