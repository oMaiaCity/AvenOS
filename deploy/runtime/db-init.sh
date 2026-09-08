#!/bin/sh
set -eu

# Runtime clusters have no writable copy of identity, commerce, or the directory.
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set=platform_id="${CUSTOMER_PLATFORM_ID:?required}" \
  --set=provisioner_password="${CUSTOMER_PROVISIONER_PASSWORD:?required}" \
  --set=artifact_password="${ARTIFACT_STORE_PROVISIONER_DB_PASSWORD:?required}" \
  --set=backup_password="${PLATFORM_BACKUP_PASSWORD:?required}" <<'SQL'
SELECT (shobj_description(oid,'pg_database')='aven-platform:' || :'platform_id'
  OR ((shobj_description(oid,'pg_database') IS NULL
       OR shobj_description(oid,'pg_database')='default administrative connection database')
      AND NOT EXISTS (SELECT FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres')
      AND NOT EXISTS (SELECT FROM pg_roles WHERE rolname !~ '^pg_' AND rolname <> current_user)))
  AS platform_matches FROM pg_database WHERE datname='postgres'\gset
\if :platform_matches
\else
  DO $$ BEGIN RAISE EXCEPTION 'Database cluster identity is unrecognized; refusing initialization.'; END $$;
\endif
SELECT format('COMMENT ON DATABASE postgres IS %L','aven-platform:' || :'platform_id')\gexec
SELECT 'CREATE ROLE aven_customer_provisioner LOGIN NOINHERIT CREATEDB CREATEROLE'
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_customer_provisioner')\gexec
SELECT 'CREATE ROLE aven_artifact_store_provisioner LOGIN INHERIT'
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_artifact_store_provisioner')\gexec
SELECT 'CREATE ROLE aven_backup LOGIN INHERIT'
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_backup')\gexec
SELECT format('ALTER ROLE aven_customer_provisioner LOGIN NOINHERIT CREATEDB CREATEROLE PASSWORD %L', :'provisioner_password')\gexec
SELECT format('ALTER ROLE aven_artifact_store_provisioner LOGIN INHERIT PASSWORD %L', :'artifact_password')\gexec
SELECT format('ALTER ROLE aven_backup LOGIN INHERIT PASSWORD %L', :'backup_password')\gexec
GRANT pg_read_all_data TO aven_backup;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
