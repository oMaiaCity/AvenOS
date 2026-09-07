CREATE TABLE proof_of_work_redemptions (
  id text PRIMARY KEY, expires_at bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX proof_of_work_redemptions_expiry_idx ON proof_of_work_redemptions(expires_at);
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON proof_of_work_redemptions TO aven_identity_auth;
--> statement-breakpoint
-- Upgrades require clients with outstanding challenges to request a fresh one.
DROP TABLE proof_of_work_challenges;
