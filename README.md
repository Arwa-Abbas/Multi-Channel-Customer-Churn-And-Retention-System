# Multi-Channel-Customer-Churn-And-Retention-System

An end-to-end customer churn analytics pipeline and platform that combines RFM segmentation, Survival Analysis (Cox Proportional Hazards), XGBoost classification, and CLV prediction to identify at-risk customers and estimate revenue impact, built with **FastAPI, React, Survival Analysis, and Machine Learning**.

---

## 📌 Project Overview

The **Churn Intelligence System** provides real-time customer churn prediction using:

- 📈 **Cox Proportional Hazards (Survival Analysis)**
- 🤖 **XGBoost Machine Learning Classifier**

The system includes an interactive React dashboard for monitoring:

- Customer health
- RFM segmentation
- Survival probabilities
- At-risk customers
- Model performance history

---

## 🏷️ Badges

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Python](https://img.shields.io/badge/python-3.11+-green)
![React](https://img.shields.io/badge/react-18.x-61dafb)
![Docker](https://img.shields.io/badge/docker-ready-2496ed)
![Power BI](https://img.shields.io/badge/Power%2520BI-Integrated-F2C811)


---


# 🏗️ Architecture

```
├── frontend/          # React Dashboard (Vite)
├── backend/
│   ├── api/           # FastAPI endpoints
│   ├── models/        # Cox PH & XGBoost models
│   ├── pipelines/     # Data ingestion & RFM processing
│   └── db/            # Database connections
├── airflow/           # DAGs for orchestration
├── mlflow/            # Model tracking
└── docker-compose.yml
```

---

# ✨ Key Features

- 🔮 Real-time churn prediction
- 📊 Interactive analytics dashboard
- 🧮 Automated RFM segmentation
- 📉 Survival probability estimation
- 📦 MLflow experiment tracking
- ⚙️ Airflow-based pipeline orchestration
- 🐳 Fully Dockerized deployment
- Power BI Integration – Direct connection to PostgreSQL for advanced reporting and visualization

## Power BI Integration
Connects directly to PostgreSQL with optimized views:

| View Name               | Purpose                                    |
|-------------------------|--------------------------------------------|
| vw_kpi_summary          | Executive KPIs (total customers, churn rate, avg CLV) |
| vw_segment_summary      | RFM segment breakdown with customer counts |
| vw_monthly_active_trend | Time series data for trends                |
| vw_at_risk_customers    | At-risk customer list with churn probabilities |
| vw_model_metrics_history| Model performance over time               |
| vw_churn_cohort         | Cohort analysis                            |

**Connection Details:** 
- Server: localhost, Port: 5432, Database: churndb
- Username: postgres or churnapp, Authentication: Database.
- Dashboard components: Executive Dashboard, Customer Segmentation, At-Risk Analysis, Model Performance, Geographic Analysis.

---

# 🚀 Quick Start (Docker)

## 🔹 Prerequisites

- Docker
- Docker Compose

---

## 🔹 1. Clone Repository

```bash
git clone https://github.com/yourusername/churn-intelligence.git
cd churn-intelligence
```

---

## 🔹 2. Setup Environment Variables

```bash
cp .env.example .env
```

Edit `.env` if needed.

---

## 🔹 3. Start All Services

```bash
docker-compose up -d
```

---

## 🌐 Access Applications

| Service | URL |
|----------|------|
| Dashboard | http://localhost:3000 |
| API Docs | http://localhost:8000/docs |
| Airflow | http://localhost:8081 |
| MLflow | http://localhost:5000 |
| PowerBI | connect via desktop |
---

# 🛠️ Local Development

---

## 🔹 Backend Setup

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload
```

Backend runs at:

```
http://localhost:8000
```

---

## 🔹 Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at:

```
http://localhost:5173
```

---

# 📈 Data Pipeline

### Pipeline Stages

1. Data Ingestion
2. RFM Scoring
3. Feature Engineering
4. Cox PH Model Training
5. XGBoost Model Training
6. Customer Scoring
7. Metrics Logging (MLflow)

---

## 🔁 Trigger Full Pipeline

### Via API

```bash
curl -X POST http://localhost:8000/api/pipeline/trigger
```

### Manually Inside Docker

```bash
docker exec churn_api python -m pipelines.rfm_pipeline
docker exec churn_api python -m models.survival_model
docker exec churn_api python -m models.xgb_model
```

---

# 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/kpis` | GET | Dashboard KPIs |
| `/api/segments` | GET | RFM segment breakdown |
| `/api/at-risk` | GET | At-risk customers |
| `/api/survival-summary` | GET | Survival metrics |
| `/api/km-curves` | GET | Kaplan–Meier curve data |
| `/api/model-metrics` | GET | Model performance history |
| `/api/customers` | GET | Customer search |
| `/api/pipeline/trigger` | POST | Trigger full pipeline |

---

# 📊 Dashboard Modules

- 📌 Overview (KPIs & trends)
- ⚠️ At-Risk Customers table
- 🏷️ RFM Segmentation view
- 📉 Survival Analysis charts
- 🤖 Model Metrics tracking
- 👤 Customer Explorer

---

# 🧰 Tech Stack

## Backend
- FastAPI
- SQLAlchemy
- PostgreSQL
- Pandas / NumPy
- Lifelines
- XGBoost
- MLflow

## Frontend
- React 18
- Vite
- TanStack Query
- Recharts
- Lucide Icons

- ## Business Intelligence
- Power BI – Direct database connection with pre-built views

## Infrastructure
- Docker & Docker Compose
- PostgreSQL
- Redis
- Airflow
- Nginx

---

# ⚙️ Environment Configuration

Example `.env` file:

```env
POSTGRES_DB=churndb
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

MLFLOW_TRACKING_URI=http://mlflow:5000

AIRFLOW__CORE__EXECUTOR=LocalExecutor
```

---

# 📦 Deployment Notes

To rebuild containers:

```bash
docker-compose down
docker-compose up --build -d
```

To view logs:

```bash
docker-compose logs -f
```

To stop services:

```bash
docker-compose down
```

---

- Built by Arwa Abbas ❤️ 

---
