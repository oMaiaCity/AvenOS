#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
run_id="aven-recovery-$PPID-$$"
network="$run_id"
source_db="$run_id-source"
target_db="$run_id-target"
image="$run_id:local"
database_image="$run_id-database:local"
scratch=$(mktemp -d)
cleanup() {
  docker rm --force "$source_db" "$target_db" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  rm -rf "$scratch"
}
trap cleanup EXIT

mkdir -p "$scratch/repository" "$scratch/source-state" "$scratch/target-state"
chmod 0777 "$scratch/repository" "$scratch/source-state" "$scratch/target-state"
docker build --file "$root/deploy/operations/Dockerfile" --tag "$image" "$root"
docker build --file "$root/deploy/database/Dockerfile" --tag "$database_image" "$root"
bash "$root/scripts/scan-container-os.sh" "$image"
[[ "$(docker image inspect --format '{{.Config.User}}' "$image")" == '65532:65532' ]]
docker network create "$network" >/dev/null

start_database() {
  local name=$1
  docker run --detach --name "$name" --network "$network" \
    --env POSTGRES_PASSWORD=recovery-test "$database_image" >/dev/null
  for _ in {1..60}; do
    # The official image first starts an initialization server on its Unix socket,
    # stops it, and only then starts the durable server on TCP. A socket-only probe
    # can succeed during that transition and race the first createdb command.
    if docker exec "$name" pg_isready --host 127.0.0.1 --username postgres \
      --dbname postgres >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done
  echo "database did not become ready: $name" >&2
  return 1
}

start_database "$source_db"
docker exec "$source_db" createdb --username postgres aven_identity
docker exec "$source_db" createdb --username postgres customer_00000000_0000_4000_8000_000000000001
docker exec "$source_db" psql --username postgres --command \
  "CREATE ROLE aven_backup LOGIN INHERIT PASSWORD 'backup-test'; CREATE ROLE app_reader LOGIN PASSWORD 'source-password'; CREATE ROLE customer_owner NOLOGIN; ALTER DATABASE customer_00000000_0000_4000_8000_000000000001 OWNER TO customer_owner; GRANT pg_read_all_data TO aven_backup; GRANT CONNECT ON DATABASE aven_identity TO aven_backup,app_reader; GRANT CONNECT ON DATABASE customer_00000000_0000_4000_8000_000000000001 TO aven_backup;" >/dev/null
docker exec "$source_db" psql --username postgres --dbname aven_identity --command \
  "CREATE TABLE credentials(id uuid PRIMARY KEY, label text NOT NULL); INSERT INTO credentials VALUES ('00000000-0000-4000-8000-000000000001','first passkey'); GRANT SELECT ON credentials TO app_reader;" >/dev/null
docker exec "$source_db" psql --username postgres \
  --dbname customer_00000000_0000_4000_8000_000000000001 --command \
  "CREATE SCHEMA intent; CREATE TABLE intent.entries(id uuid PRIMARY KEY, body jsonb NOT NULL); INSERT INTO intent.entries VALUES ('00000000-0000-4000-8000-000000000002','{\"kind\":\"chat\"}');" >/dev/null
docker exec "$source_db" psql --username postgres \
  --dbname customer_00000000_0000_4000_8000_000000000001 --command \
  'ALTER SCHEMA intent OWNER TO customer_owner; ALTER TABLE intent.entries OWNER TO customer_owner;' >/dev/null
backup_inherits=$(docker exec "$source_db" psql --username postgres --tuples-only --no-align \
  --command "SELECT rolinherit FROM pg_roles WHERE rolname='aven_backup'")
[[ "$backup_inherits" == 't' ]]
if docker exec --env PGPASSWORD=backup-test "$source_db" psql --host 127.0.0.1 \
  --username aven_backup --dbname aven_identity --command \
  "INSERT INTO credentials VALUES ('00000000-0000-4000-8000-000000000099','forbidden')"; then
  echo 'backup role unexpectedly wrote application data' >&2
  exit 1
fi

common=(
  --rm --network "$network" --user "$(id -u):$(id -g)"
  --env RESTIC_REPOSITORY=/repository --env RESTIC_PASSWORD=recovery-encryption-test
  --env XDG_CACHE_HOME=/tmp/restic-cache
  --volume "$scratch/repository:/repository"
)
fixture_release=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
RECOVERY_FIXTURE_ROOT="$scratch" python3 - <<'PY'
import json, os
from pathlib import Path
root = Path(os.environ['RECOVERY_FIXTURE_ROOT']) / 'release-bundle'
root.mkdir(mode=0o700)
image = 'postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73'
(root / 'release.json').write_text(json.dumps({'version': 1, 'sha': 'a'*40, 'images': {'DATABASE_IMAGE': image}}))
(root / '.env').write_text(f'DATABASE_IMAGE={image}\nRECOVERY_VALUE=retained-fixture\n')
(root / '.env').chmod(0o600)
(root / 'docker-compose.yml').write_text('services:\n  database:\n    network_mode: none\n    image: ${DATABASE_IMAGE}\n    environment:\n      RECOVERY_VALUE: ${RECOVERY_VALUE}\n')
for name in ('Caddyfile', 'db-init.sh'): (root / name).write_text('fixture')
PY
python3 "$root/deploy/release/archive.py" create "$scratch/release-bundle" "$scratch/release-archive" --target ci
docker run "${common[@]}" --env PGHOST="$source_db" --env PGUSER=aven_backup --env PGPASSWORD=backup-test \
  --env BACKUP_ENVIRONMENT=ci --env BACKUP_HOST=restore-drill-source \
  --env BACKUP_RELEASE_ID="$fixture_release" --env BACKUP_RELEASE_ARCHIVE_ROOT=/var/lib/aven-release-archive \
  --volume "$scratch/release-archive:/var/lib/aven-release-archive:ro" \
  --volume "$scratch/source-state:/var/lib/aven-backups" "$image" backup
# Recovery must work after the original installation and its local archive disappear.
rm -rf "$scratch/release-bundle" "$scratch/release-archive"
docker run "${common[@]}" --env PGHOST="$source_db" --env PGUSER=aven_backup --env PGPASSWORD=backup-test \
  --volume "$scratch/source-state:/var/lib/aven-backups" "$image" health
HEALTH_RECORD="$scratch/source-state/public-status/health.json" bun -e '
const value=await Bun.file(process.env.HEALTH_RECORD).json();
if(value.status!=="healthy"||value.snapshotCount<1||Date.now()/1000-value.checkedAt>60)throw new Error("Backup capability proof is missing");
if(Object.keys(value).sort().join(",")!=="checkedAt,snapshotCount,status")throw new Error("Public backup health exposes extra fields");'

started=$SECONDS
if timeout 15 docker run "${common[@]}" \
  --env RESTIC_REPOSITORY=s3:https://unreachable.invalid/aven-test \
  --env BACKUP_REPOSITORY_PROBE_TIMEOUT_SECONDS=2 \
  --env BACKUP_RESTIC_COMMAND_TIMEOUT_SECONDS=2 \
  --env AWS_ACCESS_KEY_ID=test --env AWS_SECRET_ACCESS_KEY=test --env AWS_REGION=hel1 \
  --env PGHOST="$source_db" --env PGUSER=aven_backup --env PGPASSWORD=backup-test \
  --env BACKUP_ENVIRONMENT=ci --env BACKUP_HOST=bounded-provider-failure \
  --volume "$scratch/source-state:/var/lib/aven-backups" "$image" backup; then
  echo 'backup unexpectedly accepted an unreachable repository' >&2
  exit 1
fi
((SECONDS - started < 15)) || { echo 'backup provider failure was not bounded' >&2; exit 1; }
HEALTH_RECORD="$scratch/source-state/public-status/health.json" bun -e '
if((await Bun.file(process.env.HEALTH_RECORD).json()).status!=="degraded")throw new Error("Backup failure was hidden by the last success");'
if docker run "${common[@]}" --volume "$scratch/source-state:/var/lib/aven-backups" "$image" health; then
  echo 'backup health hid the failed latest attempt behind an older success' >&2
  exit 1
fi

start_database "$target_db"
if docker run "${common[@]}" --env PGHOST="$target_db" --env PGUSER=postgres --env PGPASSWORD=recovery-test \
  --env BACKUP_ENVIRONMENT=production --env RESTORE_CONFIRMATION=fresh-target-only \
  --volume "$scratch/target-state:/var/lib/aven-backups" "$image" restore; then
  echo 'restore unexpectedly accepted another environment snapshot' >&2
  exit 1
fi
docker run "${common[@]}" --env PGHOST="$target_db" --env PGUSER=postgres --env PGPASSWORD=recovery-test \
  --env BACKUP_ENVIRONMENT=ci --env RESTORE_CONFIRMATION=fresh-target-only \
  --env RESTORE_RELEASE_DESTINATION=/var/lib/aven-backups/recovered-release \
  --volume "$scratch/target-state:/var/lib/aven-backups" "$image" restore
python3 "$root/deploy/release/archive.py" restore "$scratch/target-state/recovered-release" "$scratch/fresh-release" --target ci
docker compose --project-directory "$scratch/fresh-release" --file "$scratch/fresh-release/restored-compose.json" \
  run --rm --no-deps --pull never database sh -c 'test "$RECOVERY_VALUE" = retained-fixture'

identity_label=$(docker exec "$target_db" psql --username postgres --dbname aven_identity \
  --tuples-only --no-align --command 'SELECT label FROM credentials')
intent_kind=$(docker exec "$target_db" psql --username postgres \
  --dbname customer_00000000_0000_4000_8000_000000000001 \
  --tuples-only --no-align --command "SELECT body->>'kind' FROM intent.entries")
restored_owner=$(docker exec "$target_db" psql --username postgres \
  --dbname customer_00000000_0000_4000_8000_000000000001 \
  --tuples-only --no-align --command "SELECT tableowner FROM pg_tables WHERE schemaname='intent' AND tablename='entries'")
restored_reader=$(docker exec "$target_db" psql --username postgres --dbname aven_identity \
  --tuples-only --no-align --command \
  "SELECT (NOT rolcanlogin) AND has_table_privilege('app_reader','credentials','SELECT') FROM pg_roles WHERE rolname='app_reader'")
[[ "$identity_label" == 'first passkey' ]]
[[ "$intent_kind" == 'chat' ]]
[[ "$restored_owner" == 'customer_owner' ]]
[[ "$restored_reader" == 't' ]]

if docker run "${common[@]}" --env PGHOST="$target_db" --env PGUSER=postgres --env PGPASSWORD=recovery-test \
  --env BACKUP_ENVIRONMENT=ci --env RESTORE_CONFIRMATION=fresh-target-only \
  --volume "$scratch/target-state:/var/lib/aven-backups" "$image" restore; then
  echo 'restore unexpectedly overwrote a populated target' >&2
  exit 1
fi
if docker run "${common[@]}" --env PGHOST="$target_db" --env PGUSER=postgres --env PGPASSWORD=recovery-test \
  --env RESTIC_PASSWORD=wrong-password \
  --env BACKUP_ENVIRONMENT=ci --env RESTORE_CONFIRMATION=fresh-target-only \
  --volume "$scratch/target-state:/var/lib/aven-backups" "$image" restore; then
  echo 'restore unexpectedly accepted the wrong encryption key' >&2
  exit 1
fi

OPERATIONS_IMAGE="$image" DATABASE_IMAGE="$database_image" RESTIC_REPOSITORY=/repository RESTIC_PASSWORD=recovery-encryption-test \
  BACKUP_ENVIRONMENT=ci DRILL_LOCAL_REPOSITORY_DIR="$scratch/repository" DRILL_OUTPUT="$scratch/drill.json" \
  bash "$root/deploy/operations/drill-latest.sh"
jq -e '.status == "healthy" and .databaseCount == 2 and (.snapshotId|length) == 64' "$scratch/drill.json" >/dev/null
echo 'destructive backup/restore drill passed'
