import joblib, os
import pandas as pd
import numpy as np
from lifelines import CoxPHFitter
from lifelines.utils import concordance_index
from db.connection import query_df, engine

FEATURES = [
    "tenure_days",
    "recency_days",
    "frequency",
    "monetary",
    "avg_order_value",
    "web_sessions_30d",
    "ticket_count_90d",
    "avg_resolution_days",
]
MODEL_PATH = "models/cox_model.pkl"


def load_training_data() -> pd.DataFrame:
    return query_df(
        """
        SELECT cf.*, 
               CASE WHEN cf.churn_flag THEN cf.recency_days ELSE 365 END AS duration
        FROM customer_features cf
        WHERE cf.tenure_days > 7
    """
    )


def train_cox_model():
    df = load_training_data()
    print(f"[Cox] Training on {len(df)} customers")

    # Drop rows with missing churn_flag or duration
    cox_df = df[FEATURES + ["duration", "churn_flag"]].dropna()
    cox_df["churn_flag"] = cox_df["churn_flag"].astype(int)

    # Remove low-variance columns (variance < 1e-4)
    low_var_cols = [col for col in FEATURES if cox_df[col].var() < 1e-4]
    if low_var_cols:
        print(f"[Cox] Dropping low-variance columns: {low_var_cols}")
        FEATURES_USED = [f for f in FEATURES if f not in low_var_cols]
    else:
        FEATURES_USED = FEATURES

    # Fill NaNs with 0 just in case
    cox_df[FEATURES_USED] = cox_df[FEATURES_USED].fillna(0)

    # Penalizer helps with convergence
    cph = CoxPHFitter(penalizer=0.1)
    cph.fit(
        cox_df[FEATURES_USED + ["duration", "churn_flag"]],
        duration_col="duration",
        event_col="churn_flag",
    )

    c_index = cph.concordance_index_
    print(f"[Cox] C-index: {c_index:.4f}")
    cph.print_summary()

    os.makedirs("models", exist_ok=True)
    joblib.dump(cph, MODEL_PATH)
    print(f"[Cox] Model saved to {MODEL_PATH}")
    return cph, df, FEATURES_USED


def score_customers(cph, df: pd.DataFrame, features_used):
    print("[Cox] Scoring all customers...")
    score_df = df[features_used].fillna(0)

    # Predict survival function at t=30 and t=90 directly
    sf_30 = cph.predict_survival_function(score_df, times=[30]).T
    sf_90 = cph.predict_survival_function(score_df, times=[90]).T

    predictions = pd.DataFrame({"customer_id": df["customer_id"].values})
    predictions["churn_prob_30d"] = (1 - sf_30[30].values).clip(0, 1).round(4)
    predictions["churn_prob_90d"] = (1 - sf_90[90].values).clip(0, 1).round(4)
    predictions["median_survival_days"] = cph.predict_median(score_df).values.astype(
        int
    )
    predictions["clv_estimate"] = (
        df["avg_order_value"].values
        * (df["frequency"].values / df["tenure_days"].clip(lower=1).values)
        * predictions["median_survival_days"]
    ).round(2)

    predictions.to_sql(
        "predictions", engine, if_exists="replace", index=False, chunksize=500
    )
    print(f"[Cox] {len(predictions)} predictions written to DB.")


if __name__ == "__main__":
    cph, df, features_used = train_cox_model()
    score_customers(cph, df, features_used)
