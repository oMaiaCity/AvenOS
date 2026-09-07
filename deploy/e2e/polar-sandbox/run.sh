#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/../../.." && pwd)

if [ "${POLAR_SANDBOX_E2E:-}" != "true" ]; then
  echo "Set POLAR_SANDBOX_E2E=true to authorize the external sandbox test." >&2
  exit 2
fi
if [ "${POLAR_SERVER:-sandbox}" != "sandbox" ]; then
  echo "The Polar E2E test refuses every POLAR_SERVER except sandbox." >&2
  exit 2
fi
if [ -z "${POLAR_API_KEY:-}" ]; then
  echo "POLAR_API_KEY is required for the Polar Sandbox E2E test." >&2
  exit 2
fi
if [ -z "${POLAR_WEBHOOK_SECRET:-}" ]; then
  echo "POLAR_WEBHOOK_SECRET is required for the Polar Sandbox E2E test." >&2
  exit 2
fi
if [ -z "${AVEN_TIER_NAME:-}" ]; then
  echo "AVEN_TIER_NAME is required for the Polar Sandbox E2E test." >&2
  exit 2
fi

checkout_origin=${E2E_POLAR_CHECKOUT_ORIGIN:-http://127.0.0.1:13200}
checkout_browser_origin=${E2E_POLAR_CHECKOUT_BROWSER_ORIGIN:-http://localhost:13200}
identity_browser_origin=${E2E_POLAR_IDENTITY_BROWSER_ORIGIN:-http://localhost:13100}
mailpit_origin=${E2E_POLAR_MAILPIT_ORIGIN:-http://127.0.0.1:18025}
database_url=${E2E_POLAR_DATABASE_URL:-postgres://postgres:platform-admin-e2e@127.0.0.1:55439/postgres}

curl --fail --silent "$checkout_origin/api/health/ready" >/dev/null || {
  echo "Checkout is not ready. Start local:up with the documented Polar Sandbox variables." >&2
  exit 1
}
curl --fail --silent "$mailpit_origin/api/v1/messages" >/dev/null || {
  echo "Mailpit is not ready. Start the interactive local stack first." >&2
  exit 1
}

E2E_POLAR_CHECKOUT_ORIGIN=$checkout_origin \
E2E_POLAR_CHECKOUT_BROWSER_ORIGIN=$checkout_browser_origin \
E2E_POLAR_IDENTITY_BROWSER_ORIGIN=$identity_browser_origin \
E2E_POLAR_MAILPIT_ORIGIN=$mailpit_origin \
E2E_POLAR_DATABASE_URL=$database_url \
E2E_POLAR_API_KEY=$POLAR_API_KEY \
bunx playwright test --config "$root/deploy/e2e/polar-sandbox/playwright.config.ts"
