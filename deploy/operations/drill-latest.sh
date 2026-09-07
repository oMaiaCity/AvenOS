#!/usr/bin/env bash
# Workstation/CI helper. Never connects PostgreSQL tools to the live database.
set -euo pipefail
umask 077
for name in OPERATIONS_IMAGE DATABASE_IMAGE RESTIC_REPOSITORY RESTIC_PASSWORD BACKUP_ENVIRONMENT DRILL_OUTPUT; do
  [[ -n "${!name:-}" ]] || { echo "$name is required" >&2; exit 64; }
done
case "$BACKUP_ENVIRONMENT" in identity|next|production|ci) ;; *) echo 'Invalid drill target.' >&2; exit 64;; esac
data_limit=${DRILL_DATA_LIMIT_MB:-2048}
archive_limit=${DRILL_ARCHIVE_LIMIT_MB:-512}
for limit in "$data_limit" "$archive_limit"; do
  [[ "$limit" =~ ^[0-9]{1,5}$ && "$limit" -ge 128 && "$limit" -le 16384 ]] || {
    echo 'Drill memory-backed storage limits must be between 128 and 16384 MiB.' >&2; exit 64
  }
done
scratch=$(mktemp -d)
id="aven-restore-drill-$$-$(openssl rand -hex 4)"
database="$id-database"
runner="$id-restore"
probe="$id-probe"
phase='prepare'
cleanup() {
  code=$?
  trap - EXIT
  docker rm --force --volumes "$runner" "$probe" "$database" >/dev/null 2>&1 || true
  docker network rm "$id" >/dev/null 2>&1 || true
  rm -rf "$scratch"
  if [[ "$code" -ne 0 ]]; then
    printf '{"status":"degraded","checkedAt":%s,"code":"RESTORE_DRILL_FAILED"}\n' "$(date -u +%s)" > "$DRILL_OUTPUT"
    echo "Restore drill failed during $phase; no live database was selected or modified." >&2
  fi
  exit "$code"
}
trap cleanup EXIT
printf '{"status":"degraded","checkedAt":%s,"code":"RESTORE_DRILL_IN_PROGRESS"}\n' "$(date -u +%s)" > "$DRILL_OUTPUT"
export PGPASSWORD="$(openssl rand -hex 24)" POSTGRES_PASSWORD
POSTGRES_PASSWORD=$PGPASSWORD
common=(--env RESTIC_REPOSITORY --env RESTIC_PASSWORD --env AWS_ACCESS_KEY_ID --env AWS_SECRET_ACCESS_KEY --env AWS_REGION --env AWS_DEFAULT_REGION --env AWS_EC2_METADATA_DISABLED=true --env XDG_CACHE_HOME=/tmp/restic-cache)
if [[ -n "${DRILL_LOCAL_REPOSITORY_DIR:-}" ]]; then
  [[ "$BACKUP_ENVIRONMENT" == ci && "$RESTIC_REPOSITORY" == /repository && "$DRILL_LOCAL_REPOSITORY_DIR" == /* && "$DRILL_LOCAL_REPOSITORY_DIR" != / && -d "$DRILL_LOCAL_REPOSITORY_DIR" ]] || exit 64
  # The fixture backup was made by this workstation UID. Keep its owner-only files
  # private rather than widening permissions for the runtime image's different UID.
  common+=(--user "$(id -u):$(id -g)" --volume "$DRILL_LOCAL_REPOSITORY_DIR:/repository:ro")
fi
phase='read latest environment snapshot'
echo "Restore drill: $phase."
timeout 120 docker run --rm --name "$probe" --read-only --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:size=128m,mode=1777 "${common[@]}" --entrypoint restic "$OPERATIONS_IMAGE" \
  --no-lock snapshots --tag "environment:$BACKUP_ENVIRONMENT" --json > "$scratch/snapshots.json" 2> "$scratch/probe.log"
snapshot=$(jq -er 'sort_by(.time) | last | .id | select(test("^[a-f0-9]{64}$"))' "$scratch/snapshots.json")
phase='start isolated blank database'
echo "Restore drill: $phase."
docker network create --internal "$id" >/dev/null
docker run --detach --rm --name "$database" --network "$id" --env POSTGRES_PASSWORD \
  --memory "$((data_limit + 512))m" --cpus 1 --pids-limit 128 --security-opt no-new-privileges \
  --tmpfs "/var/lib/postgresql/data:size=${data_limit}m,mode=0700" \
  "$DATABASE_IMAGE" >/dev/null
for attempt in {1..60}; do
  if docker exec "$database" pg_isready --host 127.0.0.1 --username postgres >/dev/null 2>&1; then break; fi
  [[ "$attempt" != 60 ]] || exit 1
  sleep 1
done
phase='restore and validate exact encrypted snapshot'
echo "Restore drill: $phase."
docker create --name "$runner" --network "$id" --read-only --cap-drop ALL --security-opt no-new-privileges \
  --memory "$((archive_limit + 512))m" --cpus 1 --pids-limit 128 --tmpfs /tmp:size=256m,mode=1777 \
  "${common[@]}" --env PGHOST="$database" --env PGUSER=postgres --env PGPASSWORD \
  --env BACKUP_ENVIRONMENT --env RESTORE_CONFIRMATION=fresh-target-only --env RESTORE_NO_LOCK=true \
  --env RESTORE_SNAPSHOT="$snapshot" --tmpfs "/var/lib/aven-backups:size=${archive_limit}m,mode=1777" \
  "$OPERATIONS_IMAGE" restore >/dev/null
# Only the restore client reaches S3. The restored database has no external network.
docker network connect bridge "$runner"
timeout 900 docker start --attach "$runner" > "$scratch/restore.log" 2>&1
[[ "$(docker inspect --format '{{.State.ExitCode}}' "$runner")" == 0 ]]
phase='check restored database inventory'
databases=$(docker exec "$database" psql --username postgres --dbname postgres --tuples-only --no-align --command "SELECT count(*) FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres'")
[[ "$databases" =~ ^[1-9][0-9]*$ ]]
printf '{"status":"healthy","checkedAt":%s,"snapshotId":"%s","databaseCount":%s}\n' "$(date -u +%s)" "$snapshot" "$databases" > "$DRILL_OUTPUT"
echo "Restore drill passed: $databases database(s); manifest, dump and role checksums verified; no live database connection."
