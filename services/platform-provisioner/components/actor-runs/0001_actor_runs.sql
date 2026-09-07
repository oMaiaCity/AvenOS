CREATE TABLE aven_actor_runs.runs (
  id uuid PRIMARY KEY,
  subject_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  material_hash text NOT NULL,
  state text NOT NULL,
  revision bigint NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(subject_id,idempotency_key)
);

CREATE INDEX actor_runs_subject_updated_idx
  ON aven_actor_runs.runs(subject_id,updated_at DESC,id);
