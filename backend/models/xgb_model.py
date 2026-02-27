import joblib, os
import pandas as pd
import numpy as np
import shap
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, classification_report
from db.connection import query_df, engine

FEATURES = [
    "recency_days",
    "frequency",
    "monetary",
    "tenure_days",
    "avg_order_value",
    "web_sessions_30d",
    "ticket_count_90d",
    "avg_resolution_days",
]


def train_xgb():
    df = query_df("SELECT * FROM customer_features")
    df = df.dropna(subset=FEATURES + ["churn_flag"])
    X = df[FEATURES]
    y = df["churn_flag"].astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )

    model = XGBClassifier(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=(y == 0).sum() / (y == 1).sum(),
        random_state=42,
        eval_metric="auc",
    )
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=50)

    probs = model.predict_proba(X_test)[:, 1]
    auc = roc_auc_score(y_test, probs)
    print(f"\n[XGB] Test ROC-AUC: {auc:.4f}")
    print(classification_report(y_test, (probs > 0.5).astype(int)))

    # Compute SHAP values for feature importance
    explainer = shap.TreeExplainer(model)
    shap_vals = explainer.shap_values(X_test)
    importance = pd.DataFrame(
        {"feature": FEATURES, "mean_abs_shap": np.abs(shap_vals).mean(axis=0)}
    ).sort_values("mean_abs_shap", ascending=False)
    print("\n[XGB] Feature Importance (SHAP):")
    print(importance.to_string(index=False))

    os.makedirs("models", exist_ok=True)
    joblib.dump(model, "models/xgb_model.pkl")
    importance.to_sql("shap_importance", engine, if_exists="replace", index=False)
    print("[XGB] Done!")


if __name__ == "__main__":
    train_xgb()
