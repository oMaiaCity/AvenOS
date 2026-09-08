#!/bin/sh
set -eu
umask 077

required='PGHOST PGUSER PGPASSWORD RESTIC_REPOSITORY RESTIC_PASSWORD BACKUP_ENVIRONMENT RESTORE_CONFIRMATION'
for name in $required; do
  eval "value=\${$name:-}"
  [ -n "$value" ] || { echo "$name is required" >&2; exit 64; }
done
[ "$RESTORE_CONFIRMATION" = 'fresh-target-only' ] || {
  echo 'RESTORE_CONFIRMATION must equal fresh-target-only' >&2
  exit 64
}
case "$BACKUP_ENVIRONMENT" in *[!A-Za-z0-9_.-]*|'') echo 'invalid backup environment' >&2; exit 64 ;; esac

state_root=${BACKUP_STATE_ROOT:-/var/lib/aven-backups}
snapshot=${RESTORE_SNAPSHOT:-latest}
stage="$state_root/restore-$(date -u +%Y%m%dT%H%M%SZ)-$$"
trap 'rm -rf "$stage"' EXIT HUP INT TERM
mkdir -p "$stage"
release_destination=${RESTORE_RELEASE_DESTINATION:-}
set --
if [ -z "$release_destination" ]; then
  # Database-only verification stays bounded even when many release images are retained.
  set -- --exclude /var/lib/aven-release-archive
else
  case "$release_destination" in /*) ;; *) echo 'release recovery destination must be absolute' >&2; exit 64 ;; esac
  [ ! -e "$release_destination" ] && [ ! -L "$release_destination" ] || {
    echo 'release recovery destination must be new' >&2; exit 1;
  }
fi
case "${RESTORE_NO_LOCK:-false}" in
  false) restic restore "$snapshot" --tag "environment:$BACKUP_ENVIRONMENT" --target "$stage" "$@" ;;
  true) restic --no-lock restore "$snapshot" --tag "environment:$BACKUP_ENVIRONMENT" --target "$stage" "$@" ;;
  *) echo 'RESTORE_NO_LOCK must be true or false' >&2; exit 64 ;;
esac
manifest=$(find "$stage" -type f -name manifest.json -print | head -1)
[ -n "$manifest" ] || { echo 'backup has no manifest' >&2; exit 1; }
manifest_dir=$(dirname "$manifest")
grep -Fq '"environment":"'"$BACKUP_ENVIRONMENT"'"' "$manifest" || {
  echo "backup environment does not match $BACKUP_ENVIRONMENT" >&2
  exit 1
}
expected=$(cat "$manifest_dir/manifest.sha256")
actual=$(sha256sum "$manifest" | cut -d' ' -f1)
[ "$expected" = "$actual" ] || { echo 'manifest integrity check failed' >&2; exit 1; }

selection_digest=$(jq -r '.releaseSelectionSha256 // empty' "$manifest")
if [ -n "$selection_digest" ]; then
  selection="$manifest_dir/release-selection.json"
  [ "$selection_digest" = "$(sha256sum "$selection" | cut -d' ' -f1)" ] || {
    echo 'release selection integrity check failed' >&2; exit 1;
  }
  jq -e --arg target "$BACKUP_ENVIRONMENT" --arg release "$(jq -r .release "$manifest")" \
    '.version == 1 and .target == $target and .releaseSha == $release and (.release | test("^[a-f0-9]{64}$")) and (.configuration | test("^[a-f0-9]{64}$"))' \
    "$selection" >/dev/null || { echo 'release selection differs from database backup' >&2; exit 1; }
fi
if [ -n "$release_destination" ]; then
  [ -n "$selection_digest" ] || { echo 'snapshot does not contain a retained release' >&2; exit 1; }
  retained="$stage/var/lib/aven-release-archive"
  [ -d "$retained/$(jq -r .release "$selection")/configurations/$(jq -r .configuration "$selection")" ] || {
    echo 'selected release configuration is missing from snapshot' >&2; exit 1;
  }
  cp -R "$retained" "$release_destination"
  chmod 0700 "$release_destination"
  cp "$selection" "$release_destination/current.json"
  echo 'Release recovery material preserved; verify it with the release archive tool before starting services.'
fi

found=0
for dump in "$manifest_dir"/databases/*.dump; do
  [ -f "$dump" ] || continue
  found=1
  database=$(basename "$dump" .dump)
  case "$database" in *[!A-Za-z0-9_-]*) echo "unsafe database name: $database" >&2; exit 1 ;; esac
  database_owner=$(sed -n "s/.*{\"name\":\"$database\",\"owner\":\"\([a-z0-9_]*\)\",.*/\1/p" "$manifest")
  expected=$(sed -n "s/.*{\"name\":\"$database\",\"owner\":\"[a-z0-9_]*\",\"sha256\":\"\([0-9a-f]*\)\".*/\1/p" "$manifest")
  actual=$(sha256sum "$dump" | cut -d' ' -f1)
  [ -n "$expected" ] && [ "$expected" = "$actual" ] || {
    echo "database dump integrity check failed: $database" >&2
    exit 1
  }
  roles="$manifest_dir/databases/$database.roles"
  expected_roles=$(sed -n "s/.*{\"name\":\"$database\",\"owner\":\"[a-z0-9_]*\",\"sha256\":\"[0-9a-f]*\",\"rolesSha256\":\"\([0-9a-f]*\)\"}.*/\1/p" "$manifest")
  actual_roles=$(sha256sum "$roles" | cut -d' ' -f1)
  [ -n "$expected_roles" ] && [ "$expected_roles" = "$actual_roles" ] || {
    echo "role manifest integrity check failed: $database" >&2
    exit 1
  }
  case "$database_owner" in ''|*[!a-z0-9_]*) echo "unsafe database owner: $database_owner" >&2; exit 1 ;; esac
  while IFS= read -r owner; do
    case "$owner" in ''|*[!a-z0-9_]*) echo "unsafe application role: $owner" >&2; exit 1 ;; esac
    psql --no-psqlrc --dbname postgres --command \
      "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='$owner') THEN CREATE ROLE $owner NOLOGIN; END IF; END \$\$" >/dev/null
  done < "$roles"
  exists=$(psql --no-psqlrc --tuples-only --no-align --dbname postgres \
	--command "SELECT 1 FROM pg_database WHERE datname = '$database'")
  if [ -n "$exists" ]; then
    relations=$(psql --no-psqlrc --tuples-only --no-align --dbname "$database" --command \
      "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind IN ('r','p','m','S')")
    [ "$relations" = 0 ] || {
      echo "refusing to overwrite populated database: $database" >&2
      exit 1
    }
    dropdb "$database"
  fi
  createdb --owner "$database_owner" "$database"
  if ! pg_restore --exit-on-error --dbname "$database" "$dump"; then
    echo 'Restore failed; the partial database is retained for inspection. Retry on a fresh target.' >&2
    exit 1
  fi
done
[ "$found" -eq 1 ] || { echo 'backup has no database dumps' >&2; exit 1; }
echo 'restore complete; run the normal deployment to recreate roles, migrate, reconcile, and reopen traffic'
