# Plan — sinabe migrator (phase 3)

Spec: `docs/superpowers/specs/2026-10-14-sinabe-migrator-design.md`

## Stage A — source side (no Runly writes)
- A1 `dump-reader.mjs` + unit tests (extended inserts, escapes, NULL, hex/_binary, multi-line, huge strings).
- A2 `source.mjs`: `loadSinabe(dumpPath)` → `{ meta: { appliedMigrations, missingTables, missingColumns }, <table arrays> }` with sinabe column names exactly as in sinabe `schema.prisma` (Inventory, Model, …).
- A3 `files-listing.mjs` + `file-fetcher.mjs` (local/http, throttle, sha256).
- A4 `synthetic.mjs` (dump + uploads tree + listing, dirty data, fake names).
- A5 `census.mjs` + `cli.mjs census|synthetic`.

## Stage B — Runly side
- B1 `mapping/*.mjs` pure mappers (status, conditions priority, asset tag decision, custom fields, snapshots) + tests.
- B2 `plan.mjs`, `migrate.mjs` (dry-run/commit by batches with the legacy import toolkit), `report.mjs`.
- B3 `verify.mjs`, `rollback.mjs`.
- B4 Local run: synthetic 5000 → census → dry-run → pilot 50 → commit ~300 → verify → rollback; document the operator runbook in `scripts/migrations/sinabe/README.md` (Spanish operator steps, commands clean).
