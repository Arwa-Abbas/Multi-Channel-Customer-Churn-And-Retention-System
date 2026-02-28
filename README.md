# Multi-Channel-Customer-Churn-And-Retention-System

A comprehensive customer churn prediction and retention analytics platform built with **FastAPI, React, Survival Analysis, and Machine Learning**.

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

---

## 🏗️ System Architecture

├── frontend/ # React Dashboard (Vite)
├── backend/
│ ├── api/ # FastAPI endpoints
│ ├── models/ # Cox PH & XGBoost models
│ ├── pipelines/ # Data ingestion & RFM processing
│ └── db/ # Database connections
├── airflow/ # DAGs for orchestration
├── mlflow/ # Model experiment tracking
└── docker-compose.yml


---

## ✨ Key Features

- 🔮 Real-time churn prediction
- 📊 Interactive analytics dashboard
- 🧮 RFM customer segmentation
- 📉 Kaplan–Meier survival curves
- 📦 Full ML lifecycle tracking (MLflow)
- ⚙️ Automated pipeline with Airflow
- 🐳 Fully Dockerized deployment

---

