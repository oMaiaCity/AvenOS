#!/bin/sh
set -eu

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
SELECT 'CREATE ROLE aven_identity_owner NOLOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_identity_owner')\gexec
SELECT 'CREATE ROLE aven_identity_auth LOGIN NOINHERIT' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_identity_auth')\gexec
SELECT 'CREATE ROLE aven_identity_accounts LOGIN NOINHERIT' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_identity_accounts')\gexec
SELECT 'CREATE ROLE aven_identity_authorization LOGIN NOINHERIT' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_identity_authorization')\gexec
SELECT 'CREATE ROLE aven_identity_migrator LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_identity_migrator')\gexec
SELECT 'CREATE ROLE aven_backup LOGIN INHERIT' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aven_backup')\gexec
ALTER ROLE aven_identity_auth PASSWORD '${IDENTITY_AUTH_PASSWORD}';
ALTER ROLE aven_identity_accounts PASSWORD '${IDENTITY_ACCOUNTS_PASSWORD}';
ALTER ROLE aven_identity_authorization PASSWORD '${IDENTITY_AUTHORIZATION_PASSWORD}';
ALTER ROLE aven_identity_migrator PASSWORD '${IDENTITY_MIGRATOR_PASSWORD}';
ALTER ROLE aven_backup LOGIN INHERIT PASSWORD '${IDENTITY_BACKUP_PASSWORD}';
GRANT pg_read_all_data TO aven_backup;
GRANT aven_identity_owner TO aven_identity_migrator WITH ADMIN OPTION;
SELECT 'CREATE DATABASE aven_identity OWNER aven_identity_owner' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='aven_identity')\gexec
REVOKE ALL ON DATABASE aven_identity FROM PUBLIC;
GRANT CONNECT ON DATABASE aven_identity TO aven_identity_auth,aven_identity_accounts,aven_identity_authorization,aven_identity_migrator,aven_backup;
EOSQL

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname aven_identity <<-EOSQL
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO aven_identity_auth,aven_identity_accounts,aven_identity_authorization;
EOSQL
