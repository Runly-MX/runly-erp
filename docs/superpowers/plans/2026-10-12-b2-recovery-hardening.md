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
- `apps/backup/backup-coverage.mjs` — source metadata, copy validation and private checksum manifest; uses Node built-ins and PostgreSQL CLI already in the image.
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
- `apps/backup/tests/backup-freshness.test.mjs` — Docker fixture verification of age, coverage and read-only checks.
- `infra/installer/lib/backup-installer-preservation.test.mjs` — execute isolated installer backup configuration/rendering against synthetic env files.
- `apps/backup/tests/fixtures/` — generated synthetic tool fixtures, no credentials/data.
- `docs/deployment/backup-acceptance.md` — sanitized checklist and dated results.

Modify:
- `apps/backup/run-backup.sh`, `verify-backup.sh` — coverage/manifest and freshness.
- `infra/docker/backup.Dockerfile` — only tooling actually required by verified scripts.

Implementation detail: add Node.js to the backup image for bounded JSON/path validation and hashing; preserve raw local Storage metadata with `cp -a`, not a contents-only JS copy. Local file layout defaults to the installer's `stub/stub` prefix and slash version separator; explicit overrides are recorded in the manifest. Source metadata is compared before/after collection, without claiming atomic DB/Storage consistency.
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
- [x] Use argument-array process invocation, allowlisted temporary env-file and finally cleanup; redact errors/logs and avoid forwarding full deployment config. Verified: 2026-10-12 (14 unit tests; Windows caller-only temporary ACL; interruption fixture).
- [x] Reject existing output, roots, ancestor traversal, symlink/junction/reparse points and unsafe snapshot paths. Verified: 2026-10-12 (config/path tests 6/6 including a real junction fixture); runtime invocation remains Task 3.
- [x] Test wrong config/flags/image/snapshot/path and interruption behavior with fake process results. Secrets must not appear in child argv or public logs. Verified: 2026-10-12 (14/14 unit tests; real read-only S3 integration passed separately).

Validation: `node --test scripts/recovery/__tests__/recovery-config.test.mjs scripts/recovery/__tests__/recovery-paths.test.mjs scripts/recovery/__tests__/recovery-cli.test.mjs`; syntax-check entry/helpers; privacy. Commit: `feat: add validated recovery configuration and safe extraction paths`.

## Task 3 — Inspect, extract and assess

- [x] Implement explicit original-instance snapshot listing and explicit snapshot extraction with tested read-only/no-lock behavior.
- [x] Prevent source `init`, `unlock`, `forget`, `prune` and any source-write subcommand from reaching the runner.
- [x] Assess DB dump readability, Storage/config/modules, manifest, checksums and honest legacy coverage. Operational success differs from full recovery success.
- [x] Build a disposable S3-compatible repository with synthetic data and both legacy/new layouts; use ephemeral credentials isolated from deployment.
- [ ] Test wrong password, foreign snapshot, malformed snapshot paths, corrupted data, disk/download interruption and nonempty output. Preserve failed extraction as clearly incomplete.

Validation: assessment/CLI unit tests and opt-in `recovery-s3.integration.test.mjs` against its self-created disposable repository. Record chosen Restic/image versions and prove source repository identity/snapshots unchanged. Commit: `feat: inspect and extract B2-compatible recovery snapshots`.

Verified: 2026-10-12 (`node --test scripts/recovery/__tests__/*.test.mjs`: 14 pass, real S3 test intentionally skipped; separate RUN_RECOVERY_S3_TESTS=1: 1/1 pass in 41.2s). Restic 0.18.1, PostgreSQL 17, five synthetic buckets, complete + legacy snapshots, read-only MinIO IAM credential, source objects unchanged, known file recovered and dump restored into a new database. This is not actual B2/Supabase/user-login acceptance. Local installer/root env files were checked for field presence only; none had recovery inputs. Original source ID/key and a real isolated target remain pending.

## Task 4 — Complete backup coverage

- [x] Inventory required buckets from source metadata and validate bucket names/object path mapping.
- [x] Capture the existing DB dump, all required buckets, module source and config; record coverageMode/version/time bounds in private manifest.
- [x] Mount module source read-only; exclude top-level installer transient directories and document every intentional omission.
- [x] Stop before snapshot/prune for any required source/copy failure; empty valid buckets succeed. Do not automatically unlock another running job.
- [x] Retain explicit database-only mode with unmistakable partial tags/manifest.
- [x] In Docker fixtures induce failure at dump, required Storage copy, modules/config, snapshot and integrity check; assert command order and absence of prune after failure.

Validation: `node --test apps/backup/tests/backup-pipeline.test.mjs`; shell `bash -n` in a compatible Docker image; relevant installer tests; disposable successful snapshot/extraction and known file checksum comparison. Commit: `fix: require complete backup coverage before success and prune`.

Verified: 2026-10-12 (Docker pipeline 20/20, local/external sources, empty bucket and unaccounted object; actual PostgreSQL inventory + rclone collection + Restic pending/upload/check/tag/prune exercised in separate S3 integration, 1/1 in 59.5s; known dump restored into a new PostgreSQL database). Matching coverage only is pruned; legacy snapshots remain for manual review. The test models Storage metadata in PostgreSQL and objects in MinIO; real Supabase authentication, Storage metadata restoration and module UI acceptance remain Tasks 6/7.

## Task 5 — Installer preservation and independent freshness

- [x] Introduce `BACKUP_COVERAGE_MODE=complete|database-only` and positive `BACKUP_MAX_AGE_HOURS`; default 36 for daily operation, independently configurable from retention. This is a configurable implementation default, not an installation SLA.
- [x] Preserve existing secrets, region, original instance ID and source location across backup config reruns; reject missing required complete-mode sources before starting jobs. Verified with isolated actual external config function and local resolver/render block; full installer Docker reruns are not claimed.
- [x] Forward configured S3 region consistently to backup/verification/recovery where applicable. B2 provider acceptance remains Task 7.
- [x] Select freshness from snapshots matching expected coverage; a newer database-only or pending snapshot cannot conceal an old complete snapshot.
- [x] Test installer backup configuration/rendering, disabled mode and defaults, fresh/old/missing snapshots and partial newest snapshot. Pipeline failure tests run without SMTP and fail without sending mail. Custom cron schedule and acceptable maximum age still require operator policy review.
- [x] Explain how an independent watchdog checks for a job that never started in the recovery runbook; configuring a real monitoring service is a later operational task.

Validation: config/failure fixture tests, targeted installer regression tests and Docker Compose rendered from synthetic env fixtures. Confirm no legacy password/instance regeneration. Commit: `fix: preserve recovery inputs and decouple backup freshness from retention`.

Verified: 2026-10-12 (installer backup config + isolated installer preservation 13/13; Docker freshness fixture 13/13, including stale complete/new partial, pending tags, wrong host, future clock and independent age; Node syntax checks on both installers). Real cron execution, B2-specific region/access and operator RPO/RTO remain unaccepted.

## Task 6 — Spanish restore runbook and disposable rehearsal

- [x] Document B2 access versus Restic decryption key, original prefix/instance, selected pre-incident snapshot and independent recovery kit.
- [x] Document read-only source access → new extraction → coverage assessment → compatible target bootstrap → DB restore → Storage/modules/config → controlled startup → user validation → explicit cutover.
- [x] Document keeping API/worker/jobs stopped until DB/Storage recovery is ready; never start the API against an incomplete restored DB to let migrate/seed run implicitly. Actual target execution remains pending.
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
