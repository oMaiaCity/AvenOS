#!/usr/bin/env bash
set -euo pipefail

common_required=(
  DEPLOYMENT_TARGET PULUMI_STACK PULUMI_BACKEND GHCR_USER GHCR_TOKEN
  OPERATIONS_IMAGE BACKUP_REPOSITORY_BASE BACKUP_S3_ACCESS_KEY_ID
  DATABASE_IMAGE PROXY_IMAGE
  BACKUP_S3_SECRET_ACCESS_KEY BACKUP_S3_REGION BACKUP_RESTIC_PASSWORD
)
for name in "${common_required[@]}"; do
  [[ -n "${!name:-}" ]] || { echo "$name is required" >&2; exit 64; }
done
case "$DEPLOYMENT_TARGET" in identity|next|production) ;; *) echo 'DEPLOYMENT_TARGET must be identity, next, or production' >&2; exit 64 ;; esac
case "${RECOVER_FROM_BACKUP:-false}" in true|false) ;; *) echo 'RECOVER_FROM_BACKUP must be true or false' >&2; exit 64 ;; esac

if [[ "$DEPLOYMENT_TARGET" == identity ]]; then
  target_required=(
    IDENTITY_IMAGE
    NEXT_PULUMI_STACK NEXT_PULUMI_BACKEND NEXT_STATE_S3_ACCESS_KEY_ID
    NEXT_STATE_S3_SECRET_ACCESS_KEY NEXT_PULUMI_CONFIG_PASSPHRASE
    PRODUCTION_PULUMI_STACK PRODUCTION_PULUMI_BACKEND
    PRODUCTION_STATE_S3_ACCESS_KEY_ID PRODUCTION_STATE_S3_SECRET_ACCESS_KEY
    PRODUCTION_PULUMI_CONFIG_PASSPHRASE
  )
else
  target_required=(
    API_IMAGE CHECKOUT_IMAGE STATIC_SITE_HOST_IMAGE
    PLATFORM_PROVISIONER_IMAGE INTENT_SERVICE_IMAGE ACTOR_RUNNER_IMAGE
    ARTIFACT_STORE_IMAGE POLAR_API_KEY POLAR_WEBHOOK_SECRET
    SMTP_URL SMTP_FROM DOWNLOAD_URL LLM_GATEWAY_MODELS_JSON
    LLM_GATEWAY_CREDENTIALS_JSON
  )
fi
for name in "${target_required[@]}"; do
  [[ -n "${!name:-}" ]] || { echo "$name is required for $DEPLOYMENT_TARGET" >&2; exit 64; }
done
if [[ "$DEPLOYMENT_TARGET" == identity ]]; then
  [[ "$NEXT_PULUMI_STACK" == organization/aven-platform/next ]] || {
    echo 'NEXT_PULUMI_STACK must be organization/aven-platform/next' >&2
    exit 64
  }
  [[ "$PRODUCTION_PULUMI_STACK" == organization/aven-platform/production ]] || {
    echo 'PRODUCTION_PULUMI_STACK must be organization/aven-platform/production' >&2
    exit 64
  }
fi

root=$(cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
source "$root/deploy/release/environment.sh"
source "$root/deploy/release/ssh-staging.sh"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT

pulumi login "$PULUMI_BACKEND"
pulumi stack select "$PULUMI_STACK" --cwd "$root/infrastructure/platform"
[[ "$PULUMI_STACK" == "organization/aven-platform/$DEPLOYMENT_TARGET" ]] || {
  echo "PULUMI_STACK does not match deployment target $DEPLOYMENT_TARGET" >&2
  exit 64
}
stack_output() {
  local stack=$1 name=$2
  pulumi stack output "$name" --show-secrets --stack "$stack" --cwd "$root/infrastructure/platform"
}
output() { stack_output "$PULUMI_STACK" "$1"; }
external_output() {
  local backend=$1 access_key=$2 secret_key=$3 passphrase=$4 stack=$5 name=$6
  (
    export AWS_ACCESS_KEY_ID="$access_key"
    export AWS_SECRET_ACCESS_KEY="$secret_key"
    export PULUMI_CONFIG_PASSPHRASE="$passphrase"
    pulumi login "$backend" >/dev/null
    pulumi stack output "$name" --show-secrets --stack "$stack" --cwd "$root/infrastructure/platform"
  )
}
load_secret() {
  local variable=$1 stack=$2 output_name=$3 value
  value=$(stack_output "$stack" "$output_name")
  printf -v "$variable" '%s' "$value"
}

deploy_user=$(output deployUser)
[[ "$(output deploymentEnvironment)" == "$DEPLOYMENT_TARGET" ]] || {
  echo 'Pulumi deploymentEnvironment output does not match the requested target' >&2
  exit 1
}
expected_infrastructure_target=platform
[[ "$DEPLOYMENT_TARGET" == identity ]] && expected_infrastructure_target=identity
[[ "$(output deploymentTarget)" == "$expected_infrastructure_target" ]] || {
  echo 'Pulumi deploymentTarget output does not match the requested target' >&2
  exit 1
}
prepare_ssh_staging "$stage/ssh"

dotenv() {
  local name=$1 value=$2
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}
  printf '%s="%s"\n' "$name" "$value"
}

wait_for_cloud_init() {
  local key=$1 remote=$2 expected_host_key=$3 host scanned_host_key
  host=${remote#*@}
  for _ in {1..180}; do
    scanned_host_key=$(ssh-keyscan -T 5 -t ed25519 "$host" 2>/dev/null | awk 'NR == 1 { print $2 " " $3 }') || true
    if [[ "$scanned_host_key" != "$expected_host_key" ]]; then
      sleep 5
      continue
    fi
    if ssh -i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10 -o UserKnownHostsFile="$stage/ssh/known_hosts" -o StrictHostKeyChecking=yes "$remote" 'test -f /var/lib/aven/cloud-init-complete'; then return 0; fi
    sleep 5
  done
  echo "cloud-init did not install the Pulumi-pinned SSH host key and finish on $remote within 15 minutes" >&2
  return 1
}

deploy_bundle() {
  local host=$1 service=$2
  local remote="$deploy_user@$host"
  local upload="/tmp/aven-${service}-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
  local ssh_args=(-i "$stage/ssh/key" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10 -o UserKnownHostsFile="$stage/ssh/known_hosts" -o StrictHostKeyChecking=yes)
  wait_for_cloud_init "$stage/ssh/key" "$remote" "$(awk '{ print $1 " " $2 }' <<<"$3")"
  ssh "${ssh_args[@]}" "$remote" "install -d -m 0700 '$upload'"
  scp "${ssh_args[@]}" -r "$stage/$service/." "$remote:$upload/"
  cleanup_remote() {
    ssh "${ssh_args[@]}" "$remote" "docker logout ghcr.io >/dev/null 2>&1 || true; rm -rf '$upload'" || true
  }
  if ! printf '%s' "$GHCR_TOKEN" |
    ssh "${ssh_args[@]}" "$remote" "docker login ghcr.io --username '$GHCR_USER' --password-stdin"; then
    cleanup_remote
    return 1
  fi
  local remote_action=aven-deploy
  [[ "${RECOVER_FROM_BACKUP:-false}" == true ]] && remote_action=aven-restore
  if ! ssh "${ssh_args[@]}" "$remote" "install -m 0600 '$upload/.env' /opt/aven/$service/.env && install -m 0644 '$upload/docker-compose.yml' /opt/aven/$service/docker-compose.yml && install -m 0644 '$upload/Caddyfile' /opt/aven/$service/Caddyfile && install -m 0755 '$upload/db-init.sh' /opt/aven/$service/db-init.sh && sudo /usr/local/sbin/$remote_action '$service'"; then
    cleanup_remote
    return 1
  fi
  cleanup_remote
}

wait_for_url() {
  local url=$1
  for _ in {1..60}; do curl --connect-timeout 5 --max-time 10 --fail --silent "$url" >/dev/null && break; sleep 5; done
  curl --connect-timeout 5 --max-time 10 --fail --show-error --silent "$url" >/dev/null
}

wait_for_capabilities() {
  local url=$1
  if ! wait_for_url "$url"; then
    echo "Deployment is ready but degraded. Capability observations from $url:" >&2
    # This endpoint has a fixed, secret-free response contract. Do not print general provider errors.
    curl --connect-timeout 5 --max-time 10 --max-filesize 8192 --silent "$url" || true
    return 1
  fi
}

if [[ "$DEPLOYMENT_TARGET" == identity ]]; then
  identity_ip=$(output identityIpv4Address)
  identity_host_key=$(output identityHostPublicKey)
  load_secret identityDeployPrivateKey "$PULUMI_STACK" identityDeployPrivateKey
  load_secret identityPostgresPassword "$PULUMI_STACK" identityPostgresPassword
  load_secret identityAuthPassword "$PULUMI_STACK" identityAuthPassword
  load_secret identityAccountsPassword "$PULUMI_STACK" identityAccountsPassword
  load_secret identityAuthorizationPassword "$PULUMI_STACK" identityAuthorizationPassword
  load_secret identityMigratorPassword "$PULUMI_STACK" identityMigratorPassword
  load_secret identityBackupPassword "$PULUMI_STACK" identityBackupPassword
  load_secret identityBetterAuthSecret "$PULUMI_STACK" identityBetterAuthSecret
  nextProvisioningSecret=$(external_output "$NEXT_PULUMI_BACKEND" "$NEXT_STATE_S3_ACCESS_KEY_ID" "$NEXT_STATE_S3_SECRET_ACCESS_KEY" "$NEXT_PULUMI_CONFIG_PASSPHRASE" "$NEXT_PULUMI_STACK" platformIdentityProvisioningSecret)
  productionProvisioningSecret=$(external_output "$PRODUCTION_PULUMI_BACKEND" "$PRODUCTION_STATE_S3_ACCESS_KEY_ID" "$PRODUCTION_STATE_S3_SECRET_ACCESS_KEY" "$PRODUCTION_PULUMI_CONFIG_PASSPHRASE" "$PRODUCTION_PULUMI_STACK" platformIdentityProvisioningSecret)
  next_ipv4=$(dig +short A api.next.aven.ceo | tail -1)
  next_ipv6=$(dig +short AAAA api.next.aven.ceo | tail -1)
  production_ipv4=$(dig +short A api.aven.ceo | tail -1)
  production_ipv6=$(dig +short AAAA api.aven.ceo | tail -1)
  [[ -n "$next_ipv4" && -n "$next_ipv6" && -n "$production_ipv4" && -n "$production_ipv6" ]] || {
    echo 'both platform A and AAAA records must resolve before identity deployment' >&2
    exit 1
  }

  printf '%s\n' "$identityDeployPrivateKey" > "$stage/ssh/key"
  printf '%s %s\n' "$identity_ip" "$identity_host_key" > "$stage/ssh/known_hosts"
  install -m 700 -d "$stage/identity"
  install -m 600 /dev/null "$stage/identity/.env"
  {
    dotenv IDENTITY_IMAGE "$IDENTITY_IMAGE"
    dotenv DATABASE_IMAGE "$DATABASE_IMAGE"
    dotenv PROXY_IMAGE "$PROXY_IMAGE"
    dotenv OPERATIONS_IMAGE "$OPERATIONS_IMAGE"
    dotenv IDENTITY_DOMAIN aven.id
    dotenv TRUSTED_WEB_ORIGINS 'https://next.aven.ceo,https://portal.next.aven.ceo,https://aven.ceo,https://portal.aven.ceo'
    dotenv IDENTITY_POSTGRES_PASSWORD "$identityPostgresPassword"
    dotenv IDENTITY_AUTH_PASSWORD "$identityAuthPassword"
    dotenv IDENTITY_ACCOUNTS_PASSWORD "$identityAccountsPassword"
    dotenv IDENTITY_AUTHORIZATION_PASSWORD "$identityAuthorizationPassword"
    dotenv IDENTITY_MIGRATOR_PASSWORD "$identityMigratorPassword"
    dotenv IDENTITY_BACKUP_PASSWORD "$identityBackupPassword"
    dotenv IDENTITY_BETTER_AUTH_SECRET "$identityBetterAuthSecret"
    dotenv IDENTITY_PROVISIONING_SECRETS "$nextProvisioningSecret,$productionProvisioningSecret"
    dotenv IDENTITY_MAIL_ORIGINS 'https://portal.next.aven.ceo,https://portal.aven.ceo'
    dotenv ANDROID_APP_CERT_SHA256_FINGERPRINTS "${ANDROID_APP_CERT_SHA256_FINGERPRINTS:-}"
    dotenv NEXT_PLATFORM_PUBLIC_IPV4 "$next_ipv4"
    dotenv NEXT_PLATFORM_PUBLIC_IPV6 "$next_ipv6"
    dotenv PRODUCTION_PLATFORM_PUBLIC_IPV4 "$production_ipv4"
    dotenv PRODUCTION_PLATFORM_PUBLIC_IPV6 "$production_ipv6"
    dotenv ACME_EMAIL "${ACME_EMAIL:-ops@aven.ceo}"
    dotenv BACKUP_RESTIC_REPOSITORY "${BACKUP_REPOSITORY_BASE%/}/identity"
    dotenv BACKUP_RESTIC_PASSWORD "$BACKUP_RESTIC_PASSWORD"
    dotenv BACKUP_S3_ACCESS_KEY_ID "$BACKUP_S3_ACCESS_KEY_ID"
    dotenv BACKUP_S3_SECRET_ACCESS_KEY "$BACKUP_S3_SECRET_ACCESS_KEY"
    dotenv BACKUP_S3_REGION "$BACKUP_S3_REGION"
    dotenv BACKUP_ENVIRONMENT identity
    dotenv RELEASE_ID "${DEPLOYED_REF_SHA:-${GITHUB_SHA:-local}}"
  } > "$stage/identity/.env"
  install -m 644 "$root/deploy/identity/docker-compose.yml" "$stage/identity/docker-compose.yml"
  install -m 644 "$root/deploy/identity/Caddyfile" "$stage/identity/Caddyfile"
  install -m 755 "$root/deploy/identity/db-init.sh" "$stage/identity/db-init.sh"
  deploy_bundle "$identity_ip" identity "$identity_host_key"
  wait_for_url https://aven.id/api/health/ready
  wait_for_capabilities https://aven.id/api/health/capabilities
  echo 'Shared identity deployment is healthy.'
  exit 0
fi

platform_ip=$(output platformIpv4Address)
platform_ipv6=$(output platformIpv6Address)
platform_host_key=$(output platformHostPublicKey)
load_secret platformDeployPrivateKey "$PULUMI_STACK" platformDeployPrivateKey
for secret_name in \
  platformPostgresPassword platformBackupPassword checkoutRuntimePassword \
  checkoutWebhookPassword checkoutMigratorPassword checkoutEmailPassword \
  checkoutPlatformEventsPassword apiHostingPassword apiAuthorizationPassword \
  apiEntitlementsPassword apiReconcilerPassword apiMigratorPassword \
  customerProvisionerPassword artifactStoreProvisionerDbPassword \
  intentDatabaseCredentialRoot artifactApiDatabaseCredentialRoot \
  actorApiDatabaseCredentialRoot actorWorkerDatabaseCredentialRoot \
  customerEntitlementToken intentServiceToken actorRunnerServiceToken \
  artifactStoreServiceToken actorRunnerArtifactStoreToken \
  actorRunnerLlmGatewayToken \
  artifactStoreProvisionerToken tenantGrantPrivateKey siteHostDirectoryToken \
  checkoutFacadeToken checkoutEmailEncryptionKey; do
  load_secret "$secret_name" "$PULUMI_STACK" "$secret_name"
done
tenantGrantPublicKey=$(output tenantGrantPublicKey)
configure_platform_environment "$DEPLOYMENT_TARGET"
load_secret identityProvisioningSecret "$PULUMI_STACK" platformIdentityProvisioningSecret

printf '%s\n' "$platformDeployPrivateKey" > "$stage/ssh/key"
printf '%s %s\n' "$platform_ip" "$platform_host_key" > "$stage/ssh/known_hosts"
install -m 700 -d "$stage/platform"
install -m 600 /dev/null "$stage/platform/.env"

downstreams=$(printf '[{"prefix":"/api/billing","baseUrl":"http://checkout:3000","targetPrefix":"/api/billing","bearerToken":"%s","roles":["user","admin"]},{"prefix":"/api/names","baseUrl":"http://checkout:3000","targetPrefix":"/api/names","bearerToken":"%s","roles":["user","admin"]}]' "$checkoutFacadeToken" "$checkoutFacadeToken")
customer_downstreams=$(printf '[{"segment":"artifacts","baseUrl":"http://artifact-store:8087","targetPrefix":"/v1","bearerToken":"%s","componentRef":"ceo.aven:component:data:artifacts@1","readAction":"artifacts:read","writeAction":"artifacts:write","roles":["user","admin"]},{"segment":"intents","baseUrl":"http://intent-service:3010","targetPrefix":"/api/intents","bearerToken":"%s","componentRef":"ceo.aven:component:data:intents@1","readAction":"intents:read","writeAction":"intents:write","deleteAction":"intents:delete","mergeAction":"intents:merge","roles":["user","admin"]},{"segment":"actor-runs","baseUrl":"http://actor-runner:3010","targetPrefix":"/api/actor-runs","bearerToken":"%s","componentRef":"os.aven:component:actors:run-repository@1","readAction":"actor-runs:read","writeAction":"actor-runs:write","roles":["user","admin"]}]' "$artifactStoreServiceToken" "$intentServiceToken" "$actorRunnerServiceToken")
system_sites=$(printf '[{"hostname":"%s","repository":"myavenceo/aven-brands","sourceBranch":"%s","deploymentBranch":"%s"}]' "$public_domain" "$site_source_branch" "$site_deployment_branch")
{
  dotenv API_IMAGE "$API_IMAGE"
  dotenv CHECKOUT_IMAGE "$CHECKOUT_IMAGE"
  dotenv STATIC_SITE_HOST_IMAGE "$STATIC_SITE_HOST_IMAGE"
  dotenv PLATFORM_PROVISIONER_IMAGE "$PLATFORM_PROVISIONER_IMAGE"
  dotenv INTENT_SERVICE_IMAGE "$INTENT_SERVICE_IMAGE"
  dotenv ACTOR_RUNNER_IMAGE "$ACTOR_RUNNER_IMAGE"
  dotenv ARTIFACT_STORE_IMAGE "$ARTIFACT_STORE_IMAGE"
  dotenv OPERATIONS_IMAGE "$OPERATIONS_IMAGE"
  dotenv PLATFORM_POSTGRES_PASSWORD "$platformPostgresPassword"
  dotenv PLATFORM_BACKUP_PASSWORD "$platformBackupPassword"
  dotenv CHECKOUT_RUNTIME_PASSWORD "$checkoutRuntimePassword"
  dotenv CHECKOUT_WEBHOOK_PASSWORD "$checkoutWebhookPassword"
  dotenv CHECKOUT_MIGRATOR_PASSWORD "$checkoutMigratorPassword"
  dotenv CHECKOUT_EMAIL_PASSWORD "$checkoutEmailPassword"
  dotenv CHECKOUT_PLATFORM_EVENTS_PASSWORD "$checkoutPlatformEventsPassword"
  dotenv API_HOSTING_PASSWORD "$apiHostingPassword"
  dotenv API_AUTHORIZATION_PASSWORD "$apiAuthorizationPassword"
  dotenv API_ENTITLEMENTS_PASSWORD "$apiEntitlementsPassword"
  dotenv API_RECONCILER_PASSWORD "$apiReconcilerPassword"
  dotenv API_MIGRATOR_PASSWORD "$apiMigratorPassword"
  dotenv CUSTOMER_PROVISIONER_PASSWORD "$customerProvisionerPassword"
  dotenv ARTIFACT_STORE_PROVISIONER_DB_PASSWORD "$artifactStoreProvisionerDbPassword"
  dotenv INTENT_DATABASE_CREDENTIAL_ROOT "$intentDatabaseCredentialRoot"
  dotenv ARTIFACT_API_DATABASE_CREDENTIAL_ROOT "$artifactApiDatabaseCredentialRoot"
  dotenv ACTOR_API_DATABASE_CREDENTIAL_ROOT "$actorApiDatabaseCredentialRoot"
  dotenv ACTOR_WORKER_DATABASE_CREDENTIAL_ROOT "$actorWorkerDatabaseCredentialRoot"
  dotenv CUSTOMER_ENTITLEMENT_TOKEN "$customerEntitlementToken"
  dotenv INTENT_SERVICE_TOKEN "$intentServiceToken"
  dotenv ACTOR_RUNNER_SERVICE_TOKEN "$actorRunnerServiceToken"
  dotenv ARTIFACT_STORE_SERVICE_TOKEN "$artifactStoreServiceToken"
  dotenv ACTOR_RUNNER_ARTIFACT_STORE_TOKEN "$actorRunnerArtifactStoreToken"
  dotenv ACTOR_RUNNER_LLM_GATEWAY_TOKEN "$actorRunnerLlmGatewayToken"
  dotenv ARTIFACT_STORE_PROVISIONER_TOKEN "$artifactStoreProvisionerToken"
  dotenv TENANT_GRANT_PRIVATE_KEY "$tenantGrantPrivateKey"
  dotenv TENANT_GRANT_PUBLIC_KEY "$tenantGrantPublicKey"
  dotenv IDENTITY_PROVISIONING_SECRET "$identityProvisioningSecret"
  dotenv CHECKOUT_FACADE_TOKEN "$checkoutFacadeToken"
  dotenv CHECKOUT_EMAIL_ENCRYPTION_KEY "$checkoutEmailEncryptionKey"
  dotenv SITE_HOST_DIRECTORY_BEARER_TOKEN "$siteHostDirectoryToken"
  dotenv PLATFORM_PUBLIC_IPV4 "$platform_ip"
  dotenv PLATFORM_PUBLIC_IPV6 "$platform_ipv6"
  dotenv API_DOMAIN "$api_domain"
  dotenv API_PUBLIC_BASE_URL "https://$api_domain"
  dotenv CHECKOUT_DOMAIN "$checkout_domain"
  dotenv PLATFORM_WEB_ORIGINS "https://$public_domain,https://$checkout_domain"
  dotenv DOWNSTREAMS_JSON "$downstreams"
  dotenv CUSTOMER_DOWNSTREAMS_JSON "$customer_downstreams"
  dotenv SYSTEM_SITES_JSON "$system_sites"
  dotenv LLM_GATEWAY_MODELS_JSON "$LLM_GATEWAY_MODELS_JSON"
  dotenv LLM_GATEWAY_CREDENTIALS_JSON "$LLM_GATEWAY_CREDENTIALS_JSON"
  dotenv LLM_GATEWAY_TIMEOUT_SECONDS "${LLM_GATEWAY_TIMEOUT_SECONDS:-180}"
  dotenv DOWNLOAD_URL "$DOWNLOAD_URL"
  dotenv POLAR_API_KEY "$POLAR_API_KEY"
  dotenv POLAR_SERVER "${POLAR_SERVER:-production}"
  dotenv POLAR_ORGANIZATION_ID "${POLAR_ORGANIZATION_ID:-}"
  dotenv POLAR_WEBHOOK_SECRET "$POLAR_WEBHOOK_SECRET"
  dotenv SMTP_URL "$SMTP_URL"
  dotenv DATABASE_IMAGE "$DATABASE_IMAGE"
  dotenv PROXY_IMAGE "$PROXY_IMAGE"
  dotenv SMTP_FROM "$SMTP_FROM"
  dotenv SMTP_REPLY_TO "${SMTP_REPLY_TO:-}"
  dotenv ACME_EMAIL "${ACME_EMAIL:-ops@aven.ceo}"
  dotenv BACKUP_RESTIC_REPOSITORY "${BACKUP_REPOSITORY_BASE%/}/$DEPLOYMENT_TARGET/platform"
  dotenv BACKUP_RESTIC_PASSWORD "$BACKUP_RESTIC_PASSWORD"
  dotenv BACKUP_S3_ACCESS_KEY_ID "$BACKUP_S3_ACCESS_KEY_ID"
  dotenv BACKUP_S3_SECRET_ACCESS_KEY "$BACKUP_S3_SECRET_ACCESS_KEY"
  dotenv BACKUP_S3_REGION "$BACKUP_S3_REGION"
  dotenv BACKUP_ENVIRONMENT "$DEPLOYMENT_TARGET"
  dotenv RELEASE_ID "${DEPLOYED_REF_SHA:-${GITHUB_SHA:-local}}"
} > "$stage/platform/.env"

install -m 644 "$root/deploy/platform/docker-compose.yml" "$stage/platform/docker-compose.yml"
install -m 644 "$root/deploy/platform/Caddyfile" "$stage/platform/Caddyfile"
install -m 755 "$root/deploy/platform/db-init.sh" "$stage/platform/db-init.sh"
deploy_bundle "$platform_ip" platform "$platform_host_key"
wait_for_url "https://$api_domain/health/live"
wait_for_url "https://$checkout_domain/api/health/ready"
wait_for_url "https://$public_domain/"
bun "$root/scripts/reconcile-deployed-polar-webhook.ts"
wait_for_capabilities "https://$checkout_domain/api/health/capabilities"
wait_for_capabilities "https://$api_domain/api/health/capabilities"
echo "$DEPLOYMENT_TARGET platform deployment is healthy."
