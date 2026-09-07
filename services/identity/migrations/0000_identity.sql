CREATE TABLE "user" (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false, role text NOT NULL DEFAULT 'user', image text,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  CONSTRAINT user_role CHECK (role IN ('user','admin'))
);
--> statement-breakpoint
CREATE TABLE session (
  id text PRIMARY KEY, expires_at timestamptz NOT NULL, token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, ip_address text, user_agent text,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE account (
  id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token text, refresh_token text, id_token text, access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz, scope text, password text,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE verification (
  id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, expires_at timestamptz NOT NULL,
  created_at timestamptz, updated_at timestamptz
);
--> statement-breakpoint
CREATE TABLE passkey (
  id text PRIMARY KEY, name text, public_key text NOT NULL,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE, counter integer NOT NULL, device_type text NOT NULL,
  backed_up boolean NOT NULL, transports text, created_at timestamptz NOT NULL, aaguid text,
  prf_enabled boolean NOT NULL DEFAULT false
);
--> statement-breakpoint
CREATE INDEX passkey_user_id_idx ON passkey(user_id);
--> statement-breakpoint
CREATE TABLE setup_links (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL, last_used_at timestamptz
);
--> statement-breakpoint
CREATE TABLE device_code (
  id text PRIMARY KEY, device_code text NOT NULL UNIQUE, user_code text NOT NULL UNIQUE,
  user_id text REFERENCES "user"(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL,
  status text NOT NULL, last_polled_at timestamptz, polling_interval integer, client_id text, scope text
);
--> statement-breakpoint
CREATE INDEX device_code_expires_idx ON device_code(expires_at);
--> statement-breakpoint
CREATE TABLE proof_of_work_challenges (
  id text PRIMARY KEY, nonce text NOT NULL, purpose text NOT NULL, difficulty_bits integer NOT NULL,
  expires_at bigint NOT NULL, used_at bigint, created_at bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX proof_of_work_challenges_expiry_idx ON proof_of_work_challenges(expires_at);
--> statement-breakpoint
CREATE TABLE jwks (
  id text PRIMARY KEY, public_key text NOT NULL, private_key text NOT NULL,
  created_at timestamptz NOT NULL, expires_at timestamptz
);
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO aven_identity_auth, aven_identity_accounts, aven_identity_authorization;
GRANT SELECT, INSERT, UPDATE, DELETE ON "user", session, account, verification, passkey,
  setup_links, device_code, proof_of_work_challenges, jwks TO aven_identity_auth;
GRANT SELECT, INSERT, UPDATE ON "user" TO aven_identity_accounts;
GRANT SELECT ON "user" TO aven_identity_authorization;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO aven_identity_auth;
ALTER DEFAULT PRIVILEGES FOR ROLE aven_identity_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aven_identity_auth;
ALTER DEFAULT PRIVILEGES FOR ROLE aven_identity_migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO aven_identity_auth;
