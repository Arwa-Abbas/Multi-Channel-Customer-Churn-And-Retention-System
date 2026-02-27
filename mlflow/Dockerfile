FROM ghcr.io/mlflow/mlflow:v2.13.0

RUN pip install psycopg2-binary

CMD mlflow server \
    --host 0.0.0.0 \
    --port 5000 \
    --backend-store-uri postgresql://postgres:postgres@postgres:5432/postgres \
    --default-artifact-root /mlflow/artifacts