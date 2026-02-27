"""
SQLAlchemy ORM model definitions — one class per table.
These mirror the schema in db/migrations/001_schema.sql exactly.

USED BY:
    FastAPI routes for type-safe inserts/updates
    Alembic for migration generation (optional)
"""

import uuid
from datetime import datetime, date
from sqlalchemy import (
    Column,
    String,
    Integer,
    SmallInteger,
    Numeric,
    Boolean,
    Date,
    DateTime,
    BigInteger,
    Text,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from db.connection import Base


class Customer(Base):
    __tablename__ = "customers"

    customer_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_id = Column(String(100), unique=True, nullable=False)
    signup_date = Column(Date, nullable=False)
    country = Column(String(50))
    plan_type = Column(String(50))
    email_domain = Column(String(100))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    transactions = relationship(
        "Transaction", back_populates="customer", lazy="dynamic"
    )
    web_events = relationship("WebEvent", back_populates="customer", lazy="dynamic")
    tickets = relationship("SupportTicket", back_populates="customer", lazy="dynamic")
    features = relationship("CustomerFeature", back_populates="customer", uselist=False)
    prediction = relationship("Prediction", back_populates="customer", uselist=False)


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    customer_id = Column(
        UUID(as_uuid=True), ForeignKey("customers.customer_id"), nullable=False
    )
    transaction_date = Column(DateTime(timezone=True), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    product_category = Column(String(100))
    channel = Column(String(50))
    is_refund = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    customer = relationship("Customer", back_populates="transactions")


class WebEvent(Base):
    __tablename__ = "web_events"
    __table_args__ = (UniqueConstraint("customer_id", "event_date"),)

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    customer_id = Column(
        UUID(as_uuid=True), ForeignKey("customers.customer_id"), nullable=False
    )
    event_date = Column(Date, nullable=False)
    session_count = Column(Integer, default=0)
    page_views = Column(Integer, default=0)
    session_duration_sec = Column(Integer, default=0)
    bounce_rate = Column(Numeric(5, 4))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    customer = relationship("Customer", back_populates="web_events")


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    customer_id = Column(
        UUID(as_uuid=True), ForeignKey("customers.customer_id"), nullable=False
    )
    external_ticket_id = Column(String(100), unique=True)
    ticket_date = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(30))
    priority = Column(String(20))
    resolution_days = Column(Numeric(7, 1))
    csat_score = Column(Numeric(3, 1))
    sentiment_score = Column(Numeric(5, 4))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    customer = relationship("Customer", back_populates="tickets")


class CustomerFeature(Base):
    __tablename__ = "customer_features"

    customer_id = Column(
        UUID(as_uuid=True), ForeignKey("customers.customer_id"), primary_key=True
    )
    recency_days = Column(Integer)
    frequency = Column(Integer)
    monetary = Column(Numeric(14, 2))
    r_score = Column(SmallInteger)
    f_score = Column(SmallInteger)
    m_score = Column(SmallInteger)
    rfm_score = Column(Integer)
    rfm_tier = Column(String(30))
    rfm_tier_encoded = Column(SmallInteger)
    tenure_days = Column(Integer)
    avg_order_value = Column(Numeric(10, 2))
    web_sessions_30d = Column(Integer, default=0)
    ticket_count_90d = Column(Integer, default=0)
    avg_resolution_days = Column(Numeric(7, 1))
    frequency_90d = Column(Integer, default=0)
    churn_flag = Column(Boolean, default=False)
    churn_event_date = Column(Date)
    duration_days = Column(Integer)
    feature_version = Column(Integer, default=1)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    customer = relationship("Customer", back_populates="features")


class Prediction(Base):
    __tablename__ = "predictions"

    customer_id = Column(
        UUID(as_uuid=True), ForeignKey("customers.customer_id"), primary_key=True
    )
    churn_prob_30d = Column(Numeric(6, 5))
    churn_prob_90d = Column(Numeric(6, 5))
    median_survival_days = Column(Integer)
    clv_estimate = Column(Numeric(14, 2))
    xgb_churn_prob = Column(Numeric(6, 5))
    model_version = Column(String(50))
    scored_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    customer = relationship("Customer", back_populates="prediction")


class IngestionLog(Base):
    __tablename__ = "ingestion_log"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    source = Column(String(50), nullable=False)
    run_date = Column(Date, nullable=False)
    rows_loaded = Column(Integer, default=0)
    null_rate = Column(Numeric(5, 4))
    status = Column(String(20), default="success")
    error_msg = Column(Text)
    duration_sec = Column(Numeric(8, 2))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class ModelRunMetric(Base):
    __tablename__ = "model_run_metrics"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    run_id = Column(String(100), nullable=False)
    model_type = Column(String(50))
    c_index = Column(Numeric(6, 4))
    roc_auc = Column(Numeric(6, 4))
    brier_score = Column(Numeric(6, 4))
    n_customers = Column(Integer)
    run_date = Column(Date, nullable=False)
    is_champion = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
