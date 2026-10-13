# B2 recovery and backup coverage — implementation plan

Date: 2026-10-12
Spec: docs/superpowers/specs/2026-10-12-b2-recovery-hardening-design.md
Status: In Progress

## Goal

Provide a reviewed inspect/extract/assess recovery tool, honest complete-backup coverage and a tested Spanish restoration sequence. Keep the original encrypted B2 repository intact and distinguish fixture verification from actual operational acceptance.

## Architecture summary

Node CLI parses an explicit private config, passes allowlisted values to Docker through a restricted temporary env-file, and invokes Restic in a pinned existing backup image. V1 extracts only; DB restore, Storage copy and traffic cutover remain explicit manual stages. Shell backup scripts and installer config gain coverage and independent age checks. No application schema change.

## File Structure Map

Create:
- `scripts/recovery/runly-recovery.mjs` — entry point, no target DB mutations.
- `scripts/recovery/recovery-config.mjs` — pure validation and secret allowlist.
- `scripts/recovery/recovery-paths.mjs` — canonical destination/snapshot path checks.
- `scripts/recovery/recovery-assessment.mjs` — legacy/new coverage classification.
- `scripts/recovery/__tests__/recovery-config.test.mjs`
- `scripts/recovery/__tests__/recovery-paths.test.mjs`
- `scripts/recovery/__tests__/recovery-assessment.test.mjs`
- `scripts/recovery/__tests__/recovery-cli.test.mjs`
- `scripts/recovery/__tests__/recovery-s3.integration.test.mjs`
- `apps/backup/tests/backup-pipeline.test.mjs` — Docker-backed fake tool failure tests.
- `apps/backup/tests/fixtures/` — generated synthetic tool fixtures, no credentials/data.
- `docs/deployment/backup-acceptance.md` — sanitized checklist and dated results.

Modify:
- `apps/backup/run-backup.sh`, `verify-backup.sh` — coverage/manifest and freshness.
- `infra/docker/backup.Dockerfile` — only tooling actually required by verified scripts.
- `infra/installer/lib/backup-config.mjs`, `backup-config.test.mjs` — coverage/max-age contract.
- `infra/installer/setup-local.mjs`, `setup-external.mjs` — preserve/write new config values.
- `infra/installer/.env.local.example`, `.env.external.example` — no actual targets/secrets.
- `infra/installer/docker-compose.yml` — read-only custom-module mount for backup profiles.
- `docs/deployment/backup-recovery.md`, `infra/installer/README.md` — recovery flow.
- `docs/TASKS.md` and this plan — actual evidence and remaining acceptance.

Update this map before adding helper files. Do not modify API startup, Prisma migrations or application tables in this phase.

## Task 1 — Recovery prerequisites and baseline

- [x] Declare implementation mode after confirming the spec/plan. Confirmed: 2026-10-12 (user continuation; declaration in chat).
- [x] Recheck existing scripts/config/runbook and relevant tests against current HEAD. Verified: 2026-10-12 (baseline installer backup tests 9/9; local backup image built; no deployment).
- [ ] Privately identify deployment mode, PostgreSQL/Supabase version, original instance ID/repository, pinned backup image and isolated target.
- [ ] Confirm RESTIC_PASSWORD is available outside the original server, without displaying it. Identify required B2 read/list scope.
- [ ] Confirm proposed daily maximum age (36 hours) and installation RPO/RTO with the operator. These are proposed policy values, not verified service guarantees.
- [ ] Assess existing snapshots read-only as soon as private inputs are available; do not wait for future backup changes to discover historical omissions.

Validation: existing `node --test infra/installer/lib/backup-config.test.mjs`; private prerequisite checklist only records presence in public evidence. Do not inspect live secrets by printing env files.

## Task 2 — Recovery configuration and path safety

- [x] Parse dotenv as data, validate required original source inputs and pinned image; never generate a missing password/instance ID. Verified: 2026-10-12 (recovery config/path tests 6/6).
- [ ] Use argument-array process invocation, allowlisted temporary env-file and finally cleanup; redact errors/logs and avoid forwarding full deployment config.
- [x] Reject existing output, roots, ancestor traversal, symlink/junction/reparse points and unsafe snapshot paths. Verified: 2026-10-12 (config/path tests 6/6 including a real junction fixture); runtime invocation remains Task 3.
- [ ] Test wrong config/flags/image/snapshot/path and interruption behavior with fake process results. Secrets must not appear in child argv or public logs.

Validation: `node --test scripts/recovery/__tests__/recovery-config.test.mjs scripts/recovery/__tests__/recovery-paths.test.mjs scripts/recovery/__tests__/recovery-cli.test.mjs`; syntax-check entry/helpers; privacy. Commit: `feat: add validated recovery configuration and safe extraction paths`.

## Task 3 — Inspect, extract and assess

- [ ] Implement explicit original-instance snapshot listing and explicit snapshot extraction with tested read-only/no-lock behavior.
- [ ] Prevent source `init`, `unlock`, `forget`, `prune` and any source-write subcommand from reaching the runner.
- [ ] Assess DB dump readability, Storage/config/modules, manifest, checksums and honest legacy coverage. Operational success differs from full recovery success.
- [ ] Build a disposable S3-compatible repository with synthetic data and both legacy/new layouts; use ephemeral credentials isolated from deployment.
- [ ] Test wrong password, foreign snapshot, malformed snapshot paths, corrupted data, disk/download interruption and nonempty output. Preserve failed extraction as clearly incomplete.

Validation: assessment/CLI unit tests and opt-in `recovery-s3.integration.test.mjs` against its self-created disposable repository. Record chosen Restic/image versions and prove source repository identity/snapshots unchanged. Commit: `feat: inspect and extract B2-compatible recovery snapshots`.

## Task 4 — Complete backup coverage

- [ ] Inventory required buckets from source metadata and validate bucket names/object path mapping.
- [ ] Capture the existing DB dump, all required buckets, module source and config; record coverageMode/version/time bounds in private manifest.
- [ ] Mount module source read-only; exclude transient directories according to the spec and document every intentional omission.
- [ ] Stop before snapshot/prune for any required source/copy failure; empty valid buckets succeed. Do not automatically unlock another running job.
- [ ] Retain explicit database-only mode with unmistakable partial tags/manifest.
- [ ] In Docker fixtures induce failure at dump, each Storage source/copy, modules/config, snapshot and integrity check; assert command order and absence of prune after failure.

Validation: `node --test apps/backup/tests/backup-pipeline.test.mjs`; shell `bash -n` in a compatible Docker image; relevant installer tests; disposable successful snapshot/extraction and known file checksum comparison. Commit: `fix: require complete backup coverage before success and prune`.

## Task 5 — Installer preservation and independent freshness

- [ ] Introduce `BACKUP_COVERAGE_MODE=complete|database-only` and positive `BACKUP_MAX_AGE_HOURS`; proposed default 36 for daily operation, independently configurable from retention.
- [ ] Preserve existing secrets, region, original instance ID and source location across reruns; reject missing required complete-mode sources before starting jobs.
- [ ] Forward configured S3 region consistently to backup/verification/recovery where applicable; verify compatibility with B2 rather than assuming an AWS default.
- [ ] Select freshness from snapshots matching expected coverage; a newer database-only snapshot cannot conceal an old complete snapshot.
- [ ] Test both installers, disabled mode, historical config upgrade, changed schedule, fresh/old/missing snapshots, partial newest snapshot and SMTP absence.
- [ ] Explain how an independent watchdog checks for a job that never started; configuring a real monitoring service is a later operational task.

Validation: config/failure fixture tests, targeted installer regression tests and Docker Compose rendered from synthetic env fixtures. Confirm no legacy password/instance regeneration. Commit: `fix: preserve recovery inputs and decouple backup freshness from retention`.

## Task 6 — Spanish restore runbook and disposable rehearsal

- [ ] Document B2 access versus Restic decryption key, original prefix/instance, selected pre-incident snapshot and independent recovery kit.
- [ ] Document read-only source access → new extraction → coverage assessment → compatible target bootstrap → DB restore → Storage/modules/config → controlled startup → user validation → explicit cutover.
- [ ] Keep API/worker/jobs stopped until DB/Storage recovery is ready; never start the API against an incomplete restored DB to let migrate/seed run implicitly.
- [ ] Classify expected bootstrap/ownership/extension errors against actual target version; unexpected errors fail acceptance. Test transcriber role reprovisioning where required.
- [ ] Restore synthetic companies/users/files/modules and verify login, two-company negative access, referenced file checksums, module route/UI and continued backup.
- [ ] Record source/target version compatibility, snapshot age, extraction/restore/validation times and known limitations in sanitized evidence.

Validation: disposable end-to-end run; `pnpm check:privacy`; `git diff --check`; relevant isolation suite on its disposable target. Commit: `docs: document and verify isolated Runly restoration`.

## Task 7 — Real B2 acceptance

- [ ] Identify the selected real snapshot and disposable destination privately before external execution; source access remains read-only.
- [ ] Rehearse extraction/recovery of that snapshot with private credentials and nonpublic restored data. Source installation, source B2 objects and production traffic remain unchanged.
- [ ] Verify known rows, files from every required bucket, custom modules, authentication and two-company isolation; record missing historical coverage separately.
- [ ] Test recovery credentials and decryption kit independently of the damaged-server scenario.
- [ ] Verify a new complete snapshot after backup rollout only when explicitly authorized; new backups cannot prove historical missing data existed.
- [ ] Record actual RPO/RTO observations and any residual blocker. Do not mark the phase complete while real rehearsal remains unperformed.

Commit: dated sanitized operational acceptance evidence only, after it exists. No push, image publication, production restore or cutover is authorized by this plan alone.

## Rollback Notes

Use bounded source revert commits; no database migration in this phase. Preserve original repositories, passwords and good snapshots. Do not delete partial extraction directories automatically. A rollback to older backup behavior must state its coverage limitations. Real-target change and source-repository mutation require their own identified scope.

## Verification Gate

Each task is checked only after its listed verification succeeds; record actual commands, revision, image digest and fixture/real distinction. Missing B2 access does not prevent safe implementation/fixture tests, but it blocks Task 7 acceptance. Never mark a failed/omitted scan or rehearsal green. Update TASKS and commit scoped paths on each validated boundary.

## Planning evidence

Verified: 2026-10-12 (written specification, file map, prerequisites, command contracts, negative cases, verification and commit sequence reviewed; implementation and B2 access not executed).
