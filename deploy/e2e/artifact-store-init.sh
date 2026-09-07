#!/bin/sh
set -eu

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
SELECT 'CREATE DATABASE aven_artifact_conformance' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='aven_artifact_conformance')\gexec
EOSQL

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname aven_artifact_conformance <<-EOSQL
CREATE SCHEMA IF NOT EXISTS artifact_store;
EOSQL
