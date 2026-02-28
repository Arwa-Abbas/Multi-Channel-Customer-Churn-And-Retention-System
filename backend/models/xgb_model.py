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
from sklearn.metrics import (
    roc_auc_score,
    brier_score_loss,
    classification_report,
    average_precision_score,
)
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

os.environ["GIT_PYTHON_REFRESH"] = "quiet"

from db.connection import query_df, execute_sql, upsert_df, engine

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


def _handle_class_imbalance(X, y):
    churn_rate = y.mean()
    logger.info(f"[XGB] Churn rate: {churn_rate:.2%}")
    if churn_rate < 0.20:
        logger.info("[XGB] Applying SMOTE")
        sm = SMOTE(random_state=42, k_neighbors=5)
        X, y = sm.fit_resample(X, y)
        logger.info(f"[XGB] After SMOTE: {len(X)} samples")
    return X, y


def _compute_shap(model, X):
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


def train_xgb_model():
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    mlflow.set_tracking_uri(MLFLOW_URI)
    mlflow.set_experiment("churn-xgboost-classifier")

    df = query_df(
        f"""
        SELECT customer_id, {', '.join(FEATURES)}, churn_flag
        FROM customer_features
        WHERE tenure_days > 7
    """
    )
    df = df.fillna(0)
    X = df[FEATURES]
    y = df["churn_flag"].astype(int)
    logger.info(f"[XGB] Dataset: {len(df)} rows, churn={y.mean():.2%}")

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
        scale_pos_weight=1,
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

        probs = model.predict_proba(X_test)[:, 1]
        auc = roc_auc_score(y_test, probs)
        brier = brier_score_loss(y_test, probs)
        ap = average_precision_score(y_test, probs)

        logger.info(f"[XGB] ROC-AUC: {auc:.4f}  Brier: {brier:.4f}  AP: {ap:.4f}")
        logger.info(
            f"\n{classification_report(y_test, (probs > 0.5).astype(int), zero_division=0)}"
        )

        mlflow.log_metrics(
            {
                "roc_auc": round(auc, 4),
                "brier_score": round(brier, 4),
                "avg_precision": round(ap, 4),
            }
        )

        if auc < 0.78:
            logger.warning(f"[XGB] AUC {auc:.4f} below target 0.78")
            mlflow.set_tag("quality_flag", "below_target")

        # SHAP
        importance = _compute_shap(model, X_test.head(500))
        mlflow.log_dict(importance.to_dict(orient="records"), "shap_importance.json")

        joblib.dump(model, MODEL_PATH)
        mlflow.log_artifact(str(MODEL_PATH), artifact_path="models")

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


def score_all_customers_xgb(model):
    """Score all customers and UPDATE predictions.xgb_churn_prob."""
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

    preds = pd.DataFrame(
        {
            "customer_id": df["customer_id"].values,
            "xgb_churn_prob": probs,
            "scored_at": pd.Timestamp.utcnow(),
        }
    )

    # Write to temp table
    preds.to_sql("_tmp_xgb", engine, if_exists="replace", index=False)

    # Update existing predictions AND insert new ones
    execute_sql(
        """
        -- Update existing rows
        UPDATE predictions p
        SET xgb_churn_prob = t.xgb_churn_prob,
            scored_at = t.scored_at
        FROM _tmp_xgb t
        WHERE p.customer_id = t.customer_id::uuid;
        
        -- Insert new rows for customers not in predictions yet
        INSERT INTO predictions (customer_id, xgb_churn_prob, scored_at)
        SELECT t.customer_id::uuid, t.xgb_churn_prob, t.scored_at
        FROM _tmp_xgb t
        LEFT JOIN predictions p ON p.customer_id = t.customer_id::uuid
        WHERE p.customer_id IS NULL;
        
        DROP TABLE IF EXISTS _tmp_xgb;
    """
    )

    # Count how many predictions now have xgb_churn_prob
    count_df = query_df(
        "SELECT COUNT(*) as count FROM predictions WHERE xgb_churn_prob IS NOT NULL"
    )
    count = count_df.iloc[0]["count"] if not count_df.empty else 0

    logger.info(f"[XGB] Updated/Inserted predictions for {count} customers")
    return count


if __name__ == "__main__":
    model, run_id = train_xgb_model()
    score_all_customers_xgb(model)
