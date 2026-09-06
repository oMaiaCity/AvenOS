#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

sh -n \
  "$root/deploy/e2e/run.sh" \
  "$root/deploy/e2e/polar-sandbox/run.sh" \
  "$root/deploy/local/up.sh" \
  "$root/deploy/local/down.sh" \
  "$root/deploy/local/account.sh" \
  "$root/deploy/local/app.sh" \
  "$root/tools/db-tunnel/open.sh" \
  "$root/tools/stack-observe/run.sh" \
  "$root/deploy/operations/backup.sh" \
  "$root/deploy/operations/restore.sh" \
  "$root/deploy/operations/entrypoint.sh" \
  "$root/deploy/operations/healthcheck.sh"
bash -n \
  "$root/deploy/release/deploy.sh" \
  "$root/deploy/release/environment.sh" \
  "$root/deploy/release/ssh-staging.sh" \
  "$root/deploy/release/test-deploy.sh" \
  "$root/deploy/validate.sh" \
  "$root/deploy/operations/test-recovery.sh"
bash "$root/deploy/release/test-deploy.sh"
bun test "$root/deploy/local/llm-catalog.test.ts" "$root/deploy/e2e/llm-catalog.test.ts"

grep -Fq "if: inputs.target != 'identity'" "$root/.github/workflows/platform-deploy-target.yml"
bun test "$root/scripts/lib/platform-release.test.ts" "$root/deploy/e2e/mail-topology.test.ts"
for workflow in platform-ci.yml platform-release.yml; do
  grep -Fq 'uses: ./.github/actions/setup-platform-test-host' "$root/.github/workflows/$workflow" || {
    echo "$workflow must use the shared native platform test-host setup" >&2
    exit 1
  }
done
grep -Fq 'libasound2-dev' "$root/.github/actions/setup-platform-test-host/action.yml" || {
  echo 'the platform test host must install ALSA headers required by the native voice client' >&2
  exit 1
}
grep -Fq 'bunx playwright install chromium' "$root/.github/actions/setup-platform-test-host/action.yml" || {
  echo 'the platform test host must install the Chromium binary required by the browser E2E test' >&2
  exit 1
}
for workflow in platform-ci.yml platform-release.yml; do
  install_line=$(grep -n 'uses: ./.github/actions/bun-install' "$root/.github/workflows/$workflow" | head -1 | cut -d: -f1)
  host_line=$(grep -n 'uses: ./.github/actions/setup-platform-test-host' "$root/.github/workflows/$workflow" | head -1 | cut -d: -f1)
  if [[ -z "$install_line" || -z "$host_line" || "$install_line" -ge "$host_line" ]]; then
    echo "$workflow must install repository dependencies before the shared test host resolves Playwright" >&2
    exit 1
  fi
done
grep -Fq "http://127.0.0.1:3010/health/ready" "$root/services/intent-service/Dockerfile"

env \
  E2E_TENANT_PRIVATE_KEY=test-private-key \
  E2E_TENANT_PUBLIC_KEY=test-public-key \
  LLM_GATEWAY_ENABLED=true \
  LLM_GATEWAY_MODELS_JSON='[{"id":"deepseek/deepseek-v4-flash-0731","label":"Local test","capabilities":["text-generation","streaming","tool-calling","vision","structured-output"],"baseUrl":"http://host.docker.internal:1234/v1","upstreamModel":"test","profile":"generic-json","authMode":"none"}]' \
  LLM_GATEWAY_CREDENTIALS_JSON='{}' \
  LLM_GATEWAY_ALLOW_INSECURE_HTTP=true \
  docker compose \
    --file "$root/deploy/e2e/docker-compose.yml" \
    --file "$root/deploy/local/docker-compose.yml" \
    config --quiet

source "$root/deploy/release/environment.sh"
configure_platform_environment next
[[ "$public_domain $api_domain $checkout_domain" == 'next.aven.ceo api.next.aven.ceo portal.next.aven.ceo' ]]
configure_platform_environment production
[[ "$public_domain $api_domain $checkout_domain" == 'aven.ceo api.aven.ceo portal.aven.ceo' ]]
bun test "$root/deploy/local/llm-catalog.test.ts"

env \
  E2E_TENANT_PRIVATE_KEY=test-private-key \
  E2E_TENANT_PUBLIC_KEY=test-public-key \
  LLM_GATEWAY_ENABLED=true \
  LLM_GATEWAY_MODELS_JSON='[{"id":"deepseek/deepseek-v4-flash-0731","label":"Local test","capabilities":["text-generation","streaming","tool-calling"],"baseUrl":"http://host.docker.internal:1234/v1","upstreamModel":"test","profile":"generic-json","authMode":"none"}]' \
  LLM_GATEWAY_CREDENTIALS_JSON='{}' \
  LLM_GATEWAY_ALLOW_INSECURE_HTTP=true \
  docker compose \
    --file "$root/deploy/e2e/docker-compose.yml" \
    --file "$root/deploy/local/docker-compose.yml" \
    config --quiet

env \
  IDENTITY_IMAGE=identity:test \
  OPERATIONS_IMAGE=operations:test \
  DATABASE_IMAGE=database:test \
  PROXY_IMAGE=proxy:test \
  IDENTITY_POSTGRES_PASSWORD=test \
  IDENTITY_AUTH_PASSWORD=test-auth \
  IDENTITY_ACCOUNTS_PASSWORD=test-accounts \
  IDENTITY_AUTHORIZATION_PASSWORD=test-authorization \
  IDENTITY_MIGRATOR_PASSWORD=test \
  IDENTITY_BACKUP_PASSWORD=test-backup \
  IDENTITY_BETTER_AUTH_SECRET=01234567890123456789012345678901 \
  IDENTITY_PROVISIONING_SECRETS=01234567890123456789012345678901,abcdefghijklmnopqrstuvwxyz012345 \
  IDENTITY_MAIL_ORIGINS=https://portal.next.aven.ceo,https://portal.aven.ceo \
  TRUSTED_WEB_ORIGINS=https://next.aven.ceo,https://portal.next.aven.ceo,https://aven.ceo,https://portal.aven.ceo \
  NEXT_PLATFORM_PUBLIC_IPV4=192.0.2.10 \
  NEXT_PLATFORM_PUBLIC_IPV6=2001:db8::10 \
  PRODUCTION_PLATFORM_PUBLIC_IPV4=192.0.2.20 \
  PRODUCTION_PLATFORM_PUBLIC_IPV6=2001:db8::20 \
  ACME_EMAIL=test@example.test \
  BACKUP_RESTIC_REPOSITORY=/tmp/restic/identity \
  BACKUP_RESTIC_PASSWORD=test-backup-password \
  BACKUP_S3_ACCESS_KEY_ID=test \
  BACKUP_S3_SECRET_ACCESS_KEY=test \
  BACKUP_S3_REGION=hel1 \
  BACKUP_ENVIRONMENT=test \
  docker compose --file "$root/deploy/identity/docker-compose.yml" config --quiet

env \
  API_IMAGE=api:test \
  CHECKOUT_IMAGE=checkout:test \
  STATIC_SITE_HOST_IMAGE=host:test \
  PLATFORM_PROVISIONER_IMAGE=provisioner:test \
  INTENT_SERVICE_IMAGE=intent:test \
  ACTOR_RUNNER_IMAGE=actor:test \
  ARTIFACT_STORE_IMAGE=artifact:test \
  OPERATIONS_IMAGE=operations:test \
  DATABASE_IMAGE=database:test \
  PROXY_IMAGE=proxy:test \
  PLATFORM_POSTGRES_PASSWORD=test \
  PLATFORM_BACKUP_PASSWORD=test-backup \
  CHECKOUT_RUNTIME_PASSWORD=test \
  CHECKOUT_WEBHOOK_PASSWORD=test-webhook \
  CHECKOUT_MIGRATOR_PASSWORD=test \
  CHECKOUT_EMAIL_PASSWORD=test \
  CHECKOUT_PLATFORM_EVENTS_PASSWORD=test \
  API_HOSTING_PASSWORD=test \
  API_AUTHORIZATION_PASSWORD=test \
  API_ENTITLEMENTS_PASSWORD=test \
  API_RECONCILER_PASSWORD=test \
  API_MIGRATOR_PASSWORD=test \
  CUSTOMER_PROVISIONER_PASSWORD=test \
  ARTIFACT_STORE_PROVISIONER_DB_PASSWORD=test \
  INTENT_DATABASE_CREDENTIAL_ROOT=01234567890123456789012345678901234567890123 \
  ARTIFACT_API_DATABASE_CREDENTIAL_ROOT=BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ \
  ACTOR_API_DATABASE_CREDENTIAL_ROOT=01234567890123456789012345678901234567890123 \
  ACTOR_WORKER_DATABASE_CREDENTIAL_ROOT=01234567890123456789012345678901234567890123 \
  CUSTOMER_ENTITLEMENT_TOKEN=01234567890123456789012345678901 \
  INTENT_SERVICE_TOKEN=01234567890123456789012345678901 \
  ACTOR_RUNNER_SERVICE_TOKEN=01234567890123456789012345678901 \
  ARTIFACT_STORE_SERVICE_TOKEN=01234567890123456789012345678901 \
  ACTOR_RUNNER_ARTIFACT_STORE_TOKEN=01234567890123456789012345678901 \
  ACTOR_RUNNER_LLM_GATEWAY_TOKEN=01234567890123456789012345678901 \
  ARTIFACT_STORE_PROVISIONER_TOKEN=01234567890123456789012345678901 \
  TENANT_GRANT_PRIVATE_KEY=test-private-key \
  TENANT_GRANT_PUBLIC_KEY=test-public-key \
  IDENTITY_PROVISIONING_SECRET=01234567890123456789012345678901 \
  CHECKOUT_FACADE_TOKEN=01234567890123456789012345678901 \
  DOWNLOAD_URL=https://example.test \
  CHECKOUT_EMAIL_ENCRYPTION_KEY=BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc= \
  POLAR_WEBHOOK_SECRET=0123456789 \
  SITE_HOST_DIRECTORY_BEARER_TOKEN=01234567890123456789012345678901 \
  PLATFORM_PUBLIC_IPV4=192.0.2.10 \
  API_DOMAIN=api.next.aven.ceo \
  API_PUBLIC_BASE_URL=https://api.next.aven.ceo \
  CHECKOUT_DOMAIN=portal.next.aven.ceo \
  PLATFORM_WEB_ORIGINS=https://next.aven.ceo,https://portal.next.aven.ceo \
  DOWNSTREAMS_JSON='[]' \
  CUSTOMER_DOWNSTREAMS_JSON='[]' \
  LLM_GATEWAY_MODELS_JSON='[]' \
  LLM_GATEWAY_CREDENTIALS_JSON='{}' \
  SMTP_URL=smtp://example.test:25 \
  SMTP_FROM=test@example.test \
  ACME_EMAIL=test@example.test \
  BACKUP_RESTIC_REPOSITORY=/tmp/restic/platform \
  BACKUP_RESTIC_PASSWORD=test-backup-password \
  BACKUP_S3_ACCESS_KEY_ID=test \
  BACKUP_S3_SECRET_ACCESS_KEY=test \
  BACKUP_S3_REGION=hel1 \
  BACKUP_ENVIRONMENT=test \
  docker compose --file "$root/deploy/platform/docker-compose.yml" config --quiet

docker run --rm \
  --env IDENTITY_DOMAIN=aven.id \
  --env NEXT_PLATFORM_PUBLIC_IPV4=192.0.2.10 \
  --env NEXT_PLATFORM_PUBLIC_IPV6=2001:db8::10 \
  --env PRODUCTION_PLATFORM_PUBLIC_IPV4=192.0.2.20 \
  --env PRODUCTION_PLATFORM_PUBLIC_IPV6=2001:db8::20 \
  --env ACME_EMAIL=test@example.test \
  --volume "$root/deploy/identity/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648 caddy validate --config /etc/caddy/Caddyfile

docker run --rm \
  --env API_DOMAIN=api.next.aven.ceo \
  --env CHECKOUT_DOMAIN=portal.next.aven.ceo \
  --env ACME_EMAIL=test@example.test \
  --volume "$root/deploy/platform/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648 caddy validate --config /etc/caddy/Caddyfile

docker run --rm \
  --env API_DOMAIN=api.aven.ceo \
  --env CHECKOUT_DOMAIN=portal.aven.ceo \
  --env ACME_EMAIL=test@example.test \
  --volume "$root/deploy/platform/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648 caddy validate --config /etc/caddy/Caddyfile
