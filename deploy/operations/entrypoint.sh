#!/bin/sh
set -eu

case "${1:-loop}" in
  backup) exec /operations/backup.sh ;;
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
    while :; do
      attempt=$((attempt + 1))
      echo "backup attempt $attempt started"
      if /operations/backup.sh; then
        echo "backup attempt $attempt succeeded; next run in ${interval}s"
        sleep "$interval" & wait $!
      else
        echo "backup attempt $attempt failed; retrying in ${retry}s" >&2
        sleep "$retry" & wait $!
      fi
    done
    ;;
  *) echo 'usage: entrypoint.sh [loop|backup|health|restore]' >&2; exit 64 ;;
esac
