#!/usr/bin/env bash
# update-local.sh — one-shot updater for an EXISTING Runly ERP `local` install
# (Linux / macOS / Git Bash). bootstrap-local.sh already refreshes the
# installer's own scripts/compose AND runs `npm run runly:local`
# (pull + migrate + recreate) unless --skip-run is passed — this is a thin,
# discoverable alias for that existing behavior, matching update-external.sh.
#
# Safe to re-run: bootstrap-local.sh never touches .env.local, and never
# touches custom-modules/.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "[runly-update] Refrescando el instalador y actualizando Runly (pull + migrate + recreate)..."
REF="${RUNLY_INSTALLER_REF:-}"
if [[ -z "$REF" ]]; then
  REF=$(curl --proto '=https' --tlsv1.2 -fsS https://api.github.com/repos/Runly-MX/runly-erp/git/ref/heads/main | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).object.sha))')
fi
[[ "$REF" =~ ^[a-f0-9]{40}$ ]] || { echo "INSTALLER_IMMUTABLE_REF_REQUIRED" >&2; exit 1; }
NEXT=$(mktemp "$DIR/.bootstrap-local.XXXXXX")
trap 'rm -f "$NEXT"' EXIT
curl --proto '=https' --tlsv1.2 -fsSLo "$NEXT" "https://raw.githubusercontent.com/Runly-MX/runly-erp/$REF/infra/installer/bootstrap-local.sh"
bash -n "$NEXT"
RUNLY_INSTALLER_REF="$REF" bash "$NEXT"
