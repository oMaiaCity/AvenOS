#!/bin/sh
set -eu

email=${1:-}
if [ -z "$email" ]; then
  echo "usage: bun run local:account -- you@example.test" >&2
  exit 2
fi

response=$(curl --fail-with-body --silent --show-error \
  --request POST \
  --header 'authorization: Bearer identity-provisioning-secret-for-e2e-only' \
  --header 'content-type: application/json' \
  --data "$(bun -e 'console.log(JSON.stringify({email:process.argv[1],source:"local-development"}))' "$email")" \
  http://127.0.0.1:13100/internal/v1/accounts)

event=$(LOCAL_ACCOUNT_RESPONSE=$response bun -e '
  import { randomUUID } from "node:crypto"
  const result = JSON.parse(process.env.LOCAL_ACCOUNT_RESPONSE)
  const localName = `local-${result.account.id.replaceAll("-", "").slice(0, 16)}`
  console.log(JSON.stringify({
    eventId: randomUUID(), eventType: "purchase_granted", subjectId: result.account.id,
    purchasedName: localName, occurredAt: new Date().toISOString()
  }))
')
environment=$(curl --fail-with-body --silent --show-error \
  --request POST \
  --header 'authorization: Bearer customer-entitlement-token-for-e2e' \
  --header 'content-type: application/json' \
  --data "$event" \
  http://127.0.0.1:13000/internal/v1/customer-entitlement-events)

LOCAL_ACCOUNT_RESPONSE=$response LOCAL_ENVIRONMENT_RESPONSE=$environment bun -e '
  const result = JSON.parse(process.env.LOCAL_ACCOUNT_RESPONSE)
  const environment = JSON.parse(process.env.LOCAL_ENVIRONMENT_RESPONSE)
  console.log(`Account: ${result.account.email}`)
  console.log(`Customer environment: ${environment.environmentId} (provisioning asynchronously)`)
  if (result.setupUrl) console.log(`Create the first passkey: ${result.setupUrl}`)
  else console.log("This account already has a passkey. Start the Rust client and sign in.")
'
