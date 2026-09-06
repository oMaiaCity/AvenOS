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
case "${RESTORE_NO_LOCK:-false}" in
  false) restic restore "$snapshot" --tag "environment:$BACKUP_ENVIRONMENT" --target "$stage" ;;
  true) restic --no-lock restore "$snapshot" --tag "environment:$BACKUP_ENVIRONMENT" --target "$stage" ;;
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
    dropdb "$database"
    exit 1
  fi
done
[ "$found" -eq 1 ] || { echo 'backup has no database dumps' >&2; exit 1; }
echo 'restore complete; run the normal deployment to recreate roles, migrate, reconcile, and reopen traffic'
