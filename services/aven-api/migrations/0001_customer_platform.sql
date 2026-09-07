CREATE TABLE customer_entitlement_events (
  event_id uuid PRIMARY KEY,
  event_type text NOT NULL CHECK (event_type IN ('purchase_granted','purchase_revoked')),
  subject_id uuid NOT NULL,
  purchased_name text NOT NULL CHECK (purchased_name ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE customer_environments (
  id uuid PRIMARY KEY,
  purchased_name text NOT NULL UNIQUE,
  owner_subject_id uuid NOT NULL,
  database_name text NOT NULL UNIQUE CHECK (database_name ~ '^cust_[0-9a-f]{32}$'),
  desired_state text NOT NULL CHECK (desired_state IN ('ready','suspended')),
  observed_state text NOT NULL CHECK (observed_state IN ('pending','reconciling','ready','suspended','failed','unknown')),
  routing_generation bigint NOT NULL CHECK (routing_generation > 0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE customer_environment_memberships (
  environment_id uuid NOT NULL REFERENCES customer_environments(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','member')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (environment_id, subject_id)
);

CREATE TABLE customer_environment_components (
  environment_id uuid NOT NULL REFERENCES customer_environments(id) ON DELETE CASCADE,
  component_ref text NOT NULL,
  desired_state text NOT NULL CHECK (desired_state IN ('ready','suspended')),
  observed_state text NOT NULL CHECK (observed_state IN ('pending','reconciling','ready','suspended','failed','unknown')),
  target_schema_version integer NOT NULL CHECK (target_schema_version > 0),
  observed_schema_version integer,
  migration_set_digest text NOT NULL CHECK (migration_set_digest ~ '^[0-9a-f]{64}$'),
  observed_migration_set_digest text,
  routing_generation bigint NOT NULL CHECK (routing_generation > 0),
  last_operation_id uuid,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (environment_id, component_ref)
);

CREATE TABLE customer_component_operations (
  id uuid PRIMARY KEY,
  environment_id uuid NOT NULL REFERENCES customer_environments(id) ON DELETE CASCADE,
  component_ref text NOT NULL,
  action text NOT NULL CHECK (action IN ('reconcile','suspend')),
  status text NOT NULL CHECK (status IN ('queued','running','succeeded','failed','unknown')),
  target_schema_version integer NOT NULL,
  migration_set_digest text NOT NULL,
  routing_generation bigint NOT NULL,
  attempt integer NOT NULL DEFAULT 0,
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (environment_id, component_ref, action, routing_generation, target_schema_version, migration_set_digest)
);

CREATE INDEX customer_component_operations_claim_idx
  ON customer_component_operations(status, lease_expires_at, created_at);
CREATE INDEX customer_environment_memberships_subject_idx
  ON customer_environment_memberships(subject_id, environment_id);
CREATE INDEX customer_environment_components_state_idx
  ON customer_environment_components(observed_state, component_ref);

CREATE TABLE platform_worker_heartbeats (
  worker_name text PRIMARY KEY,
  instance_id text NOT NULL,
  catalog_digest text NOT NULL,
  started_at timestamptz NOT NULL,
  last_heartbeat_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'
);

GRANT SELECT ON
  customer_environments,
  customer_environment_memberships,
  customer_environment_components
TO aven_api_authorization;

GRANT SELECT, INSERT, UPDATE ON
  customer_entitlement_events,
  customer_environments,
  customer_environment_memberships,
  customer_environment_components,
  customer_component_operations,
  platform_worker_heartbeats
TO aven_api_entitlements;

GRANT SELECT, INSERT, UPDATE ON
  customer_environments,
  customer_environment_components,
  customer_component_operations,
  platform_worker_heartbeats
TO aven_api_reconciler;

ALTER DEFAULT PRIVILEGES FOR ROLE aven_api_migrator IN SCHEMA public
  GRANT SELECT ON TABLES TO aven_api_authorization;
