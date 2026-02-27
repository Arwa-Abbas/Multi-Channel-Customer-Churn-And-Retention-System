import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip,
  LineChart, Line, ResponsiveContainer, Cell, ReferenceLine
} from "recharts";
import { fetchSegments, fetchModelMetrics, fetchLatestMetrics, fetchIngestionLog } from "../api/client";
import { TIER_COLORS } from "../App";

// ═══════════════════════════════════════════════════════════ SEGMENTS PAGE

export function Segments() {
  const { data: segments = [] } = useQuery({ queryKey: ["segments"], queryFn: fetchSegments });
  const [active, setActive] = React.useState(null);
  const sel = segments.find(s => s.rfm_tier === active) ?? segments[0] ?? {};

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <div>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22 }}>
          RFM Segments
        </h1>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
          Recency · Frequency · Monetary — quintile-scored, 6-tier behavioural segmentation
        </div>
      </div>

      {/* Segment cards grid */}
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
        {segments.map(s => (
          <div
            key={s.rfm_tier}
            className="card cursor-pointer transition-all"
            style={{
              borderColor: active === s.rfm_tier ? TIER_COLORS[s.rfm_tier] : "var(--border)",
              background:  active === s.rfm_tier ? `${TIER_COLORS[s.rfm_tier]}0c` : "var(--surface)",
            }}
            onClick={() => setActive(s.rfm_tier === active ? null : s.rfm_tier)}
          >
            <div className="flex items-center justify-between mb-3">
              <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 13, color: TIER_COLORS[s.rfm_tier] }}>
                {s.rfm_tier}
              </div>
              <span className="mono text-xs" style={{ color: "var(--muted)" }}>
                {s.customer_count?.toLocaleString()}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Avg Recency", value: `${s.avg_recency_days}d` },
                { label: "Churn 30d",   value: `${s.avg_churn_prob_30d_pct}%`, red: s.avg_churn_prob_30d_pct > 40 },
                { label: "Avg CLV",     value: `$${Number(s.avg_clv ?? 0).toLocaleString()}` },
              ].map(({ label, value, red }) => (
                <div key={label}>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>{label}</div>
                  <div className="mono text-sm font-semibold" style={{ color: red ? "var(--red)" : "var(--text)" }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bar chart comparison */}
      <div className="card">
        <div className="card-title">Segment Comparison — Avg Churn Probability vs CLV</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={segments} margin={{ bottom: 20 }}>
            <XAxis dataKey="rfm_tier" tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false}
                   angle={-20} textAnchor="end" />
            <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false}
                   tickFormatter={v => `${v}%`} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false}
                   axisLine={false} tickFormatter={v => `$${v}`} />
            <Tooltip />
            <Bar yAxisId="left"  dataKey="avg_churn_prob_30d_pct" name="Churn 30d %" radius={[4,4,0,0]}>
              {segments.map(s => <Cell key={s.rfm_tier} fill={TIER_COLORS[s.rfm_tier] ?? "#666"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default Segments;


// ═══════════════════════════════════════════════════════ MODEL METRICS PAGE

export function ModelMetrics() {
  const { data: history = [] } = useQuery({ queryKey: ["metrics"],       queryFn: fetchModelMetrics });
  const { data: latest  = [] } = useQuery({ queryKey: ["latest-metrics"],queryFn: fetchLatestMetrics });
  const { data: logs    = [] } = useQuery({ queryKey: ["ingestion-log"], queryFn: fetchIngestionLog });

  const coxHistory  = history.filter(h => h.model_type === "cox");
  const xgbHistory  = history.filter(h => h.model_type === "xgboost");

  const coxLatest   = latest.find(m => m.model_type === "cox");
  const xgbLatest   = latest.find(m => m.model_type === "xgboost");

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <div>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22 }}>
          ML Model Performance
        </h1>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
          MLflow tracked runs · C-index · ROC-AUC · Brier Score
        </div>
      </div>

      {/* Current model cards */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { m: coxLatest,  label: "Cox Proportional Hazards", primary: "c_index",   target: 0.70, color: "var(--accent2)" },
          { m: xgbLatest,  label: "XGBoost Classifier",       primary: "roc_auc",   target: 0.78, color: "var(--green)" },
        ].map(({ m, label, primary, target, color }) => (
          <div key={label} className="card">
            <div className="card-title">{label}</div>
            {m ? (
              <>
                <div className="stat-value" style={{ color }}>{m[primary]?.toFixed(3) ?? "—"}</div>
                <div className="stat-label">{primary === "c_index" ? "C-index (target ≥ 0.70)" : "ROC-AUC (target ≥ 0.78)"}</div>
                <div className="mt-4 space-y-2">
                  {[
                    { label: "Brier Score", value: m.brier_score?.toFixed(3), good: m.brier_score < 0.15 },
                    { label: "Customers",   value: m.n_customers?.toLocaleString() },
                    { label: "Run Date",    value: m.run_date },
                    { label: "MLflow Run",  value: m.run_id?.slice(0, 8) + "…" },
                  ].map(({ label: l, value, good }) => (
                    <div key={l} className="flex justify-between text-xs">
                      <span style={{ color: "var(--muted)" }}>{l}</span>
                      <span className="mono" style={{ color: good === false ? "var(--red)" : "var(--text)" }}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Target threshold bar */}
                <div className="mt-4">
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: "var(--muted)" }}>vs target ({target})</span>
                    <span style={{ color: m[primary] >= target ? "var(--green)" : "var(--red)" }}>
                      {m[primary] >= target ? "✓ Passes" : "✗ Below target"}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: "var(--border2)" }}>
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min((m[primary] / 1) * 100, 100)}%`,
                      background: m[primary] >= target ? "var(--green)" : "var(--red)",
                    }} />
                  </div>
                </div>
              </>
            ) : (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>No champion model yet. Run the pipeline.</div>
            )}
          </div>
        ))}
      </div>

      {/* AUC trend */}
      {xgbHistory.length > 1 && (
        <div className="card">
          <div className="card-title">XGBoost ROC-AUC over Time</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={xgbHistory}>
              <XAxis dataKey="run_date" tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} />
              <YAxis domain={[0.5, 1.0]} tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
              <Tooltip />
              <ReferenceLine y={0.78} stroke="var(--orange)" strokeDasharray="4 2"
                             label={{ value: "Target 0.78", fill: "var(--orange)", fontSize: 10 }} />
              <Line type="monotone" dataKey="roc_auc" stroke="var(--green)" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Ingestion log */}
      <div className="card">
        <div className="card-title">Pipeline Ingestion Log</div>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Source", "Date", "Rows", "Null Rate", "Status", "Duration"].map(h => (
                <th key={h} className="text-left py-2 pr-4 uppercase tracking-wider" style={{ color: "var(--muted)", fontSize: 10 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((l, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="py-2 pr-4 mono">{l.source}</td>
                <td className="pr-4 mono" style={{ color: "var(--muted)" }}>{l.run_date}</td>
                <td className="pr-4 mono">{l.rows_loaded?.toLocaleString()}</td>
                <td className="pr-4 mono" style={{ color: l.null_rate > 0.05 ? "var(--red)" : "var(--muted)" }}>
                  {l.null_rate ? `${(l.null_rate * 100).toFixed(1)}%` : "—"}
                </td>
                <td className="pr-4">
                  <span className="badge" style={{
                    background: l.status === "success" ? "rgba(34,211,165,0.1)" : "rgba(248,113,113,0.1)",
                    color:      l.status === "success" ? "var(--green)" : "var(--red)",
                  }}>
                    {l.status}
                  </span>
                </td>
                <td className="mono" style={{ color: "var(--muted)" }}>{l.duration_sec}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
