-- Enable UUID support
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Core customers table
CREATE TABLE customers (
    customer_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id     VARCHAR(100) UNIQUE NOT NULL,
    signup_date     DATE NOT NULL,
    country         VARCHAR(50),
    plan_type       VARCHAR(50),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase / transaction history
CREATE TABLE transactions (
    id              BIGSERIAL PRIMARY KEY,
    customer_id     UUID REFERENCES customers(customer_id),
    transaction_date TIMESTAMPTZ NOT NULL,
    amount          NUMERIC(10,2) NOT NULL,
    product_category VARCHAR(100),
    channel         VARCHAR(50),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Web event logs
CREATE TABLE web_events (
    id              BIGSERIAL PRIMARY KEY,
    customer_id     UUID REFERENCES customers(customer_id),
    event_date      DATE NOT NULL,
    session_count   INT DEFAULT 0,
    page_views      INT DEFAULT 0,
    session_duration_sec INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Support tickets
CREATE TABLE support_tickets (
    id              BIGSERIAL PRIMARY KEY,
    customer_id     UUID REFERENCES customers(customer_id),
    ticket_date     TIMESTAMPTZ NOT NULL,
    status          VARCHAR(30),
    resolution_days INT,
    csat_score      NUMERIC(3,1),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- RFM + computed features (refreshed daily)
CREATE TABLE customer_features (
    customer_id     UUID PRIMARY KEY REFERENCES customers(customer_id),
    recency_days    INT,
    frequency       INT,
    monetary        NUMERIC(12,2),
    r_score         SMALLINT,
    f_score         SMALLINT,
    m_score         SMALLINT,
    rfm_score       INT,
    rfm_tier        VARCHAR(30),
    tenure_days     INT,
    churn_flag      BOOLEAN,
    churn_event_date DATE,
    web_sessions_30d INT,
    ticket_count_90d INT,
    avg_resolution_days NUMERIC(5,1),
    avg_order_value NUMERIC(10,2),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Model predictions (updated after each scoring run)
CREATE TABLE predictions (
    customer_id     UUID PRIMARY KEY REFERENCES customers(customer_id),
    churn_prob_30d  NUMERIC(5,4),
    churn_prob_90d  NUMERIC(5,4),
    median_survival_days INT,
    clv_estimate    NUMERIC(12,2),
    xgb_churn_prob  NUMERIC(5,4),
    scored_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX ON transactions(customer_id, transaction_date);
CREATE INDEX ON web_events(customer_id, event_date);
CREATE INDEX ON customer_features(rfm_tier);
CREATE INDEX ON predictions(churn_prob_30d);