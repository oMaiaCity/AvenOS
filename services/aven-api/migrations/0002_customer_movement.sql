-- Placement and migration history remain available when either customer host is lost.
CREATE TABLE customer_runtimes (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9-]{0,62}$'),
  release_sha text CHECK (release_sha ~ '^[0-9a-f]{40}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO customer_runtimes(id) VALUES ('primary');

ALTER TABLE customer_environments
  ADD COLUMN runtime_id text NOT NULL DEFAULT 'primary' REFERENCES customer_runtimes(id),
  ADD COLUMN movement_id uuid;

CREATE TABLE customer_movements (
  id uuid PRIMARY KEY,
  environment_id uuid NOT NULL REFERENCES customer_environments(id),
  source_runtime_id text NOT NULL REFERENCES customer_runtimes(id),
  destination_runtime_id text NOT NULL REFERENCES customer_runtimes(id),
  source_generation bigint NOT NULL CHECK (source_generation > 0),
  destination_generation bigint NOT NULL CHECK (destination_generation > source_generation),
  phase text NOT NULL CHECK (phase IN
    ('paused','fenced','copied','verified','activated','completed','cancelled','superseded')),
  mode text NOT NULL CHECK (mode IN ('move','rollback')),
  rollback_of uuid REFERENCES customer_movements(id),
  accept_divergence boolean NOT NULL DEFAULT false,
  evidence jsonb NOT NULL DEFAULT '{}',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (source_runtime_id <> destination_runtime_id),
  CHECK ((mode='move' AND rollback_of IS NULL AND NOT accept_divergence)
    OR (mode='rollback' AND rollback_of IS NOT NULL AND accept_divergence))
);
CREATE UNIQUE INDEX customer_movement_active_idx ON customer_movements(environment_id)
  WHERE phase NOT IN ('completed','cancelled','superseded');
ALTER TABLE customer_environments ADD CONSTRAINT customer_movement_fk
  FOREIGN KEY (movement_id) REFERENCES customer_movements(id);

REVOKE ALL ON customer_movements FROM aven_api_authorization,aven_api_entitlements;
GRANT SELECT ON customer_runtimes TO aven_api_authorization,aven_api_entitlements;
GRANT SELECT,INSERT,UPDATE ON customer_runtimes,customer_movements TO aven_api_reconciler;
