ALTER TABLE setup_links ADD COLUMN expires_at timestamptz;
UPDATE setup_links SET expires_at = created_at + interval '7 days';
ALTER TABLE setup_links ALTER COLUMN expires_at SET NOT NULL;
ALTER TABLE session ADD COLUMN setup_token_hash text;
-- Existing sessions have no recorded authentication provenance. Require a fresh passkey sign-in.
DELETE FROM session;
