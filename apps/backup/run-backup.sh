#!/bin/bash
set -euo pipefail
umask 077

: "${RUNLY_INSTANCE_ID:?RUNLY_INSTANCE_ID is required}"
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_S3_ENDPOINT:?BACKUP_S3_ENDPOINT is required}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is required}"

# Namespaced by RUNLY_INSTANCE_ID so two instances can safely share one
# bucket (design spec, Edge case 8).
export RESTIC_REPOSITORY="s3:${BACKUP_S3_ENDPOINT}/${BACKUP_S3_BUCKET}/${RUNLY_INSTANCE_ID}"
export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID:-}"
export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY:-}"
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-us-east-1}"

SCRATCH_DIR="$(mktemp -d)"

# Alerts on failure only (a nightly "all good" email would just be noise).
# Reuses the same SMTP_*/RUNLY_SUPPORT_EMAIL vars the API already uses for
# bug reports (docker-compose.yml's env_file already exposes .env.local's
# vars to this container) — no new configuration needed to get alerts.
# `set -e` means any failing command (pg_dump, restic, etc.) exits the script
# immediately with a non-zero code, which this trap always sees.
send_failure_alert() {
  local exit_code=$1
  [ "$exit_code" -eq 0 ] && return 0
  if [ -z "${SMTP_HOST:-}" ]; then
    echo "[backup] SMTP_HOST not set — cannot send failure alert" >&2
    return 0
  fi
  local to="${RUNLY_SUPPORT_EMAIL:-hola@runly.mx}"
  local from="${SMTP_FROM_EMAIL:-${SMTP_USER:-runly-backup@localhost}}"
  local curl_args=(--fail --silent --show-error
    --url "smtp://${SMTP_HOST}:${SMTP_PORT:-587}"
    --mail-from "$from"
    --mail-rcpt "$to"
    --upload-file -)
  [ "${SMTP_TLS:-false}" = "true" ] && curl_args+=(--ssl-reqd)
  [ -n "${SMTP_USER:-}" ] && curl_args+=(--user "${SMTP_USER}:${SMTP_PASS:-}")
  if {
    printf 'Subject: [Runly backup] Fallo en %s\n' "${RUNLY_INSTANCE_ID}"
    printf 'From: %s\n' "$from"
    printf 'To: %s\n\n' "$to"
    printf 'El backup nocturno de la instancia %s fallo (codigo de salida %s).\n' "${RUNLY_INSTANCE_ID}" "$exit_code"
    printf 'Revisa los logs del contenedor de backup en el VPS (docker logs runly-backup-local o runly-backup-external).\n'
  } | curl "${curl_args[@]}"; then
    echo "[backup] failure alert emailed to $to"
  else
    echo "[backup] WARNING: could not send failure alert email" >&2
  fi
}
trap 'send_failure_alert $?; rm -rf "$SCRATCH_DIR"; rm -f "${SCRATCH_DIR}.restic.json"' EXIT

echo "[backup] $(date -Iseconds) starting backup run"

echo "[backup] collecting required sources..."
node /app/backup-coverage.mjs "$SCRATCH_DIR"

# Initialize only a genuinely absent repository. Authentication/network errors
# must never be treated as an invitation to create a new recovery source.
probe=0
restic snapshots --json >/dev/null 2>&1 || probe=$?
if [ "$probe" -eq 10 ]; then
  restic init
elif [ "$probe" -ne 0 ]; then
  echo "[backup] repository access failed; not initializing or pruning" >&2
  exit "$probe"
fi

COVERAGE_MODE="${BACKUP_COVERAGE_MODE:-complete}"
LOG_FILE="${SCRATCH_DIR}.restic.json"
echo "[backup] uploading a pending snapshot..."
restic backup "$SCRATCH_DIR" --json --tag runly --tag runly-pending-v1 --host "$RUNLY_INSTANCE_ID" > "$LOG_FILE"
SNAPSHOT_ID="$(jq -er 'select(.message_type == "summary") | .snapshot_id' "$LOG_FILE")"
[[ "$SNAPSHOT_ID" =~ ^[a-f0-9]{8,64}$ ]] || exit 1

echo "[backup] checking integrity before marking coverage accepted..."
restic check
restic tag --add "runly-${COVERAGE_MODE}-v1" --remove runly-pending-v1 "$SNAPSHOT_ID" >/dev/null

echo "[backup] pruning only verified snapshots with matching coverage..."
restic forget --host "$RUNLY_INSTANCE_ID" --tag "runly-${COVERAGE_MODE}-v1" --keep-daily "${BACKUP_RETENTION_DAYS:-14}" --prune

echo "[backup] $(date -Iseconds) backup run complete ($COVERAGE_MODE)"
