import { useQuery } from "@tanstack/react-query"
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts"
import { fetchKPIs, fetchSegments, fetchAtRisk,
         fetchChurnTrend, fetchFeatureImport } from "./api/client"
import "./index.css"

const SEGMENT_COLORS = {
  "Champions": "#22d3a5", 
  "Loyal Customers": "#6c63ff",
  "At Risk": "#f87171", 
  "Hibernating": "#f59e0b",
  "Lost": "#94a3b8", 
  "Potential Loyalists": "#60a5fa"
}

function KPICard({ label, value, sub, colorClass }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${colorClass}`}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
}

export default function App() {
  const { data: kpis, isLoading: kpisLoading } = useQuery({ 
    queryKey: ["kpis"],     
    queryFn: fetchKPIs 
  })
  
  const { data: segments, isLoading: segmentsLoading } = useQuery({ 
    queryKey: ["segments"], 
    queryFn: fetchSegments 
  })
  
  const { data: atRisk, isLoading: atRiskLoading } = useQuery({ 
    queryKey: ["atrisk"],   
    queryFn: () => fetchAtRisk() 
  })
  
  const { data: trend, isLoading: trendLoading } = useQuery({ 
    queryKey: ["trend"],    
    queryFn: fetchChurnTrend 
  })
  
  const { data: shap, isLoading: shapLoading } = useQuery({ 
    queryKey: ["shap"],     
    queryFn: fetchFeatureImport 
  })

  const segmentsData = segments || []
  const atRiskData = atRisk || []
  const trendData = trend || []
  const shapData = shap || []

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const getSegmentClass = (segment) => {
    const map = {
      'Champions': 'segment-champions',
      'Loyal Customers': 'segment-loyal',
      'At Risk': 'segment-atrisk',
      'Hibernating': 'segment-hibernating',
      'Lost': 'segment-lost',
      'Potential Loyalists': 'segment-potential'
    }
    return map[segment] || ''
  }

  return (
    <div className="dashboard">
      <h1>Churn & Retention Dashboard</h1>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <KPICard 
          label="Total Customers" 
          value={kpis?.total_customers?.toLocaleString() || '0'} 
          colorClass="white" 
        />
        <KPICard 
          label="Churn Rate" 
          value={kpis?.churn_rate_pct ? `${kpis.churn_rate_pct}%` : '0%'} 
          colorClass="red" 
        />
        <KPICard 
          label="Avg CLV" 
          value={kpis?.avg_clv ? formatCurrency(kpis.avg_clv) : '$0'} 
          colorClass="green" 
        />
        <KPICard 
          label="Revenue at Risk" 
          value={kpis?.revenue_at_risk ? formatCurrency(kpis.revenue_at_risk) : '$0'} 
          colorClass="amber" 
        />
      </div>

      {/* Charts Row */}
      <div className="charts-row">
        {/* Segment Distribution */}
        <div className="chart-card">
          <h2>RFM Segment Distribution</h2>
          {segmentsLoading ? (
            <div className="chart-container">Loading...</div>
          ) : segmentsData.length === 0 ? (
            <div className="chart-container">No segment data</div>
          ) : (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={segmentsData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="rfm_tier"
                    label={({ rfm_tier, percent }) => 
                      `${rfm_tier} ${(percent * 100).toFixed(0)}%`
                    }
                  >
                    {segmentsData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={SEGMENT_COLORS[entry.rfm_tier] || '#666'} 
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Active Customers Trend */}
        <div className="chart-card">
          <h2>Active Customers Trend</h2>
          {trendLoading ? (
            <div className="chart-container">Loading...</div>
          ) : trendData.length === 0 ? (
            <div className="chart-container">No trend data</div>
          ) : (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Line 
                    type="monotone" 
                    dataKey="active_customers"
                    stroke="#6c63ff" 
                    strokeWidth={2} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* SHAP Feature Importance */}
      <div className="feature-card">
        <h2>SHAP Feature Importance</h2>
        {shapLoading ? (
          <div className="feature-container">Loading...</div>
        ) : shapData.length === 0 ? (
          <div className="feature-container">No feature data</div>
        ) : (
          <div className="feature-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={shapData} layout="vertical">
                <XAxis type="number" />
                <YAxis type="category" dataKey="feature" width={120} />
                <Tooltip />
                <Bar dataKey="mean_abs_shap" fill="#22d3a5" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* At-Risk Table */}
      <div className="table-card">
        <h2>At-Risk Customers (30d churn &gt; 40%)</h2>
        {atRiskLoading ? (
          <div className="loading">Loading...</div>
        ) : atRiskData.length === 0 ? (
          <div className="no-data">No at-risk customers found</div>
        ) : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Customer ID</th>
                    <th>Segment</th>
                    <th className="text-right">Churn Probability</th>
                    <th className="text-right">CLV Estimate</th>
                    <th className="text-right">Median Survival</th>
                  </tr>
                </thead>
                <tbody>
                  {atRiskData.slice(0, 10).map((customer) => (
                    <tr key={customer.external_id}>
                      <td className="customer-id">{customer.external_id}</td>
                      <td className={getSegmentClass(customer.rfm_tier)}>
                        {customer.rfm_tier}
                      </td>
                      <td className="churn-prob">
                        {(customer.churn_prob_30d * 100).toFixed(1)}%
                      </td>
                      <td className="clv-value">
                        {formatCurrency(customer.clv_estimate)}
                      </td>
                      <td className="survival-days">
                        {customer.median_survival_days}d
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {atRiskData.length > 10 && (
              <div className="table-footer">
                Showing 10 of {atRiskData.length} at-risk customers
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}