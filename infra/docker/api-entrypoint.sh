#!/bin/sh
set -e
case "${RUNLY_SKIP_DB_INIT:-0}" in
  0)
    echo "[Runly] Applying database migrations..."
    pnpm exec prisma migrate deploy
    echo "[Runly] Running seed..."
    node prisma/seed.js
    ;;
  1)
    echo "[Runly] Skipping migrations and seed (RUNLY_SKIP_DB_INIT=1)."
    ;;
  *)
    echo "[Runly] RUNLY_SKIP_DB_INIT must be 0 or 1." >&2
    exit 1
    ;;
esac
echo "[Runly] Starting API..."
exec pnpm --filter @runly/api start
