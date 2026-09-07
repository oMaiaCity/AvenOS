CREATE TABLE polar_webhook_deliveries (
  delivery_id text PRIMARY KEY,
  event_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  headers jsonb NOT NULL,
  state text NOT NULL DEFAULT 'processing' CHECK (state IN ('processing','processed','failed')),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  processing_error text,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  processed_at timestamptz
);

CREATE INDEX polar_webhook_deliveries_event_idx
  ON polar_webhook_deliveries(event_type,event_id,received_at DESC);
CREATE INDEX polar_webhook_deliveries_state_idx
  ON polar_webhook_deliveries(state,received_at);
