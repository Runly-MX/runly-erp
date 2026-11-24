#!/usr/bin/env bash
# F3.1 A/B driver: interleaves control (4173) and candidate (4174), N runs per profile, cold then session (warm reload).
# Needs E2E_USER_EMAIL, E2E_USER_PASSWORD, PERF_COMPANY_ID in the environment; writes <OUT>/<variant>/<profile>/<n>/res-*.json
N=${N:-5}; OUT=${OUT:?}
for i in $(seq 1 "$N"); do
  for profile in ${PROFILES:-desktop mid}; do
    for v in ctl head; do
      port=4173; [ "$v" = head ] && port=4174
      d="$OUT/$v/$profile/$i"; mkdir -p "$d"
      PERF_BASE="http://localhost:$port" PERF_OUT="$d" PERF_STATE="$d/state.json" node measure.mjs "$profile" cold > "$d/cold.log" 2>&1
      PERF_BASE="http://localhost:$port" PERF_OUT="$d" PERF_STATE="$d/state.json" node measure.mjs "$profile" session > "$d/session.log" 2>&1
      rm -f "$d/state.json"
    done
  done
  echo "round $i done" >> "$OUT/progress.log"
done
echo finished >> "$OUT/progress.log"
