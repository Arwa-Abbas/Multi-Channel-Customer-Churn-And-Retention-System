import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, AreaChart, Area,
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { TrendingDown, Users, DollarSign, AlertTriangle, RefreshCw } from "lucide-react";
import {
  fetchKPIs, fetchChurnTrend, fetchSegments, fetchShap, triggerPipeline
} from "../api/client";
import { TIER_COLORS } from "../App";

// ── Sub-components ──────────────────────────────────────────────────────────

function KPICard({ label, value, sub, icon: Icon, color, loading }) {
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="card-title mb-0">{label}</div>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}20` }}
        >
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      {loading ? (
        <div className="h-8 rounded" style={{ background: "var(--border)", animation: "pulse 2s infinite" }} />
      ) : (
        <div className="stat-value" style={{ color }}>{value ?? "—"}</div>
      )}
      {sub && <div className="stat-label">{sub}</div>}
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card text-xs space-y-1" style={{ minWidth: 160, padding: "10px 14px" }}>
      <div style={{ color: "var(--muted)", marginBottom: 6 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-semibold">{typeof p.value === "number" ? p.value.toLocaleString() : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function Overview() {
  const { data: kpis,    isLoading: kLoading }   = useQuery({ queryKey: ["kpis"],    queryFn: fetchKPIs });
  const { data: trend,   isLoading: tLoading }   = useQuery({ queryKey: ["trend"],   queryFn: fetchChurnTrend });
  const { data: segments }                        = useQuery({ queryKey: ["segments"],queryFn: fetchSegments });
  const { data: shap }                            = useQuery({ queryKey: ["shap"],    queryFn: fetchShap });

  const [triggering, setTriggering] = React.useState(false);

  const handleTrigger = async () => {
    setTriggering(true);
    try { await triggerPipeline(); } catch (e) { /* ignore */ }
    setTimeout(() => setTriggering(false), 3000);
  };

  // Month labels
  const trendData = trend?.map(d => ({
    ...d,
    month: d.month?.slice(0, 7),  // "2025-01"
  })) ?? [];

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22 }}>
            Executive Overview
          </h1>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            RFM Segmentation · Cox PH Survival · XGBoost
          </div>
        </div>
        <button
          onClick={handleTrigger}
          disabled={triggering}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: "rgba(108,99,255,0.15)",
            border: "1px solid rgba(108,99,255,0.3)",
            color: "var(--accent2)",
          }}
        >
          <RefreshCw size={14} className={triggering ? "animate-spin" : ""} />
          {triggering ? "Running…" : "Run Pipeline"}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard
          label="Total Customers"
          value={kpis?.total_customers?.toLocaleString()}
          icon={Users}
          color="var(--accent2)"
          loading={kLoading}
        />
        <KPICard
          label="Churn Rate"
          value={kpis?.churn_rate_pct ? `${kpis.churn_rate_pct}%` : null}
          sub={`${kpis?.churned_customers?.toLocaleString()} customers churned`}
          icon={TrendingDown}
          color="var(--red)"
          loading={kLoading}
        />
        <KPICard
          label="Average CLV"
          value={kpis?.avg_clv ? `$${Number(kpis.avg_clv).toLocaleString()}` : null}
          icon={DollarSign}
          color="var(--green)"
          loading={kLoading}
        />
        <KPICard
          label="Revenue at Risk"
          value={kpis?.revenue_at_risk ? `$${Number(kpis.revenue_at_risk).toLocaleString()}` : null}
          sub="From churned customers"
          icon={AlertTriangle}
          color="var(--orange)"
          loading={kLoading}
        />
      </div>

      {/* Trend + Segments row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Monthly trend */}
        <div className="card xl:col-span-2">
          <div className="card-title">Monthly Active Customers & Revenue</div>
          {tLoading ? (
            <div className="h-52 rounded" style={{ background: "var(--border)" }} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"   stopColor="#6c63ff" stopOpacity={0.25} />
                    <stop offset="95%"  stopColor="#6c63ff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"   stopColor="#22d3a5" stopOpacity={0.25} />
                    <stop offset="95%"  stopColor="#22d3a5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} />
                <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area yAxisId="left"  type="monotone" dataKey="active_customers"  name="Active Customers"
                      stroke="#6c63ff" fill="url(#actGrad)" strokeWidth={2} dot={false} />
                <Area yAxisId="right" type="monotone" dataKey="total_revenue"     name="Revenue ($)"
                      stroke="#22d3a5" fill="url(#revGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Segment donut */}
        <div className="card">
          <div className="card-title">RFM Segment Distribution</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={segments ?? []}
                dataKey="customer_count"
                nameKey="rfm_tier"
                cx="50%" cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {(segments ?? []).map((s) => (
                  <Cell
                    key={s.rfm_tier}
                    fill={TIER_COLORS[s.rfm_tier] ?? "#666"}
                    stroke="transparent"
                  />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="card text-xs" style={{ padding: "8px 12px" }}>
                      <div style={{ color: TIER_COLORS[d.rfm_tier] }}>{d.rfm_tier}</div>
                      <div>{d.customer_count?.toLocaleString()} customers</div>
                      <div style={{ color: "var(--muted)" }}>Avg churn 30d: {d.avg_churn_prob_30d_pct}%</div>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="mt-2 space-y-1">
            {(segments ?? []).slice(0, 5).map((s) => (
              <div key={s.rfm_tier} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-sm" style={{ background: TIER_COLORS[s.rfm_tier] }} />
                  <span style={{ color: "var(--muted)" }}>{s.rfm_tier}</span>
                </div>
                <span className="mono">{s.customer_count?.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SHAP feature importance */}
      <div className="card">
        <div className="card-title">SHAP Feature Importance — XGBoost Churn Drivers</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={(shap ?? []).slice(0, 8)}
            layout="vertical"
            margin={{ left: 20, right: 30 }}
          >
            <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="feature" width={160}
                   tick={{ fontSize: 11, fill: "var(--text)", fontFamily: "JetBrains Mono, monospace" }}
                   tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="mean_abs_shap" name="Mean |SHAP|" radius={[0, 4, 4, 0]}>
              {(shap ?? []).slice(0, 8).map((_, i) => (
                <Cell key={i} fill={`hsl(${250 - i * 18}, 70%, 65%)`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
