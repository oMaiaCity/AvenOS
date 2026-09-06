#!/bin/sh
set -eu
umask 077

required='PGHOST PGUSER PGPASSWORD RESTIC_REPOSITORY RESTIC_PASSWORD BACKUP_ENVIRONMENT BACKUP_HOST'
for name in $required; do
  eval "value=\${$name:-}"
  [ -n "$value" ] || { echo "$name is required" >&2; exit 64; }
done
case "$BACKUP_ENVIRONMENT" in *[!A-Za-z0-9_.-]*|'') echo 'invalid backup environment' >&2; exit 64 ;; esac
case "$BACKUP_HOST" in *[!A-Za-z0-9_.-]*|'') echo 'invalid backup host' >&2; exit 64 ;; esac
repository_probe_timeout=${BACKUP_REPOSITORY_PROBE_TIMEOUT_SECONDS:-30}
restic_timeout=${BACKUP_RESTIC_COMMAND_TIMEOUT_SECONDS:-900}
case "$repository_probe_timeout" in *[!0-9]*|'') echo 'invalid repository probe timeout' >&2; exit 64 ;; esac
case "$restic_timeout" in *[!0-9]*|'') echo 'invalid restic command timeout' >&2; exit 64 ;; esac
[ "$repository_probe_timeout" -gt 0 ] || { echo 'repository probe timeout must be positive' >&2; exit 64; }
[ "$restic_timeout" -gt 0 ] || { echo 'restic command timeout must be positive' >&2; exit 64; }

state_root=${BACKUP_STATE_ROOT:-/var/lib/aven-backups}
public_status="$state_root/public-status"
mkdir -p "$public_status"
chmod 0755 "$public_status"
run_id=$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')
stage="$state_root/staging/$run_id"
finish() {
  code=$?
  if [ "$code" -ne 0 ]; then
    printf '{"status":"degraded","checkedAt":%s,"snapshotCount":0}\n' "$(date -u +%s)" > "$public_status/health.next"
    chmod 0644 "$public_status/health.next"
    mv "$public_status/health.next" "$public_status/health.json"
  fi
  rm -rf "$stage"
}
trap finish EXIT
trap 'exit 1' HUP INT TERM
mkdir -p "$stage/databases"

pg_version=$(psql --no-psqlrc --tuples-only --no-align --dbname postgres \
  --command "SELECT current_setting('server_version_num')")
databases=$(psql --no-psqlrc --tuples-only --no-align --dbname postgres --command \
  "SELECT datname FROM pg_database WHERE datallowconn AND NOT datistemplate AND datname <> 'postgres' ORDER BY datname")
[ -n "$databases" ] || { echo 'no application databases found' >&2; exit 1; }

database_json=''
for database in $databases; do
  case "$database" in *[!A-Za-z0-9_-]*) echo "unsafe database name: $database" >&2; exit 1 ;; esac
  target="$stage/databases/$database.dump"
  roles="$stage/databases/$database.roles"
  database_owner=$(psql --no-psqlrc --tuples-only --no-align --dbname postgres \
    --command "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='$database'")
  case "$database_owner" in ''|*[!a-z0-9_]*) echo "unsafe database owner: $database_owner" >&2; exit 1 ;; esac
  psql --no-psqlrc --tuples-only --no-align --dbname "$database" --command \
    "SELECT rolname FROM pg_roles WHERE rolname <> 'postgres' AND rolname !~ '^pg_' ORDER BY rolname" > "$roles"
  while IFS= read -r role; do
    case "$role" in ''|*[!a-z0-9_]*) echo "unsafe application role: $role" >&2; exit 1 ;; esac
  done < "$roles"
  pg_dump --format=custom --compress=6 --dbname "$database" --file "$target"
  pg_restore --list "$target" >/dev/null
  digest=$(sha256sum "$target" | cut -d' ' -f1)
  roles_digest=$(sha256sum "$roles" | cut -d' ' -f1)
  item=$(printf '{"name":"%s","owner":"%s","sha256":"%s","rolesSha256":"%s"}' "$database" "$database_owner" "$digest" "$roles_digest")
  if [ -n "$database_json" ]; then database_json="$database_json,$item"; else database_json=$item; fi
done

created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
release=${BACKUP_RELEASE_ID:-unknown}
case "$release" in *[!A-Za-z0-9_.:@/-]*|'') echo 'invalid backup release id' >&2; exit 64 ;; esac
printf '%s\n' "{\"formatVersion\":1,\"backupId\":\"$run_id\",\"environment\":\"$BACKUP_ENVIRONMENT\",\"host\":\"$BACKUP_HOST\",\"release\":\"$release\",\"createdAt\":\"$created_at\",\"postgresVersionNumber\":$pg_version,\"databases\":[$database_json]}" > "$stage/manifest.json"
sha256sum "$stage/manifest.json" | cut -d' ' -f1 > "$stage/manifest.sha256"

if ! timeout "$repository_probe_timeout" restic snapshots --json >/dev/null; then
  echo 'backup repository is not initialized or temporarily unavailable; attempting initialization' >&2
  timeout "$repository_probe_timeout" restic init
fi
snapshot_id=$(timeout "$restic_timeout" restic backup "$stage" \
  --host "$BACKUP_HOST" \
  --tag "environment:$BACKUP_ENVIRONMENT" \
  --tag 'kind:postgres-logical' \
  --json | awk -F'"' '/"message_type":"summary"/{for(i=1;i<=NF;i++) if($i=="snapshot_id") {print $(i+2); exit}}')
[ -n "$snapshot_id" ] || { echo 'restic did not return a snapshot id' >&2; exit 1; }

timeout "$restic_timeout" restic forget --host "$BACKUP_HOST" --tag 'kind:postgres-logical' \
  --keep-within 14d --keep-weekly 8 --keep-monthly 12 --prune
timeout "$restic_timeout" restic check
snapshot_count=$(timeout "$repository_probe_timeout" restic snapshots --host "$BACKUP_HOST" --tag "environment:$BACKUP_ENVIRONMENT" --json | jq length)
case "$snapshot_count" in ''|*[!0-9]*) echo 'invalid snapshot count' >&2; exit 1 ;; esac
printf '{"status":"healthy","checkedAt":%s,"snapshotCount":%s}\n' "$(date -u +%s)" "$snapshot_count" > "$public_status/health.next"
chmod 0644 "$public_status/health.next"
mv "$public_status/health.next" "$public_status/health.json"
printf '%s %s %s %s\n' "$(date -u +%s)" "$created_at" "$snapshot_id" "$run_id" > "$state_root/last-success"
echo "backup complete: $BACKUP_HOST $run_id $snapshot_id"
