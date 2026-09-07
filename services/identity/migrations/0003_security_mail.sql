ALTER TABLE "user" ADD COLUMN notification_channel text;
--> statement-breakpoint
CREATE TABLE identity_security_mail (
  id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  channel text NOT NULL, kind text NOT NULL CHECK(kind IN ('setup-used','first-passkey','setup-replaced')),
  token_ciphertext text, dedupe_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0, delivered_at timestamptz, dead boolean NOT NULL DEFAULT false
);
--> statement-breakpoint
CREATE INDEX identity_security_mail_pending ON identity_security_mail(available_at) WHERE delivered_at IS NULL AND NOT dead;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON identity_security_mail TO aven_identity_auth;
