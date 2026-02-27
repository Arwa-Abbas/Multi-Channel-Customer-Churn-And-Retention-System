"""
models/xgb_model.py
====================
Trains an XGBoost binary churn classifier with SHAP explainability.
Tracks every run with MLflow. Updates predictions table with xgb_churn_prob.

HOW IT CONNECTS:
  ← customer_features (read)
  → predictions.xgb_churn_prob (UPDATE — joins on customer_id)
  → shap_importance (write feature importance ranking)
  → model_run_metrics (write roc_auc, brier_score)
  → MLflow (log all params, metrics, feature importance chart)

CALLED BY:
  airflow/dags/churn_pipeline_dag.py  (task: train_xgb_model)
  CLI: python -m models.xgb_model
"""

import os
import logging
from datetime import date
from pathlib import Path

import joblib
import mlflow
import numpy as np
import pandas as pd
import shap
from imblearn.over_sampling import SMOTE
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.metrics import (
    roc_auc_score,
    brier_score_loss,
    classification_report,
    average_precision_score,
    confusion_matrix,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score
from xgboost import XGBClassifier

from db.connection import query_df, execute_sql, upsert_df

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

MLFLOW_URI = os.environ.get("MLFLOW_TRACKING_URI", "http://localhost:5000")
ARTIFACT_DIR = Path("models/artifacts")
MODEL_PATH = ARTIFACT_DIR / "xgb_model.pkl"

FEATURES = [
    "recency_days",
    "frequency",
    "monetary",
    "tenure_days",
    "avg_order_value",
    "web_sessions_30d",
    "ticket_count_90d",
    "avg_resolution_days",
    "frequency_90d",
    "rfm_tier_encoded",
]


# ── Helpers ────────────────────────────────────────────────────────────────


def _handle_class_imbalance(X: pd.DataFrame, y: pd.Series) -> tuple:
    """
    Apply SMOTE if churn class < 20% of total.
    Returns (X_resampled, y_resampled).
    """
    churn_rate = y.mean()
    logger.info(f"[XGB] Churn rate: {churn_rate:.2%}")
    if churn_rate < 0.20:
        logger.info("[XGB] Applying SMOTE for class imbalance")
        sm = SMOTE(random_state=42, k_neighbors=5)
        X_res, y_res = sm.fit_resample(X, y)
        logger.info(f"[XGB] After SMOTE: {len(X_res)} samples")
        return X_res, y_res
    return X, y


def _compute_shap(model: XGBClassifier, X: pd.DataFrame) -> pd.DataFrame:
    """Compute mean |SHAP| values per feature. Returns sorted DataFrame."""
    explainer = shap.TreeExplainer(model)
    shap_vals = explainer.shap_values(X)
    importance = (
        pd.DataFrame(
            {
                "feature": FEATURES,
                "mean_abs_shap": np.abs(shap_vals).mean(axis=0),
            }
        )
        .sort_values("mean_abs_shap", ascending=False)
        .reset_index(drop=True)
    )
    importance["rank_order"] = range(1, len(importance) + 1)
    importance["updated_at"] = pd.Timestamp.utcnow()
    return importance


# ── Training ───────────────────────────────────────────────────────────────


def train_xgb_model() -> tuple[XGBClassifier, str]:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    mlflow.set_tracking_uri(MLFLOW_URI)
    mlflow.set_experiment("churn-xgboost-classifier")

    # Load data
    df = query_df(
        f"""
        SELECT customer_id, {', '.join(FEATURES)}, churn_flag
        FROM customer_features
        WHERE tenure_days > 7
    """
    )
    df = df.dropna(subset=FEATURES + ["churn_flag"])
    X = df[FEATURES]
    y = df["churn_flag"].astype(int)

    logger.info(f"[XGB] Dataset: {len(df)} rows, churn={y.mean():.2%}")

    # Stratified 80/20 split
    from sklearn.model_selection import train_test_split

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=42
    )
    X_train, y_train = _handle_class_imbalance(X_train, y_train)

    params = dict(
        n_estimators=400,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.80,
        colsample_bytree=0.80,
        min_child_weight=5,
        gamma=0.1,
        reg_alpha=0.05,
        reg_lambda=1.0,
        scale_pos_weight=1,  # SMOTE already balanced
        random_state=42,
        eval_metric="auc",
        early_stopping_rounds=30,
        n_jobs=-1,
    )

    with mlflow.start_run(run_name=f"xgb-{date.today()}") as run:
        run_id = run.info.run_id
        logger.info(f"[XGB] MLflow run_id: {run_id}")

        mlflow.log_params({**params, "n_train": len(X_train), "n_test": len(X_test)})

        model = XGBClassifier(**params)
        model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=50)

        # Evaluate
        probs = model.predict_proba(X_test)[:, 1]
        auc = roc_auc_score(y_test, probs)
        brier = brier_score_loss(y_test, probs)
        ap = average_precision_score(y_test, probs)

        logger.info(f"[XGB] ROC-AUC: {auc:.4f}  Brier: {brier:.4f}  AP: {ap:.4f}")
        logger.info(f"\n{classification_report(y_test, (probs > 0.5).astype(int))}")

        mlflow.log_metrics(
            {
                "roc_auc": round(auc, 4),
                "brier_score": round(brier, 4),
                "avg_precision": round(ap, 4),
            }
        )

        if auc < 0.78:
            logger.warning(f"[XGB] AUC {auc:.4f} below PRD target 0.78")
            mlflow.set_tag("quality_flag", "below_target")

        # SHAP importance
        importance = _compute_shap(model, X_test.head(500))  # sample for speed
        mlflow.log_dict(importance.to_dict(orient="records"), "shap_importance.json")

        # Save artifacts
        joblib.dump(model, MODEL_PATH)
        mlflow.log_artifact(str(MODEL_PATH), artifact_path="models")

        # Write to DB
        upsert_df(
            importance[["feature", "mean_abs_shap", "rank_order", "updated_at"]],
            "shap_importance",
            if_exists="replace",
        )

        execute_sql(
            """
            INSERT INTO model_run_metrics
                (run_id, model_type, roc_auc, brier_score, n_customers, run_date, is_champion)
            VALUES (:run_id, 'xgboost', :auc, :brier, :n, :run_date, TRUE)
        """,
            {
                "run_id": run_id,
                "auc": auc,
                "brier": brier,
                "n": len(df),
                "run_date": date.today(),
            },
        )

    return model, run_id


def score_all_customers_xgb(model: XGBClassifier) -> int:
    """
    Score all customers and UPDATE the predictions table with xgb_churn_prob.
    Cox PH must have run first (predictions table must exist).
    """
    logger.info("[XGB] Scoring all customers...")

    df = query_df(
        f"""
        SELECT customer_id, {', '.join(FEATURES)}
        FROM customer_features
        WHERE tenure_days > 7
    """
    )
    df = df.fillna(0)
    probs = model.predict_proba(df[FEATURES])[:, 1].round(5)

    # Batch UPDATE
    preds = pd.DataFrame(
        {
            "customer_id": df["customer_id"].values,
            "xgb_churn_prob": probs,
        }
    )

    # Write temp, then update
    preds.to_sql(
        "_tmp_xgb_preds",
        execute_sql.__self__ if hasattr(execute_sql, "__self__") else None,
        if_exists="replace",
        index=False,
    )

    # Use direct DataFrame-based update via upsert approach
    from db.connection import engine

    preds.to_sql("_tmp_xgb", engine, if_exists="replace", index=False)
    rows = execute_sql(
        """
        UPDATE predictions p
        SET xgb_churn_prob = x.xgb_churn_prob,
            scored_at      = NOW()
        FROM _tmp_xgb x
        WHERE p.customer_id = x.customer_id::uuid;

        DROP TABLE IF EXISTS _tmp_xgb;
    """
    )

    logger.info(f"[XGB] Updated {len(preds)} predictions")
    return len(preds)


if __name__ == "__main__":
    model, run_id = train_xgb_model()
    score_all_customers_xgb(model)
