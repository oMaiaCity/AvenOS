# Aven Identity (`aven.id`)

This service owns the complete human identity boundary: account provisioning,
passkey registration and authentication, sessions, native device authorization,
and short-lived signed access tokens. No Aven business service may read its
database.

Public verification is deliberately small:

- `GET /api/auth/jwks` publishes rotating Ed25519 verification keys.
- `GET /api/auth/token` exchanges an authenticated identity session for a
  five-minute `aven-services` JWT.
- `GET /.well-known/openid-configuration` advertises those endpoints.

The authenticated `/dashboard` lists the account's credentials and allows the
holder to add and rename passkeys. Registration suggests `aven.id-<email>-<device>-<browser>`;
the holder edits that suggestion before the phone/password-manager creation prompt.
The chosen value is sent in both WebAuthn `user.name` and `user.displayName` before
`navigator.credentials.create`, without changing the opaque user handle, RP ID,
challenge, verification requirements, or exclusions. The password manager owns its
presentation and may shorten or otherwise format that label.
**Rename** afterward changes only the account's displayed list label.
Names are trimmed, limited to 128 characters, and cannot contain control characters.
The existing identity plugin owns registration and ownership-checked renaming; changing
the label does not change credential material or rename the password-manager entry.
Device/browser names are coarse suggestions, not hardware identification.

The provisioning endpoint under
`/internal/v1/accounts` is service-authenticated and is the only signup ingress;
it returns a bootstrap link only until the first qualifying passkey exists.

## Pending enrollment

Setup links contain a random token whose verification record stores only a hash, expire after seven days,
and remain usable across browsers until enrollment. Opening a link creates a
30-minute setup-only session and redirects to a clean URL. That session cannot obtain
an ordinary service JWT. Issuing a replacement invalidates the previous link and its
pending sessions. First-passkey insertion, link removal and all setup-session revocation
share one database transaction and account lock. A second browser cannot win the same
first-enrollment race. Established passkey sessions can register additional credentials.

The setup-session migration revokes existing sessions because their historical
provenance cannot be established. It does not delete accounts or passkeys.

A pending dashboard can request a replacement email, at most once per minute per
account. The existing service-authenticated provisioning action also accepts `resend:
true` for support; it returns an email-queued result, not the replacement token. Issuing
the new link, revoking old setup sessions and queuing its email are one transaction.
The replacement ends the current setup session; the user continues from the new email.

Opening a setup link and registering the first passkey queue security notices. Link-use
notices coalesce per account/hour. Neither notice includes a setup token. A durable
identity outbox retries delivery to the checkout environment that provisioned the
account; checkout uses its existing encrypted email queue and SMTP worker. Relay
credentials are purpose-derived from each environment's provisioning secret, never
interchangeable with that secret or another environment's credential. Identity receives
no SMTP key. `IDENTITY_MAIL_ORIGINS` must follow `IDENTITY_PROVISIONING_SECRETS` order;
the deployment renders both. Keep each origin paired with its environment's secret.
Changing an origin also requires migrating persisted account delivery channels.

Replacement delivery temporarily retains an AES-GCM-encrypted token in the identity
outbox, using a purpose-derived key from `BETTER_AUTH_SECRET`; the authentication record
still contains only its hash. Relay acknowledgement clears that encrypted copy. The
checkout queue encrypts its delivery payload independently. Superseded/expired tokens
are not retried, delivered metadata is removed after seven days, and failed records
after thirty days. Drain replacement messages before rotating the identity secret.
Old accounts without a delivery channel need the authenticated support resend action
to associate their provisioning environment; do not invent a recipient or channel.

Proof-of-work issuance is stateless: purpose-bound, expiring challenges are signed with
a daily derived HMAC key. Only verified redemptions write a short-lived, unique replay
marker. Current and immediately previous key generations are accepted within challenge
lifetime. Indexed cleanup drains bounded batches without making issuance wait for SQL.
The worker logs aggregate proof counts and cleanup backlog, never challenge tokens.
