import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronUp, ChevronDown, Search, Filter } from "lucide-react";
import { fetchAtRisk } from "../api/client";
import { TIER_COLORS } from "../App";

const TIERS = ["Champions","Loyal Customers","Potential Loyalists",
               "At Risk","Can't Lose Them","Hibernating","Lost"];

function SortIcon({ col, sortState }) {
  const { key, asc } = sortState;
  if (key !== col) return <ChevronDown size={12} style={{ opacity: 0.3 }} />;
  return asc ? <ChevronUp size={12} style={{ color: "var(--accent2)" }} />
             : <ChevronDown size={12} style={{ color: "var(--accent2)" }} />;
}

function ChurnBar({ value }) {
  const pct = Math.min(value ?? 0, 100);
  const color = pct > 70 ? "var(--red)" : pct > 40 ? "var(--orange)" : "var(--green)";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--border2)", maxWidth: 64 }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span style={{ color, fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>{pct}%</span>
    </div>
  );
}

export default function AtRisk() {
  const [tier,     setTier]     = useState("");
  const [minProb,  setMinProb]  = useState(0.40);
  const [search,   setSearch]   = useState("");
  const [sort,     setSort]     = useState({ key: "churn_prob_30d_pct", asc: false });
  const [selected, setSelected] = useState(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["at-risk", tier, minProb],
    queryFn:  () => fetchAtRisk({ tier: tier || undefined, min_prob: minProb, limit: 200 }),
  });

  const toggleSort = (key) => setSort(prev =>
    prev.key === key ? { key, asc: !prev.asc } : { key, asc: false }
  );

  const filtered = useMemo(() => {
    let data = rows ?? [];
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(r => r.external_id?.toLowerCase().includes(q));
    }
    data = [...data].sort((a, b) => {
      const v = (x) => x[sort.key] ?? 0;
      return sort.asc ? v(a) - v(b) : v(b) - v(a);
    });
    return data;
  }, [rows, search, sort]);

  const HeaderCell = ({ label, col }) => (
    <th
      className="text-left py-2 pr-4 text-xs uppercase tracking-wider cursor-pointer select-none"
      style={{ color: sort.key === col ? "var(--accent2)" : "var(--muted)" }}
      onClick={() => toggleSort(col)}
    >
      <div className="flex items-center gap-1">
        {label}
        <SortIcon col={col} sortState={sort} />
      </div>
    </th>
  );

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      <div>
        <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22 }}>
          At-Risk Customers
        </h1>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
          Ranked by 30-day churn probability · Powered by Cox PH + XGBoost
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
             style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <Search size={13} style={{ color: "var(--muted)" }} />
          <input
            type="text"
            placeholder="Search customer ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent outline-none text-sm"
            style={{ color: "var(--text)", width: 180 }}
          />
        </div>

        <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
             style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <Filter size={13} style={{ color: "var(--muted)" }} />
          <select
            value={tier}
            onChange={e => setTier(e.target.value)}
            className="bg-transparent outline-none text-sm cursor-pointer"
            style={{ color: "var(--text)" }}
          >
            <option value="">All Tiers</option>
            {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
             style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Min 30d prob:</span>
          <select
            value={minProb}
            onChange={e => setMinProb(parseFloat(e.target.value))}
            className="bg-transparent outline-none text-sm cursor-pointer"
            style={{ color: "var(--text)" }}
          >
            {[0.3, 0.4, 0.5, 0.6, 0.7].map(v => (
              <option key={v} value={v}>{Math.round(v * 100)}%</option>
            ))}
          </select>
        </div>

        <div className="px-3 py-2 rounded-lg flex items-center"
             style={{ background: "rgba(244,114,182,0.1)", border: "1px solid rgba(244,114,182,0.3)" }}>
          <span style={{ fontSize: 12, color: "var(--pink)", fontFamily: "JetBrains Mono, monospace" }}>
            {filtered.length} customers
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
                <th className="pl-4 py-2" />
                <HeaderCell label="Customer"          col="external_id" />
                <HeaderCell label="Tier"              col="rfm_tier" />
                <HeaderCell label="Churn 30d"         col="churn_prob_30d_pct" />
                <HeaderCell label="Churn 90d"         col="churn_prob_90d_pct" />
                <HeaderCell label="XGBoost"           col="xgb_churn_prob_pct" />
                <HeaderCell label="CLV"               col="clv_estimate" />
                <HeaderCell label="Median Survival"   col="median_survival_days" />
                <HeaderCell label="Total Spend"       col="total_spend" />
                <HeaderCell label="Last Active"       col="recency_days" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                Array(8).fill(0).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    {Array(10).fill(0).map((__, j) => (
                      <td key={j} className="py-3 pr-4">
                        <div className="h-3 rounded" style={{ background: "var(--border)", width: "80%" }} />
                      </td>
                    ))}
                  </tr>
                ))
              )}
              {!isLoading && filtered.map((row, idx) => (
                <tr
                  key={row.external_id}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background: selected === row.external_id ? "rgba(108,99,255,0.08)" : idx % 2 ? "var(--surface2)" : "transparent",
                    cursor: "pointer",
                  }}
                  onClick={() => setSelected(s => s === row.external_id ? null : row.external_id)}
                >
                  <td className="pl-4 py-2.5">
                    <div className="w-1 h-6 rounded-full" style={{ background: TIER_COLORS[row.rfm_tier] ?? "#666" }} />
                  </td>
                  <td className="pr-4 py-2.5 mono text-xs" style={{ color: "var(--accent2)" }}>
                    {row.external_id}
                  </td>
                  <td className="pr-4">
                    <span className="badge" style={{
                      background: `${TIER_COLORS[row.rfm_tier]}18`,
                      color: TIER_COLORS[row.rfm_tier],
                    }}>
                      {row.rfm_tier}
                    </span>
                  </td>
                  <td className="pr-4">
                    <ChurnBar value={row.churn_prob_30d_pct} />
                  </td>
                  <td className="pr-4 mono text-xs" style={{ color: "var(--muted)" }}>
                    {row.churn_prob_90d_pct}%
                  </td>
                  <td className="pr-4 mono text-xs" style={{ color: "var(--blue)" }}>
                    {row.xgb_churn_prob_pct}%
                  </td>
                  <td className="pr-4 mono text-xs" style={{ color: "var(--green)" }}>
                    ${Number(row.clv_estimate ?? 0).toLocaleString()}
                  </td>
                  <td className="pr-4 mono text-xs">
                    {row.median_survival_days}d
                  </td>
                  <td className="pr-4 mono text-xs" style={{ color: "var(--muted)" }}>
                    ${Number(row.total_spend ?? 0).toLocaleString()}
                  </td>
                  <td className="pr-4 mono text-xs" style={{ color: "var(--muted)" }}>
                    {row.recency_days}d ago
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
