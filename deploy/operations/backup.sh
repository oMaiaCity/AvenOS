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
allow_empty=${BACKUP_ALLOW_EMPTY:-false}
case "$allow_empty" in true|false) ;; *) echo 'invalid empty-runtime backup setting' >&2; exit 64 ;; esac
if [ -z "$databases" ]; then
  [ "$allow_empty" = true ] && [ "${BACKUP_RELEASE_ARCHIVE_ROOT:-}" = /var/lib/aven-release-archive ] || {
    echo 'no application databases found' >&2; exit 1;
  }
fi

database_json=''
customer_generations='{}'
directory_before=''
runtime_snapshots='{}'
runtime_directory=${BACKUP_RUNTIME_DIRECTORY:-}
directory_inventory() {
  psql --no-psqlrc --tuples-only --no-align --dbname aven_api --command \
    "SELECT coalesce(json_agg(e ORDER BY id),'[]') FROM (SELECT id,database_name,runtime_id,routing_generation,movement_id FROM customer_environments) e"
}
if [ -n "$runtime_directory" ]; then
  [ "$runtime_directory" = /runtime-backup-health ] || { echo 'invalid runtime backup directory' >&2; exit 64; }
  directory_before=$(directory_inventory)
  printf '%s' "$directory_before" | jq -e 'all(.[]; .movement_id == null)' >/dev/null || {
    echo 'customer movement is pending; wait for a completed recovery boundary' >&2; exit 1;
  }
  required_runtimes=$(printf '%s' "$directory_before" | jq -r '[.[].runtime_id] | unique | .[] | select(. != "primary")')
  for runtime in $required_runtimes; do
    case "$runtime" in *[!a-z0-9-]*|'') echo 'invalid runtime identity' >&2; exit 1 ;; esac
    health="$runtime_directory/$runtime/snapshot.json"
    [ -f "$health" ] && [ ! -L "$health" ] || { echo 'runtime snapshot is unavailable' >&2; exit 1; }
    cp "$health" "$stage/runtime-$runtime.json"
    jq -e --argjson now "$(date -u +%s)" --argjson customers "$directory_before" --arg runtime "$runtime" \
      '. as $health | .status == "healthy" and ($now - .checkedAt < 7200) and
       (.snapshotId | test("^[a-f0-9]{64}$")) and
       all($customers[] | select(.runtime_id == $runtime); . as $customer |
         $health.customerGenerations[$customer.database_name].environmentId == $customer.id and
         $health.customerGenerations[$customer.database_name].generation == $customer.routing_generation)' \
      "$stage/runtime-$runtime.json" >/dev/null || { echo 'runtime snapshot does not match current placement' >&2; exit 1; }
    runtime_snapshots=$(printf '%s' "$runtime_snapshots" | jq -c --arg runtime "$runtime" \
      --arg snapshot "$(jq -r .snapshotId "$stage/runtime-$runtime.json")" '. + {($runtime):$snapshot}')
  done
fi
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
  identity_before=''
  case "$database" in cust_*)
    has_identity=$(psql --no-psqlrc --tuples-only --no-align --dbname "$database" --command "SELECT to_regclass('aven_platform.environment_identity') IS NOT NULL")
    if [ "$has_identity" = t ]; then
      identity_before=$(psql --no-psqlrc --tuples-only --no-align --dbname "$database" --command \
        'SELECT json_build_object('\''environmentId'\'',environment_id,'\''generation'\'',routing_generation) FROM aven_platform.environment_identity WHERE singleton')
    fi
  ;; esac
  pg_dump --format=custom --compress=6 --dbname "$database" --file "$target"
  if [ -n "$identity_before" ]; then
    identity_after=$(psql --no-psqlrc --tuples-only --no-align --dbname "$database" --command \
      'SELECT json_build_object('\''environmentId'\'',environment_id,'\''generation'\'',routing_generation) FROM aven_platform.environment_identity WHERE singleton')
    [ "$identity_before" = "$identity_after" ] || { echo 'customer generation changed during backup' >&2; exit 1; }
    customer_generations=$(printf '%s' "$customer_generations" | jq -c --arg database "$database" --argjson identity "$identity_before" '. + {($database):$identity}')
  fi
  pg_restore --list "$target" >/dev/null
  digest=$(sha256sum "$target" | cut -d' ' -f1)
  roles_digest=$(sha256sum "$roles" | cut -d' ' -f1)
  item=$(printf '{"name":"%s","owner":"%s","sha256":"%s","rolesSha256":"%s"}' "$database" "$database_owner" "$digest" "$roles_digest")
  if [ -n "$database_json" ]; then database_json="$database_json,$item"; else database_json=$item; fi
done
if [ -n "$runtime_directory" ]; then
  [ "$directory_before" = "$(directory_inventory)" ] || { echo 'customer directory changed during backup' >&2; exit 1; }
fi

release_root=${BACKUP_RELEASE_ARCHIVE_ROOT:-}
release_selection='null'
if [ -n "$release_root" ]; then
  [ "$release_root" = /var/lib/aven-release-archive ] || { echo 'invalid release archive mount' >&2; exit 64; }
  [ -f "$release_root/current.json" ] || { echo 'retained release selection is missing' >&2; exit 1; }
  cp "$release_root/current.json" "$stage/release-selection.json"
  jq -e --arg environment "$BACKUP_ENVIRONMENT" --arg release "${BACKUP_RELEASE_ID:-unknown}" \
    '.version == 1 and .target == $environment and .releaseSha == $release and (.release | test("^[a-f0-9]{64}$")) and (.configuration | test("^[a-f0-9]{64}$"))' \
    "$stage/release-selection.json" >/dev/null || { echo 'retained release selection does not match this backup' >&2; exit 1; }
  selection_digest=$(sha256sum "$stage/release-selection.json" | cut -d' ' -f1)
  release_selection="\"$selection_digest\""
fi

created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
release=${BACKUP_RELEASE_ID:-unknown}
case "$release" in *[!A-Za-z0-9_.:@/-]*|'') echo 'invalid backup release id' >&2; exit 64 ;; esac
printf '%s\n' "{\"formatVersion\":1,\"backupId\":\"$run_id\",\"environment\":\"$BACKUP_ENVIRONMENT\",\"host\":\"$BACKUP_HOST\",\"release\":\"$release\",\"createdAt\":\"$created_at\",\"postgresVersionNumber\":$pg_version,\"releaseSelectionSha256\":$release_selection,\"allowEmpty\":$allow_empty,\"runtimeSnapshots\":$runtime_snapshots,\"databases\":[$database_json]}" > "$stage/manifest.json"
sha256sum "$stage/manifest.json" | cut -d' ' -f1 > "$stage/manifest.sha256"

if ! timeout "$repository_probe_timeout" restic snapshots --json >/dev/null; then
  echo 'backup repository is not initialized or temporarily unavailable; attempting initialization' >&2
  timeout "$repository_probe_timeout" restic init
fi
set -- "$stage"
if [ -n "$release_root" ]; then
  selected_release="$release_root/$(jq -r .release "$stage/release-selection.json")"
  selected_configuration="$selected_release/configurations/$(jq -r .configuration "$stage/release-selection.json")"
  # The selected fleet already contains every retained runtime. Older control snapshots
  # keep their own release selection; copying the entire local archive here would make
  # every fresh-host recovery download all historical configurations and image sets.
  set -- "$@" "$selected_release/index.json" "$selected_release/release.json" \
    "$selected_release/images.tar" "$selected_configuration"
fi
snapshot_id=$(timeout "$restic_timeout" restic backup "$@" \
  --exclude '**/.preparing-*' --exclude '**/.current-*' \
  --host "$BACKUP_HOST" \
  --tag "environment:$BACKUP_ENVIRONMENT" \
  --tag 'kind:postgres-logical' \
  --json | awk -F'"' '/"message_type":"summary"/{for(i=1;i<=NF;i++) if($i=="snapshot_id") {print $(i+2); exit}}')
[ -n "$snapshot_id" ] || { echo 'restic did not return a snapshot id' >&2; exit 1; }

case "${BACKUP_RETAIN_RUNTIME_SNAPSHOTS:-false}" in
  false)
    timeout "$restic_timeout" restic forget --host "$BACKUP_HOST" --tag 'kind:postgres-logical' \
      --keep-within 14d --keep-weekly 8 --keep-monthly 12 --prune ;;
  true)
    [ -n "$release_root" ] || { echo 'runtime retention requires its release archive' >&2; exit 64; }
    # Central snapshots reference exact runtime snapshots. Independent pruning would break recovery.
    # Runtime retirement must first prove that no retained central snapshot references this repository.
    ;;
  *) echo 'invalid runtime retention setting' >&2; exit 64 ;;
esac
timeout "$restic_timeout" restic check
snapshot_count=$(timeout "$repository_probe_timeout" restic snapshots --host "$BACKUP_HOST" --tag "environment:$BACKUP_ENVIRONMENT" --json | jq length)
case "$snapshot_count" in ''|*[!0-9]*) echo 'invalid snapshot count' >&2; exit 1 ;; esac
printf '{"status":"healthy","checkedAt":%s,"snapshotId":"%s","customerGenerations":%s}\n' "$(date -u +%s)" "$snapshot_id" "$customer_generations" > "$public_status/snapshot.next"
chmod 0600 "$public_status/snapshot.next"
mv "$public_status/snapshot.next" "$public_status/snapshot.json"
printf '{"status":"healthy","checkedAt":%s,"snapshotCount":%s}\n' "$(date -u +%s)" "$snapshot_count" > "$public_status/health.next"
chmod 0644 "$public_status/health.next"
mv "$public_status/health.next" "$public_status/health.json"
printf '%s %s %s %s\n' "$(date -u +%s)" "$created_at" "$snapshot_id" "$run_id" > "$state_root/last-success"
echo "backup complete: $BACKUP_HOST $run_id $snapshot_id"
