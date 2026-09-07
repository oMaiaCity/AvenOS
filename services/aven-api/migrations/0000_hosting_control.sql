CREATE TABLE site_bindings (
  id text PRIMARY KEY,
  owner_subject_id text,
  system_managed boolean NOT NULL DEFAULT false,
  hostname text NOT NULL UNIQUE,
  repository_full_name text NOT NULL,
  source_ref text NOT NULL,
  artifact_ref text NOT NULL,
  artifact_path text NOT NULL DEFAULT 'dist',
  verification_mode text NOT NULL DEFAULT 'txt',
  verification_token_hash text NOT NULL,
  desired_status text NOT NULL DEFAULT 'active',
  runtime_status text NOT NULL DEFAULT 'awaiting_dns',
  active_artifact_revision text,
  active_source_revision text,
  last_error text,
  verified_at timestamptz,
  last_dns_check_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT site_binding_owner CHECK (
    (system_managed AND owner_subject_id IS NULL) OR
    (NOT system_managed AND owner_subject_id IS NOT NULL)
  ),
  CONSTRAINT site_binding_repository CHECK (
    repository_full_name ~ '^[A-Za-z0-9_.-]{1,100}/[-A-Za-z0-9_.]{1,100}$' AND
    repository_full_name !~ '\.\.'
  ),
  CONSTRAINT site_binding_source_ref CHECK (source_ref LIKE 'refs/heads/%'),
  CONSTRAINT site_binding_artifact_ref CHECK (artifact_ref LIKE 'refs/heads/deploy/%'),
  CONSTRAINT site_binding_artifact_path CHECK (artifact_path = 'dist'),
  CONSTRAINT site_binding_verification_mode CHECK (verification_mode IN ('txt','operator')),
  CONSTRAINT site_binding_operator CHECK (
    verification_mode <> 'operator' OR
    (system_managed AND (hostname = 'aven.ceo' OR hostname LIKE '%.aven.ceo'))
  ),
  CONSTRAINT site_binding_token_hash CHECK (verification_token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT site_binding_desired_status CHECK (desired_status IN ('active','suspended')),
  CONSTRAINT site_binding_runtime_status CHECK (
    runtime_status IN ('awaiting_dns','syncing','active','dns_invalid','failed')
  )
);
CREATE UNIQUE INDEX site_binding_artifact_ref_unique
  ON site_bindings(repository_full_name, artifact_ref);
CREATE INDEX site_binding_owner_idx ON site_bindings(owner_subject_id);
CREATE INDEX site_binding_status_idx ON site_bindings(desired_status, runtime_status);
GRANT SELECT, INSERT, UPDATE, DELETE ON site_bindings TO aven_api_hosting;
ALTER DEFAULT PRIVILEGES FOR ROLE aven_api_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aven_api_hosting;
