#!/bin/bash
# Runs automatically on first postgres container start.
# Creates the churndb + airflow databases and the churnapp user.

set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- App database user
    CREATE USER churnapp WITH PASSWORD 'password123';

    -- Main application database
    CREATE DATABASE churndb OWNER churnapp;
    GRANT ALL PRIVILEGES ON DATABASE churndb TO churnapp;

    -- Airflow uses its own database
    CREATE USER airflow WITH PASSWORD 'airflow';
    CREATE DATABASE airflow OWNER airflow;
    GRANT ALL PRIVILEGES ON DATABASE airflow TO airflow;

    -- MLflow uses churndb schema, needs access
    GRANT CONNECT ON DATABASE churndb TO airflow;
EOSQL

# Apply churn schema to churndb
psql -v ON_ERROR_STOP=1 --username "churnapp" --dbname "churndb" -f /docker-entrypoint-initdb.d/001_schema.sql || true

echo "Database initialization complete."
