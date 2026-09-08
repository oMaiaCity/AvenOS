#!/bin/sh
set -eu

case "${1:-loop}" in
  backup)
    # Scheduled and post-migration snapshots share one lock. Wait for the previous
    # snapshot, then take a new one containing the completed customer activation.
    exec 9>"${BACKUP_STATE_ROOT:-/var/lib/aven-backups}/backup.lock"
    waited=0
    until flock -n 9; do
      waited=$((waited + 1))
      [ "$waited" -lt 1800 ] || { echo 'timed out waiting for the previous backup' >&2; exit 75; }
      sleep 1
    done
    exec /operations/backup.sh
    ;;
  health) exec /operations/healthcheck.sh ;;
  restore) shift; exec /operations/restore.sh "$@" ;;
  loop)
    interval=${BACKUP_INTERVAL_SECONDS:-3600}
    retry=${BACKUP_RETRY_SECONDS:-30}
    case "$interval" in *[!0-9]*|'') echo 'invalid backup interval' >&2; exit 64 ;; esac
    case "$retry" in *[!0-9]*|'') echo 'invalid backup retry interval' >&2; exit 64 ;; esac
    [ "$interval" -gt 0 ] || { echo 'backup interval must be positive' >&2; exit 64; }
    [ "$retry" -gt 0 ] || { echo 'backup retry interval must be positive' >&2; exit 64; }
    attempt=0
    inventory() {
      psql --no-psqlrc --tuples-only --no-align --dbname postgres --command \
        "SELECT md5(coalesce(string_agg(datname || ':' || datallowconn::text,',' ORDER BY datname),'')) FROM pg_database WHERE NOT datistemplate"
    }
    while :; do
      attempt=$((attempt + 1))
      before=''
      if [ "${BACKUP_RETAIN_RUNTIME_SNAPSHOTS:-false}" = true ]; then
        before=$(inventory) || true
      fi
      echo "backup attempt $attempt started"
      if /operations/entrypoint.sh backup; then
        echo "backup attempt $attempt succeeded; next run in ${interval}s"
        if [ "${BACKUP_RETAIN_RUNTIME_SNAPSHOTS:-false}" = true ]; then
          elapsed=0
          while [ "$elapsed" -lt "$interval" ]; do
            delay=30
            remaining=$((interval - elapsed))
            [ "$remaining" -ge "$delay" ] || delay=$remaining
            sleep "$delay" & wait $!
            elapsed=$((elapsed + delay))
            current=$(inventory) || break
            [ -n "$before" ] && [ "$before" = "$current" ] || break
          done
        else
          sleep "$interval" & wait $!
        fi
      else
        echo "backup attempt $attempt failed; retrying in ${retry}s" >&2
        sleep "$retry" & wait $!
      fi
    done
    ;;
  *) echo 'usage: entrypoint.sh [loop|backup|health|restore]' >&2; exit 64 ;;
esac
