import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from "recharts";
import { fetchKMCurves, fetchSurvivalSummary } from "../api/client";
import { TIER_COLORS } from "../App";

// ── Transform KM JSON → Recharts-ready array ────────────────────────────────
function buildChartData(kmData) {
  if (!kmData) return [];
  const tiers = Object.keys(kmData);
  if (tiers.length === 0) return [];

  // Use the first tier's timeline as base
  const timeline = kmData[tiers[0]].timeline;
  return timeline.map((t, i) => {
    const point = { day: t };
    tiers.forEach((tier) => {
      const surv = kmData[tier].survival[i];
      point[tier] = surv != null ? parseFloat((surv * 100).toFixed(1)) : null;
    });
    return point;
  });
}

// ── Custom tooltip ──────────────────────────────────────────────────────────
function KMTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card text-xs" style={{ padding: "10px 14px", minWidth: 200 }}>
      <div style={{ color: "var(--muted)", marginBottom: 6 }}>Day {label}</div>
      {payload
        .sort((a, b) => b.value - a.value)
        .map((p) => (
          <div key={p.dataKey} className="flex justify-between gap-4">
            <span style={{ color: p.color }}>{p.dataKey}</span>
            <span className="font-semibold">{p.value}%</span>
          </div>
        ))}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function SurvivalPage() {
  const { data: kmData,  isLoading: kmLoading }  = useQuery({ queryKey: ["km"],      queryFn: fetchKMCurves });
  const { data: summary, isLoading: sumLoading } = useQuery({ queryKey: ["surv-sum"],queryFn: fetchSurvivalSummary });

  const [hiddenTiers, setHiddenTiers] = useState(new Set());

  const chartData   = buildChartData(kmData);
  const activeTiers = Object.keys(kmData ?? {}).filter(t => !hiddenTiers.has(t));

  const toggleTier = (tier) => {
    setHiddenTiers(prev => {
      const next = new Set(prev);
      next.has(tier) ? next.delete(tier) : next.add(tier);
      return next;
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <div>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22 }}>
          Survival Analysis
        </h1>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
          Kaplan-Meier curves · Cox Proportional Hazards · P(still active) over time
        </div>
      </div>

      {/* Survival summary table */}
      <div className="card">
        <div className="card-title">Survival Summary by RFM Tier</div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Tier", "Customers", "Median Survival (days)", "Avg Churn 30d %", "Avg CLV"].map(h => (
                <th key={h} className="text-left py-2 pr-6 text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(summary ?? []).map(row => (
              <tr key={row.rfm_tier} style={{ borderBottom: "1px solid var(--border)", opacity: hiddenTiers.has(row.rfm_tier) ? 0.4 : 1 }}>
                <td className="py-2.5 pr-6">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: TIER_COLORS[row.rfm_tier] ?? "#666" }} />
                    <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 600 }}>{row.rfm_tier}</span>
                  </div>
                </td>
                <td className="pr-6 mono text-sm">{row.customer_count?.toLocaleString()}</td>
                <td className="pr-6">
                  <span className="mono">{row.avg_median_survival ?? "—"}</span>
                </td>
                <td className="pr-6">
                  <span style={{ color: row.avg_churn_prob_30d_pct > 50 ? "var(--red)" : row.avg_churn_prob_30d_pct > 25 ? "var(--orange)" : "var(--green)" }}>
                    {row.avg_churn_prob_30d_pct}%
                  </span>
                </td>
                <td>${Number(row.avg_clv ?? 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* KM Chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="card-title mb-0">Kaplan-Meier Curves — P(Survival) by Tier</div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>Click legend to toggle</div>
        </div>

        {/* Tier toggles */}
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.keys(kmData ?? {}).map(tier => (
            <button
              key={tier}
              onClick={() => toggleTier(tier)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-all"
              style={{
                background:  hiddenTiers.has(tier) ? "transparent" : `${TIER_COLORS[tier] ?? "#666"}20`,
                border:      `1px solid ${TIER_COLORS[tier] ?? "#666"}${hiddenTiers.has(tier) ? "40" : "80"}`,
                color:       hiddenTiers.has(tier) ? "var(--dim)" : TIER_COLORS[tier],
                fontFamily:  "JetBrains Mono, monospace",
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: TIER_COLORS[tier] }} />
              {tier}
              {kmData?.[tier]?.median && (
                <span style={{ opacity: 0.7 }}>· {Math.round(kmData[tier].median)}d</span>
              )}
            </button>
          ))}
        </div>

        {kmLoading ? (
          <div className="h-80 rounded" style={{ background: "var(--border)" }} />
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={chartData} margin={{ right: 20 }}>
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10, fill: "var(--muted)" }}
                tickLine={false}
                label={{ value: "Days", position: "insideBottom", offset: -4, fontSize: 11, fill: "var(--muted)" }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: "var(--muted)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `${v}%`}
                label={{ value: "P(Survival)", angle: -90, position: "insideLeft", fontSize: 11, fill: "var(--muted)" }}
              />
              <Tooltip content={<KMTooltip />} />
              <ReferenceLine y={50} stroke="var(--dim)" strokeDasharray="4 2"
                             label={{ value: "50% (Median)", fill: "var(--dim)", fontSize: 10 }} />

              {activeTiers.map(tier => (
                <Line
                  key={tier}
                  type="stepAfter"
                  dataKey={tier}
                  stroke={TIER_COLORS[tier] ?? "#666"}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}

        <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.2)", color: "#bfdbfe" }}>
          <strong>Reading this chart:</strong> Each line shows the probability a customer in that segment is still active (not churned) by day N.
          Where a line crosses the dashed 50% mark is the <em>median survival time</em> — half of that segment has churned by that point.
          Champions (top-left) survive longest; Lost segment (bottom) churns fastest.
        </div>
      </div>
    </div>
  );
}
