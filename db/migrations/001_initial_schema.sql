
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- for fuzzy text search

-- ================================================================
-- CORE TABLES
-- ================================================================

CREATE TABLE IF NOT EXISTS customers (
    customer_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id     VARCHAR(100) UNIQUE NOT NULL,    -- original system ID
    signup_date     DATE NOT NULL,
    country         VARCHAR(50),
    plan_type       VARCHAR(50),                     -- free|starter|pro|enterprise
    email_domain    VARCHAR(100),                    -- NOT full email — pseudonymised
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase / transaction history (multi-channel)
CREATE TABLE IF NOT EXISTS transactions (
    id               BIGSERIAL PRIMARY KEY,
    customer_id      UUID NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
    transaction_date TIMESTAMPTZ NOT NULL,
    amount           NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    product_category VARCHAR(100),
    channel          VARCHAR(50),                    -- web|mobile|direct|partner
    is_refund        BOOLEAN DEFAULT FALSE,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Web activity logs (aggregated daily per customer, not raw rows)
CREATE TABLE IF NOT EXISTS web_events (
    id                   BIGSERIAL PRIMARY KEY,
    customer_id          UUID NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
    event_date           DATE NOT NULL,
    session_count        INT DEFAULT 0,
    page_views           INT DEFAULT 0,
    session_duration_sec INT DEFAULT 0,
    bounce_rate          NUMERIC(5,4),              -- 0.0–1.0
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (customer_id, event_date)                -- idempotent re-load
);

-- Support tickets (from Zendesk / CSV)
CREATE TABLE IF NOT EXISTS support_tickets (
    id              BIGSERIAL PRIMARY KEY,
    customer_id     UUID NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
    external_ticket_id VARCHAR(100) UNIQUE,         -- Zendesk ticket_id
    ticket_date     TIMESTAMPTZ NOT NULL,
    status          VARCHAR(30),                    -- open|pending|solved|closed
    priority        VARCHAR(20),                    -- low|normal|high|urgent
    resolution_days NUMERIC(7,1),
    csat_score      NUMERIC(3,1),                   -- 1.0–5.0
    sentiment_score NUMERIC(5,4),                   -- -1.0 to 1.0 (NLP derived)
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Raw ingestion staging table (idempotent, all channels)
CREATE TABLE IF NOT EXISTS ingestion_log (
    id          BIGSERIAL PRIMARY KEY,
    source      VARCHAR(50) NOT NULL,               -- transactions|web_events|tickets
    run_date    DATE NOT NULL,
    rows_loaded INT NOT NULL DEFAULT 0,
    null_rate   NUMERIC(5,4),
    status      VARCHAR(20) DEFAULT 'success',      -- success|failed|skipped
    error_msg   TEXT,
    duration_sec NUMERIC(8,2),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- FEATURE STORE (refreshed daily by RFM pipeline)
-- ================================================================

CREATE TABLE IF NOT EXISTS customer_features (
    customer_id          UUID PRIMARY KEY REFERENCES customers(customer_id),
    -- RFM dimensions
    recency_days         INT,
    frequency            INT,
    monetary             NUMERIC(14,2),
    -- RFM scores (1-5 quintiles)
    r_score              SMALLINT,
    f_score              SMALLINT,
    m_score              SMALLINT,
    rfm_score            INT,                       -- r*100 + f*10 + m
    rfm_tier             VARCHAR(30),               -- Champions|Loyal|At Risk|etc
    rfm_tier_encoded     SMALLINT,                  -- ordinal 1-6 for model
    -- Survival model features
    tenure_days          INT,
    avg_order_value      NUMERIC(10,2),
    web_sessions_30d     INT DEFAULT 0,
    ticket_count_90d     INT DEFAULT 0,
    avg_resolution_days  NUMERIC(7,1),
    frequency_90d        INT DEFAULT 0,
    -- Target
    churn_flag           BOOLEAN DEFAULT FALSE,
    churn_event_date     DATE,
    duration_days        INT,                       -- tenure or days-to-churn
    -- Meta
    feature_version      INT DEFAULT 1,
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- MODEL PREDICTIONS (updated after every scoring run)
-- ================================================================

CREATE TABLE IF NOT EXISTS predictions (
    customer_id          UUID PRIMARY KEY REFERENCES customers(customer_id),
    -- Cox PH outputs
    churn_prob_30d       NUMERIC(6,5),
    churn_prob_90d       NUMERIC(6,5),
    median_survival_days INT,
    clv_estimate         NUMERIC(14,2),
    -- XGBoost outputs
    xgb_churn_prob       NUMERIC(6,5),
    -- Model metadata
    model_version        VARCHAR(50),
    scored_at            TIMESTAMPTZ DEFAULT NOW()
);

-- SHAP feature importance (written after XGBoost training)
CREATE TABLE IF NOT EXISTS shap_importance (
    feature         VARCHAR(100) PRIMARY KEY,
    mean_abs_shap   NUMERIC(10,6),
    rank_order      SMALLINT,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- MLflow run tracking reference (denormalized for PowerBI)
CREATE TABLE IF NOT EXISTS model_run_metrics (
    id              BIGSERIAL PRIMARY KEY,
    run_id          VARCHAR(100) NOT NULL,          -- MLflow run_id
    model_type      VARCHAR(50),                    -- cox|xgboost
    c_index         NUMERIC(6,4),
    roc_auc         NUMERIC(6,4),
    brier_score     NUMERIC(6,4),
    n_customers     INT,
    run_date        DATE NOT NULL,
    is_champion     BOOLEAN DEFAULT FALSE,          -- current prod model?
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- POWER BI VIEWS (pre-aggregated, no joins needed in PBI)
-- ================================================================

-- Executive KPI summary
CREATE OR REPLACE VIEW vw_kpi_summary AS
SELECT
    COUNT(*)::INT                                                  AS total_customers,
    SUM(CASE WHEN cf.churn_flag THEN 1 ELSE 0 END)::INT           AS churned_customers,
    ROUND(AVG(CASE WHEN cf.churn_flag THEN 1.0 ELSE 0 END) * 100, 2) AS churn_rate_pct,
    ROUND(AVG(p.clv_estimate), 2)                                  AS avg_clv,
    ROUND(SUM(CASE WHEN cf.churn_flag THEN p.clv_estimate ELSE 0 END), 2) AS revenue_at_risk,
    ROUND(AVG(p.churn_prob_30d) * 100, 2)                          AS avg_30d_churn_prob_pct,
    NOW()::DATE                                                    AS snapshot_date
FROM customer_features cf
LEFT JOIN predictions p USING (customer_id);

-- RFM segment breakdown (for donut + bar charts)
CREATE OR REPLACE VIEW vw_segment_summary AS
SELECT
    cf.rfm_tier,
    COUNT(*)::INT                          AS customer_count,
    ROUND(AVG(cf.monetary), 2)             AS avg_monetary,
    ROUND(AVG(cf.recency_days), 1)         AS avg_recency_days,
    ROUND(AVG(cf.frequency), 1)            AS avg_frequency,
    ROUND(AVG(p.clv_estimate), 2)          AS avg_clv,
    ROUND(AVG(p.churn_prob_30d) * 100, 2)  AS avg_churn_prob_30d_pct,
    SUM(CASE WHEN cf.churn_flag THEN 1 ELSE 0 END)::INT AS churned_count
FROM customer_features cf
LEFT JOIN predictions p USING (customer_id)
GROUP BY cf.rfm_tier
ORDER BY customer_count DESC;

-- At-risk customers (for filterable table in PBI)
CREATE OR REPLACE VIEW vw_at_risk_customers AS
SELECT
    c.external_id,
    c.country,
    c.plan_type,
    cf.rfm_tier,
    cf.recency_days,
    cf.frequency,
    ROUND(cf.monetary, 2)              AS total_spend,
    ROUND(p.churn_prob_30d * 100, 1)   AS churn_prob_30d_pct,
    ROUND(p.churn_prob_90d * 100, 1)   AS churn_prob_90d_pct,
    p.median_survival_days,
    ROUND(p.clv_estimate, 2)           AS clv_estimate,
    ROUND(p.xgb_churn_prob * 100, 1)   AS xgb_churn_prob_pct,
    p.scored_at
FROM predictions p
JOIN customer_features cf USING (customer_id)
JOIN customers c USING (customer_id)
WHERE p.churn_prob_30d > 0.40
ORDER BY p.churn_prob_30d DESC;

-- Monthly active customer trend (12 months, for line chart)
CREATE OR REPLACE VIEW vw_monthly_active_trend AS
SELECT
    DATE_TRUNC('month', t.transaction_date)::DATE  AS month,
    COUNT(DISTINCT t.customer_id)::INT              AS active_customers,
    ROUND(SUM(t.amount), 2)                         AS total_revenue,
    COUNT(t.id)::INT                                AS transaction_count,
    ROUND(AVG(t.amount), 2)                         AS avg_order_value
FROM transactions t
WHERE t.transaction_date >= NOW() - INTERVAL '13 months'
  AND t.is_refund = FALSE
GROUP BY 1
ORDER BY 1;

-- Churn cohort by signup month (for cohort analysis in PBI)
CREATE OR REPLACE VIEW vw_churn_cohort AS
SELECT
    DATE_TRUNC('month', c.signup_date)::DATE   AS cohort_month,
    COUNT(*)::INT                               AS cohort_size,
    SUM(CASE WHEN cf.churn_flag THEN 1 ELSE 0 END)::INT AS churned,
    ROUND(AVG(CASE WHEN cf.churn_flag THEN 1.0 ELSE 0 END) * 100, 1) AS churn_rate_pct,
    ROUND(AVG(cf.tenure_days), 0)              AS avg_tenure_days
FROM customers c
JOIN customer_features cf USING (customer_id)
GROUP BY 1
ORDER BY 1;

-- Model performance history (for KPI trend in PBI)
CREATE OR REPLACE VIEW vw_model_metrics_history AS
SELECT
    run_date,
    model_type,
    c_index,
    roc_auc,
    brier_score,
    n_customers,
    is_champion,
    run_id
FROM model_run_metrics
ORDER BY run_date DESC, model_type;

-- ================================================================
-- INDEXES for query performance
-- ================================================================

CREATE INDEX IF NOT EXISTS idx_transactions_customer_date
    ON transactions(customer_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_date
    ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_web_events_customer_date
    ON web_events(customer_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_customer_date
    ON support_tickets(customer_id, ticket_date DESC);
CREATE INDEX IF NOT EXISTS idx_features_rfm_tier
    ON customer_features(rfm_tier);
CREATE INDEX IF NOT EXISTS idx_features_churn_flag
    ON customer_features(churn_flag);
CREATE INDEX IF NOT EXISTS idx_predictions_churn_30d
    ON predictions(churn_prob_30d DESC);
CREATE INDEX IF NOT EXISTS idx_customers_signup
    ON customers(signup_date);
