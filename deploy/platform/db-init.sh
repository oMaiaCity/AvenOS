#!/bin/sh
set -eu

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
SELECT 'CREATE ROLE aven_checkout_owner NOLOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_checkout_owner')\gexec
SELECT 'CREATE ROLE aven_checkout_http LOGIN NOINHERIT' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_checkout_http')\gexec
SELECT 'CREATE ROLE aven_checkout_webhooks LOGIN NOINHERIT' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_checkout_webhooks')\gexec
SELECT 'CREATE ROLE aven_checkout_migrator LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_checkout_migrator')\gexec
SELECT 'CREATE ROLE aven_checkout_email LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_checkout_email')\gexec
SELECT 'CREATE ROLE aven_checkout_platform_events LOGIN NOINHERIT' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_checkout_platform_events')\gexec
SELECT 'CREATE ROLE aven_api_owner NOLOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_api_owner')\gexec
SELECT 'CREATE ROLE aven_api_hosting LOGIN NOINHERIT' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_api_hosting')\gexec
SELECT 'CREATE ROLE aven_api_authorization LOGIN NOINHERIT' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_api_authorization')\gexec
SELECT 'CREATE ROLE aven_api_entitlements LOGIN NOINHERIT' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_api_entitlements')\gexec
SELECT 'CREATE ROLE aven_api_reconciler LOGIN NOINHERIT' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_api_reconciler')\gexec
SELECT 'CREATE ROLE aven_api_migrator LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_api_migrator')\gexec
SELECT 'CREATE ROLE aven_customer_provisioner LOGIN NOINHERIT CREATEDB CREATEROLE' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_customer_provisioner')\gexec
SELECT 'CREATE ROLE aven_artifact_store_provisioner LOGIN INHERIT' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_artifact_store_provisioner')\gexec
SELECT 'CREATE ROLE aven_backup LOGIN INHERIT' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_backup')\gexec
ALTER ROLE aven_checkout_http PASSWORD '${CHECKOUT_RUNTIME_PASSWORD}';
ALTER ROLE aven_checkout_webhooks PASSWORD '${CHECKOUT_WEBHOOK_PASSWORD}';
ALTER ROLE aven_checkout_migrator PASSWORD '${CHECKOUT_MIGRATOR_PASSWORD}';
ALTER ROLE aven_checkout_email PASSWORD '${CHECKOUT_EMAIL_PASSWORD}';
ALTER ROLE aven_checkout_platform_events PASSWORD '${CHECKOUT_PLATFORM_EVENTS_PASSWORD}';
ALTER ROLE aven_api_hosting PASSWORD '${API_HOSTING_PASSWORD}';
ALTER ROLE aven_api_authorization PASSWORD '${API_AUTHORIZATION_PASSWORD}';
ALTER ROLE aven_api_entitlements PASSWORD '${API_ENTITLEMENTS_PASSWORD}';
ALTER ROLE aven_api_reconciler PASSWORD '${API_RECONCILER_PASSWORD}';
ALTER ROLE aven_api_migrator PASSWORD '${API_MIGRATOR_PASSWORD}';
ALTER ROLE aven_customer_provisioner PASSWORD '${CUSTOMER_PROVISIONER_PASSWORD}';
ALTER ROLE aven_artifact_store_provisioner PASSWORD '${ARTIFACT_STORE_PROVISIONER_DB_PASSWORD}';
ALTER ROLE aven_backup LOGIN INHERIT PASSWORD '${PLATFORM_BACKUP_PASSWORD}';
GRANT pg_read_all_data TO aven_backup;
GRANT aven_checkout_owner TO aven_checkout_migrator WITH ADMIN OPTION;
GRANT aven_api_owner TO aven_api_migrator WITH ADMIN OPTION;
SELECT 'CREATE DATABASE aven_checkout OWNER aven_checkout_owner' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='aven_checkout')\gexec
SELECT 'CREATE DATABASE aven_api OWNER aven_api_owner' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='aven_api')\gexec
REVOKE ALL ON DATABASE aven_checkout FROM PUBLIC;
REVOKE ALL ON DATABASE aven_api FROM PUBLIC;
GRANT CONNECT ON DATABASE aven_checkout TO aven_checkout_http, aven_checkout_webhooks, aven_checkout_email, aven_checkout_platform_events, aven_checkout_migrator, aven_backup;
GRANT CONNECT ON DATABASE aven_api TO aven_api_hosting, aven_api_authorization, aven_api_entitlements, aven_api_reconciler, aven_api_migrator, aven_backup;
EOSQL

for database in aven_checkout aven_api; do
  psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$database" <<-EOSQL
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
EOSQL
done
