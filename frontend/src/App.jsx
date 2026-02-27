import React from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import {
  LayoutDashboard, Users, TrendingDown,
  Activity, BarChart3, Settings
} from "lucide-react";
import Overview from "./pages/Overview";
import AtRisk from "./pages/AtRisk";
import Segments from "./pages/Segments";
import SurvivalPage from "./pages/SurvivalPage";
import ModelMetrics from "./pages/ModelMetrics";

const NAV = [
  { to: "/",          icon: LayoutDashboard, label: "Overview"    },
  { to: "/at-risk",   icon: TrendingDown,    label: "At Risk"     },
  { to: "/segments",  icon: Users,           label: "Segments"    },
  { to: "/survival",  icon: Activity,        label: "Survival"    },
  { to: "/metrics",   icon: BarChart3,       label: "ML Metrics"  },
];

const TIER_COLORS = {
  "Champions":          "#22d3a5",
  "Loyal Customers":    "#6c63ff",
  "Potential Loyalists":"#60a5fa",
  "At Risk":            "#f87171",
  "Can't Lose Them":    "#f59e0b",
  "Hibernating":        "#94a3b8",
  "Lost":               "#475569",
};

// Export for use in child components
export { TIER_COLORS };

export default function App() {
  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col w-56 shrink-0 border-r"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {/* Logo */}
        <div className="px-5 py-6 border-b" style={{ borderColor: "var(--border)" }}>
          <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 16 }}>
            <span style={{ color: "var(--accent2)" }}>Churn</span>
            <span style={{ color: "var(--text)" }}>System</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, fontFamily: "JetBrains Mono, monospace" }}>
            v1.0 · RFM + Cox PH
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isActive
                    ? "font-semibold"
                    : "hover:bg-white/5"
                }`
              }
              style={({ isActive }) => ({
                background: isActive ? "rgba(108,99,255,0.15)" : undefined,
                color:      isActive ? "var(--accent2)" : "var(--muted)",
              })}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t" style={{ borderColor: "var(--border)" }}>
          <div style={{ fontSize: 10, color: "var(--dim)", fontFamily: "JetBrains Mono, monospace" }}>
            PowerBI ↗ :5432 / churndb
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/"         element={<Overview />} />
          <Route path="/at-risk"  element={<AtRisk />} />
          <Route path="/segments" element={<Segments />} />
          <Route path="/survival" element={<SurvivalPage />} />
          <Route path="/metrics"  element={<ModelMetrics />} />
        </Routes>
      </main>
    </div>
  );
}
