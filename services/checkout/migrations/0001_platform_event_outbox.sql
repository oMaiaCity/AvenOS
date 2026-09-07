CREATE TABLE platform_event_outbox (
  id uuid PRIMARY KEY,
  event_type text NOT NULL CHECK (event_type IN ('purchase_granted','purchase_revoked')),
  subject_id uuid NOT NULL,
  purchased_name text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','delivered','dead')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX platform_event_outbox_claim_idx
  ON platform_event_outbox(status,available_at,lease_expires_at,created_at);
