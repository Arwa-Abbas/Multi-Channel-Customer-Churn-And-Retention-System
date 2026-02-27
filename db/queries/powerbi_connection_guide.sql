-- ================================================================
-- POWERBI CONNECTION GUIDE
-- ================================================================
-- 
-- HOW TO CONNECT POWERBI TO THIS SYSTEM:
-- 
-- Option A: DirectQuery (live connection — recommended for production)
-- ─────────────────────────────────────────────────────────────────
-- 1. Open PowerBI Desktop
-- 2. Home → Get Data → Database → PostgreSQL
-- 3. Server:   localhost:5432  (or your Docker host IP)
-- 4. Database: churndb
-- 5. Username: churnapp    Password: password123
-- 6. Data Connectivity mode: DirectQuery
-- 7. Select these views (NOT the raw tables):
--      vw_kpi_summary          → KPI cards
--      vw_segment_summary      → RFM donut + bar charts
--      vw_at_risk_customers    → filterable table page
--      vw_monthly_active_trend → line chart
--      vw_churn_cohort         → cohort heatmap
--      vw_model_metrics_history → model performance page
--
-- Option B: CSV Import (if no direct DB access)
-- ─────────────────────────────────────────────────────────────────
-- 1. After each Airflow run, CSVs are written to:
--      /app/data/powerbi/at_risk_customers.csv
--      /app/data/powerbi/segment_summary.csv
--      /app/data/powerbi/model_metrics.csv
--      /app/data/powerbi/monthly_trend.csv
--      /app/data/powerbi/churn_cohort.csv
-- 2. In PowerBI: Home → Get Data → Text/CSV
-- 3. Set up Scheduled Refresh to re-import daily after Airflow runs
--
-- ================================================================
-- RECOMMENDED POWERBI REPORT PAGES (as per PRD Section 6, FR-6)
-- ================================================================

-- PAGE 1: Executive KPIs
-- ──────────────────────
-- Source: vw_kpi_summary
-- Visuals:
--   Card:       total_customers
--   Card:       churn_rate_pct        (color rule: >30% = red)
--   Card:       avg_clv
--   Card:       revenue_at_risk       (color: orange)
--   Line chart: vw_monthly_active_trend.active_customers over month
--   Line chart: vw_monthly_active_trend.total_revenue over month

-- PAGE 2: RFM Segment Map
-- ───────────────────────
-- Source: vw_segment_summary
-- Visuals:
--   Donut chart: customer_count by rfm_tier
--     Colors: Champions=#22d3a5, Loyal=#6c63ff, At Risk=#f87171,
--             Potential Loyalists=#60a5fa, Hibernating=#94a3b8, Lost=#475569
--   Bar chart:  avg_churn_prob_30d_pct by rfm_tier
--   Bar chart:  avg_clv by rfm_tier
--   Table:      rfm_tier | customer_count | avg_recency_days | avg_monetary | avg_clv

-- PAGE 3: Survival Curves
-- ────────────────────────
-- Source: custom query (run this in PowerBI advanced editor):
SELECT * FROM vw_segment_summary
ORDER BY avg_churn_prob_30d_pct DESC;
-- Visuals:
--   Bar chart:  avg_median_survival_days by rfm_tier (from vw_survival_summary)
--   Bar chart:  avg_churn_prob_30d_pct by rfm_tier

-- PAGE 4: At-Risk Customer List
-- ──────────────────────────────
-- Source: vw_at_risk_customers
-- Visuals:
--   Slicer:    rfm_tier (multiselect)
--   Slicer:    churn_prob_30d_pct (range slider: 0–100)
--   Table:     external_id | rfm_tier | churn_prob_30d_pct | clv_estimate
--              | median_survival_days | total_spend | country
--   Conditional formatting on churn_prob_30d_pct:
--     >70% = Red, 40-70% = Orange, <40% = Green
--   Export to CSV button for marketing team

-- PAGE 5: Feature Importance
-- ───────────────────────────
-- Source: shap_importance table
-- Visuals:
--   Horizontal bar: feature (Y-axis) vs mean_abs_shap (X-axis)
--   Sort by rank_order ascending
--   Add a text box explaining SHAP values

-- PAGE 6: Model Performance
-- ──────────────────────────
-- Source: vw_model_metrics_history
-- Visuals:
--   Line chart: roc_auc over run_date (filter: model_type = 'xgboost')
--   Line chart: c_index over run_date (filter: model_type = 'cox')
--   Table:      All columns from vw_model_metrics_history
--   Reference line on AUC chart at 0.78 (PRD target)
--   Reference line on C-index chart at 0.70

-- ================================================================
-- USEFUL CUSTOM MEASURES (DAX)
-- ================================================================

-- % of revenue at risk
-- Revenue At Risk % = DIVIDE([revenue_at_risk], [total_revenue_ltm])

-- Churn rate change MoM
-- Churn Rate MoM = [churn_rate_pct] - CALCULATE([churn_rate_pct], PREVIOUSMONTH(vw_monthly_active_trend[month]))

-- At-risk count
-- At Risk Count = COUNTROWS(FILTER(vw_at_risk_customers, vw_at_risk_customers[churn_prob_30d_pct] > 50))

-- ================================================================
-- POWERBI SCHEDULED REFRESH (Pro/Premium required)
-- ================================================================
-- 1. Publish report to PowerBI Service
-- 2. Dataset → Settings → Scheduled Refresh
-- 3. Set to: Daily at 04:00 UTC (Airflow finishes by 03:30)
-- 4. For CSV imports: use OneDrive/SharePoint to sync /data/powerbi/
-- ================================================================
