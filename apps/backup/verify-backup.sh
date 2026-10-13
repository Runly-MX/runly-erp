#!/bin/bash
set -euo pipefail
: "${RUNLY_INSTANCE_ID:?RUNLY_INSTANCE_ID is required}"
: "${BACKUP_S3_ENDPOINT:?BACKUP_S3_ENDPOINT is required}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is required}"

export RESTIC_REPOSITORY="s3:${BACKUP_S3_ENDPOINT}/${BACKUP_S3_BUCKET}/${RUNLY_INSTANCE_ID}"
export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID:-}"
export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY:-}"
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-us-east-1}"
MODE="${BACKUP_COVERAGE_MODE:-complete}"
MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-36}"
[[ "$MODE" = complete || "$MODE" = database-only ]] || { echo "[verify] invalid coverage mode" >&2; exit 1; }
[[ "$MAX_AGE_HOURS" =~ ^[1-9][0-9]{0,5}$ ]] || { echo "[verify] invalid maximum age" >&2; exit 1; }
MAX_AGE_SECONDS=$(( MAX_AGE_HOURS * 3600 ))

echo "[verify] listing snapshots with verified matching coverage..."
SNAPSHOTS_JSON="$(restic --no-lock snapshots --json --host "$RUNLY_INSTANCE_ID")"
LATEST_JSON="$(printf '%s' "$SNAPSHOTS_JSON" | jq -ce --arg tag "runly-${MODE}-v1" --arg host "$RUNLY_INSTANCE_ID" '
  map(select(.hostname == $host and ((.tags // []) | index($tag)) and (((.tags // []) | index("runly-pending-v1")) | not)))
  | sort_by(.time) | last // error("no snapshot with verified matching coverage")')"
LATEST_TIME="$(printf '%s' "$LATEST_JSON" | jq -er '.time')"
LATEST_EPOCH="$(date -d "$LATEST_TIME" +%s)"
NOW_EPOCH="$(date +%s)"
AGE_SECONDS=$(( NOW_EPOCH - LATEST_EPOCH ))
if [ "$AGE_SECONDS" -lt -300 ] || [ "$AGE_SECONDS" -gt "$MAX_AGE_SECONDS" ]; then
  echo "[verify] FAILED: snapshot age/clock outside configured limit" >&2
  exit 1
fi

echo "[verify] checking repository integrity..."
restic --no-lock check
echo "[verify] OK: verified $MODE snapshot within $MAX_AGE_HOURS hours; application recovery still requires a rehearsal."
