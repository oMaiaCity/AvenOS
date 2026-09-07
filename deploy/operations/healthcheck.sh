#!/bin/sh
set -eu

state=${BACKUP_STATE_ROOT:-/var/lib/aven-backups}/last-success
[ -r "$state" ] || { echo 'no successful backup recorded' >&2; exit 1; }
last=$(cut -d' ' -f1 < "$state")
timestamp=$(cut -d' ' -f2 < "$state")
case "$last" in *[!0-9]*|'') echo 'invalid backup success marker' >&2; exit 1 ;; esac
now=$(date -u +%s)
maximum=${BACKUP_MAX_AGE_SECONDS:-7200}
[ "$last" -le "$now" ] || { echo 'backup marker is in the future' >&2; exit 1; }
[ $((now - last)) -le "$maximum" ] || { echo "backup is stale: $timestamp" >&2; exit 1; }
summary=${BACKUP_STATE_ROOT:-/var/lib/aven-backups}/public-status/health.json
jq -e --argjson now "$now" --argjson maximum "$maximum" \
  '.status == "healthy" and .snapshotCount > 0 and .checkedAt <= $now and ($now - .checkedAt) <= $maximum' \
  "$summary" >/dev/null || { echo 'latest backup attempt failed or its summary is stale' >&2; exit 1; }
echo "backup current: $timestamp"
