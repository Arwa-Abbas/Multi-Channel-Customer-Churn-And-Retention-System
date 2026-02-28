import json
import logging
import os
import warnings
from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from lifelines import CoxPHFitter, KaplanMeierFitter
from sklearn.preprocessing import StandardScaler

os.environ["GIT_PYTHON_REFRESH"] = "quiet"
warnings.filterwarnings("ignore")

import mlflow
from db.connection import query_df, execute_sql, engine

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

MLFLOW_URI = os.environ.get("MLFLOW_TRACKING_URI", "http://localhost:5000")
ARTIFACT_DIR = Path("models/artifacts")
MODEL_PATH = ARTIFACT_DIR / "cox_model.pkl"
SCALER_PATH = ARTIFACT_DIR / "cox_scaler.pkl"
KM_PATH = ARTIFACT_DIR / "km_results.json"

DURATION_COL = "duration_days"
EVENT_COL = "churn_flag"

CORE_FEATURES = [
    "tenure_days",
    "recency_days",
    "avg_order_value",
    "rfm_tier_encoded",
    "frequency",
    "monetary",
]
OPTIONAL_FEATURES = [
    "frequency_90d",
    "ticket_count_90d",
    "avg_resolution_days",
    "web_sessions_30d",
]


def load_training_data():
    all_cols = CORE_FEATURES + OPTIONAL_FEATURES
    df = query_df(
        f"""
        SELECT customer_id, {', '.join(all_cols)},
               {DURATION_COL}, {EVENT_COL}::int AS {EVENT_COL}
        FROM customer_features
        WHERE tenure_days > 7 AND duration_days > 0 AND duration_days IS NOT NULL
    """
    )
    df = df.fillna(0)
    p99 = df["tenure_days"].quantile(0.99)
    df = df[df["tenure_days"] <= p99].copy()
    logger.info(f"[Cox] {len(df)} rows | churn={df[EVENT_COL].mean():.1%}")
    return df


def select_features(df):
    events = df[EVENT_COL].astype(bool)
    selected = []
    for col in CORE_FEATURES + OPTIONAL_FEATURES:
        if col not in df.columns:
            continue
        s_all = df[col].std()
        s_ev = df.loc[events, col].std() if events.sum() > 1 else 0.0
        s_no = df.loc[~events, col].std() if (~events).sum() > 1 else 0.0
        if min(s_all, s_ev, s_no) < 0.01:
            logger.warning(
                f"[Cox] DROP '{col}' stds: all={s_all:.4f} ev={s_ev:.4f} no={s_no:.4f}"
            )
        else:
            logger.info(
                f"[Cox] KEEP '{col}' stds: all={s_all:.3f} ev={s_ev:.3f} no={s_no:.3f}"
            )
            selected.append(col)
    if len(selected) < 2:
        logger.warning("[Cox] Fallback to recency_days + tenure_days only")
        selected = ["recency_days", "tenure_days"]
    logger.info(f"[Cox] Features ({len(selected)}): {selected}")
    return selected


def scale_features(df, features, scaler=None):
    if scaler is None:
        scaler = StandardScaler()
        scaled = scaler.fit_transform(df[features])
    else:
        scaled = scaler.transform(df[features])
    out = pd.DataFrame(scaled, columns=features, index=df.index)
    out[DURATION_COL] = df[DURATION_COL].values
    out[EVENT_COL] = df[EVENT_COL].values
    return out, scaler


def fit_kaplan_meier(df):
    tiers_df = query_df("SELECT customer_id, rfm_tier FROM customer_features")
    merged = df.merge(
        tiers_df[["customer_id", "rfm_tier"]], on="customer_id", how="left"
    )
    results = {}
    kmf = KaplanMeierFitter()
    for tier in merged["rfm_tier"].dropna().unique():
        sub = merged[merged["rfm_tier"] == tier]
        if len(sub) < 5:
            continue
        kmf.fit(sub[DURATION_COL], sub[EVENT_COL], label=tier)
        sf = kmf.survival_function_
        ci = kmf.confidence_interval_survival_function_
        med = kmf.median_survival_time_
        results[tier] = {
            "timeline": [float(x) for x in sf.index],
            "survival": [float(x) for x in sf[tier]],
            "ci_lower": [float(x) for x in ci[f"{tier}_lower_0.95"]],
            "ci_upper": [float(x) for x in ci[f"{tier}_upper_0.95"]],
            "median": float(med) if not np.isnan(med) else -1.0,
            "n_subjects": int(len(sub)),
            "n_events": int(sub[EVENT_COL].sum()),
        }
        logger.info(
            f"[KM] {tier:25s} n={len(sub):>5}  median={results[tier]['median']:.0f}d"
        )
    return results


def train_cox_model():
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    mlflow.set_tracking_uri(MLFLOW_URI)
    mlflow.set_experiment("churn-survival-analysis")

    df = load_training_data()
    features = select_features(df)
    cox_df, scaler = scale_features(df, features)

    with mlflow.start_run(run_name=f"cox-ph-{date.today()}") as run:
        run_id = run.info.run_id
        logger.info(f"[Cox] MLflow run_id: {run_id}")
        mlflow.log_params(
            {
                "model_type": "CoxPH",
                "n_customers": len(df),
                "n_features": len(features),
                "features": ",".join(features),
                "churn_rate": round(float(df[EVENT_COL].mean()), 4),
            }
        )

        # Try fitting with progressively fewer features if convergence fails
        remaining = list(features)
        cph = None
        while len(remaining) >= 2:
            try:
                logger.info(
                    f"[Cox] Fitting with {len(remaining)} features: {remaining}"
                )

                # Prepare data with proper types
                fit_df = cox_df[remaining + [DURATION_COL, EVENT_COL]].copy()
                for col in fit_df.columns:
                    fit_df[col] = pd.to_numeric(fit_df[col], errors="coerce").fillna(0)

                # Check for any issues
                if fit_df.isnull().any().any():
                    fit_df = fit_df.fillna(0)

                cph = CoxPHFitter()
                cph.fit(
                    fit_df,
                    duration_col=DURATION_COL,
                    event_col=EVENT_COL,
                    step_size=0.5,
                    show_progress=False,
                )
                logger.info(f"[Cox] Converged!")
                break
            except Exception as e:
                logger.warning(f"[Cox] Failed with {remaining}: {str(e)}")
                dropped = remaining.pop()
                logger.warning(f"[Cox] Dropping '{dropped}'")
                cph = None

        if cph is None:
            # Last resort: use only tenure_days
            logger.warning("[Cox] Trying with just tenure_days...")
            fit_df = cox_df[["tenure_days", DURATION_COL, EVENT_COL]].copy()
            fit_df["tenure_days"] = pd.to_numeric(
                fit_df["tenure_days"], errors="coerce"
            ).fillna(0)
            cph = CoxPHFitter()
            cph.fit(
                fit_df, duration_col=DURATION_COL, event_col=EVENT_COL, step_size=0.5
            )
            remaining = ["tenure_days"]
            logger.info("[Cox] Converged with just tenure_days!")

        features = remaining
        c_index = float(cph.concordance_index_)
        logger.info(f"[Cox] C-index: {c_index:.4f}")
        mlflow.log_metrics({"c_index": round(c_index, 4)})

        joblib.dump(cph, MODEL_PATH)
        joblib.dump(scaler, SCALER_PATH)
        mlflow.log_artifact(str(MODEL_PATH), artifact_path="models")
        mlflow.log_artifact(str(SCALER_PATH), artifact_path="models")
        logger.info(f"[Cox] Model + scaler saved to {ARTIFACT_DIR}")

        km_results = fit_kaplan_meier(df)
        with open(KM_PATH, "w") as f:
            json.dump(km_results, f)
        mlflow.log_artifact(str(KM_PATH), artifact_path="models")
        logger.info(f"[Cox] K-M curves saved")

    return cph, df, features, run_id


def score_all_customers(cph, df, features, run_id):
    logger.info("[Cox] Scoring all customers ...")
    scaler = joblib.load(SCALER_PATH)
    score_df, _ = scale_features(df, features, scaler=scaler)

    sf_matrix = cph.predict_survival_function(score_df[features])

    def survival_at(days):
        idx = sf_matrix.index[sf_matrix.index <= days]
        return sf_matrix.loc[idx[-1]].values if len(idx) > 0 else np.ones(len(score_df))

    churn_30d = (1 - survival_at(30)).clip(0, 1).round(5)
    churn_90d = (1 - survival_at(90)).clip(0, 1).round(5)
    median_sur = np.nan_to_num(cph.predict_median(score_df[features]).values, nan=180)

    aov = df["avg_order_value"].values
    daily_frq = np.where(
        df["tenure_days"] > 0, df["frequency"].values / df["tenure_days"].values, 0.01
    )
    remaining = np.clip(median_sur, 30, 365)
    clv = (aov * daily_frq * remaining).round(2)

    preds = pd.DataFrame(
        {
            "customer_id": df["customer_id"].values,
            "churn_prob_30d": churn_30d,
            "churn_prob_90d": churn_90d,
            "median_survival_days": median_sur.astype(int),
            "clv_estimate": clv,
            "model_version": f"cox-{run_id[:8]}",
            "scored_at": pd.Timestamp.utcnow(),
        }
    )

    # Write to temp table
    preds.to_sql("_tmp_cox", engine, if_exists="replace", index=False)

    # Update existing AND insert new
    execute_sql(
        """
        -- Update existing rows
        UPDATE predictions p
        SET churn_prob_30d = t.churn_prob_30d,
            churn_prob_90d = t.churn_prob_90d,
            median_survival_days = t.median_survival_days,
            clv_estimate = t.clv_estimate,
            model_version = t.model_version,
            scored_at = t.scored_at
        FROM _tmp_cox t
        WHERE p.customer_id = t.customer_id::uuid;
        
        -- Insert new rows
        INSERT INTO predictions (
            customer_id, churn_prob_30d, churn_prob_90d, 
            median_survival_days, clv_estimate, model_version, scored_at
        )
        SELECT 
            t.customer_id::uuid, t.churn_prob_30d, t.churn_prob_90d,
            t.median_survival_days, t.clv_estimate, t.model_version, t.scored_at
        FROM _tmp_cox t
        LEFT JOIN predictions p ON p.customer_id = t.customer_id::uuid
        WHERE p.customer_id IS NULL;
        
        DROP TABLE IF EXISTS _tmp_cox;
    """
    )

    # Log model metrics
    execute_sql(
        """
        INSERT INTO model_run_metrics
            (run_id, model_type, c_index, n_customers, run_date, is_champion)
        VALUES (:run_id, 'cox', :c_index, :n, :run_date, TRUE)
        ON CONFLICT (run_id) DO NOTHING
    """,
        {
            "run_id": run_id,
            "c_index": float(cph.concordance_index_),
            "n": len(preds),
            "run_date": date.today(),
        },
    )

    logger.info(f"[Cox] Done — predictions saved")
    return len(preds)


if __name__ == "__main__":
    try:
        cph, df, features, run_id = train_cox_model()
        score_all_customers(cph, df, features, run_id)
    except Exception as e:
        logger.error(f"[Cox] Failed: {e}")
        # Still try to create some predictions
        from models.xgb_model import score_all_customers_xgb
        import joblib

        model = joblib.load("models/artifacts/xgb_model.pkl")
        score_all_customers_xgb(model)
