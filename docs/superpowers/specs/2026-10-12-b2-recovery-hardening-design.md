# B2 recovery and complete backup evidence

Date: 2026-10-12
Status: Proposed
Spec file: docs/superpowers/specs/2026-10-12-b2-recovery-hardening-design.md
Plan file: docs/superpowers/plans/2026-10-12-b2-recovery-hardening.md

## 1. Feature title

Recover Runly from its Restic repository on Backblaze B2 and make incomplete backup coverage visible.

## 2. Status

Proposed. Implementation and a real B2 rehearsal have not started. This updates the backup design from 2026-09-26 specifically where it accepted omitted Storage and used retention as the freshness threshold. It preserves encrypted Restic/S3 repositories and manual database/Storage restoration.

## 3. Context

The operator uses B2 and does not have an established recovery routine. Existing `apps/backup/` scripts create a PostgreSQL dump, Storage copy and config copy. The current external copy only enumerates two buckets, tolerates copy errors and can omit Storage. Existing runbook records a historical restore but does not demonstrate current installation coverage. API startup runs migrations and seed automatically.

## 4. Problem

Repository integrity and existence of a snapshot do not prove that all Runly resources can be recovered. An operator also needs original repository location, encryption credentials, original instance identity, compatible software and a sequence that avoids prematurely modifying the restored database.

## 5. Goals

1. Read/list/extract a selected historical snapshot without writing to the B2 repository.
2. Classify recoverable, missing and unknown resources before starting any database restore.
3. New scheduled complete snapshots fail if any required source/copy is missing or fails.
4. Preserve original encryption password, instance identity and repository path on installer reruns.
5. Verify backup age independently of retention; propose maximum age 36 hours for the default daily schedule.
6. Publish a Spanish runbook and prove it on a disposable installation; separately measure a real B2 rehearsal.

## 6. Non-goals

No production restore, DNS cutover, live credential retrieval, automatic pg_restore, automatic volume overwrite, delete/prune/unlock/init of the recovery source, password rotation, historical snapshot rewriting, full VM-image backup, new backup provider or guaranteed DB/Storage point-in-time consistency. A restore rehearsal does not imply permission to expose restored personal data to the internet.

## 7. User stories

- As an operator, I can choose a pre-incident snapshot and inspect/extract it even if the original server is gone.
- As an owner, I know when a snapshot is missing chat files or custom-module sources.
- As a maintainer, I can test failure stages without a real production database or B2 credential.

## 8. UX requirements

CLI/runbook in Spanish. Never print secret values, full connection strings or private object paths in public evidence. Require explicit snapshot ID for extraction; never silently choose `latest`. Operational summaries distinguish `complete`, `incomplete` and `legacy-unknown`. N/A: new browser UI.

## 9. Routes/screens

N/A. Operator entry point: a Node.js wrapper in `scripts/recovery/runly-recovery.mjs`, invoking the existing backup image through Docker. No HTTP restore endpoint.

## 10. Data model

N/A: application tables. Add `backup-manifest.json` to new snapshots with schemaVersion 1, coverageMode, createdAt, original instance ID, PostgreSQL server/dump-tool major versions, supplied release revision/image references, and per-resource status/counts/bytes where available. Do not fabricate versions that cannot be identified. Resource categories: database, Storage buckets, custom modules and configuration. Manifest is private operational data; never commit actual inventories.

CoverageMode is `complete` or explicitly requested `database-only`. A database-only snapshot is not a complete-installation recovery point. Absent source metadata in a legacy snapshot means unknown, not zero objects or verified completeness. File inventories/checksums can be separate private files to avoid leaking names into summaries.

## 11. Prisma impact

New models: N/A. Modified models: N/A. New migration required: No. Backup inventory can query existing Storage metadata read-only. Recovery preserves `_prisma_migrations`; no checksum repair. pg_dump must be compatible with the actual server major; PostgreSQL 18 test success does not validate the PostgreSQL 17 backup image against a PostgreSQL 18 source.

## 12. API contract

N/A: HTTP. Proposed CLI contract:

- `inspect --config <private-env-file> --image <pinned-image>`: validate recovery inputs, list snapshots for the original instance and report availability. No source-repository write or destination mutation.
- `extract --config <private-env-file> --image <pinned-image> --snapshot <id> --output <new-directory>`: resolve exactly one snapshot belonging to the configured original instance, inspect path safety, restore and validate the local extraction; report coverage.
- `assess --input <extracted-directory>`: examine expected files/manifests locally and produce a sanitized summary; no Docker or network requirement.

Proposed exit codes: 0 operation succeeded (legacy coverage may be unknown and is explicitly reported); 1 execution/integrity error; 2 invalid input/unsafe destination; 3 known incomplete required coverage. CLI success is never labeled successful installation recovery. Reject missing passwords and source IDs; recovery must not generate replacements. Require pinned tag/digest rather than `latest` for execution; record the resolved digest.

## 13. SDK contract

N/A. No browser or @runly/sdk recovery method.

## 14. Validator contract

CLI validates command/flags, config presence, allowed image reference, snapshot ID, original instance ID and safe paths. Pass child-process arguments as an array without shell interpolation. Allowlist recovery variables when creating a restricted temporary Docker env-file; delete it in finally. Never mount a full installer env into an untrusted image.

## 15. Module manifest impact

N/A. Back up instance-local custom-module sources as data, not tracked ERP source. Exclude `.locks`, `.staging` and `.previews`; decide explicitly whether `.backups` are required or redundant in inventory. Do not claim a bundle is a replacement for editable module source.

## 16. Navigation impact

N/A.

## 17. Blueprint impact

N/A.

## 18. RBAC/permissions

No application permission added. B2 source recovery uses a credential scoped to the repository/bucket with the read/list rights needed by tested Restic operations. Read-only commands must use the appropriate no-lock behavior where supported and validated. Source cannot be altered even during inspect/extract. Backup/prune credentials remain separate from recovery credentials where feasible. Target DB/Storage credentials are used only in later explicit manual restoration.

## 19. Multi-company behavior

Snapshots are installation-wide and may contain multiple companies. Match original instance identity and repository prefix exactly. Restore all historical company IDs unchanged. Keep the target isolated; acceptance requires two-company negative tests before cutover. Do not rename company/module identities during restore.

## 20. Files/storage impact

Complete backup inventories all required Storage buckets from existing metadata rather than a fixed two-bucket list. Compare source inventory and copied objects/counts; validate bucket names and mapping before shell/path use. Source metadata and copying are not transactionally consistent: capture time bounds and any discrepancy; fail on unaccounted required objects.

Local mode mounts Storage, config and custom-module data read-only. External mode inventories and copies all required buckets via configured Storage access and mounts custom modules read-only. Empty valid buckets differ from inaccessible sources. Required source/copy failure aborts before snapshot publication or prune. No completed marker if restic backup/check fails. No automatic unlock while another backup may be active.

Instance config and module sources are required for `complete`; `database-only` is an explicit opt-in limitation, visibly distinct in snapshot tags and manifest. Changing that setting must not silently remove existing recovery coverage.

## 21. Export/import requirements

Restore extraction is DB dump + objects + config/modules, as actually available. Assessment checks dump readability through pg_restore listing in the compatible image and validates private checksums/counts where recorded. It cannot infer omitted historical files. Re-upload to external Supabase must preserve bucket configuration, object keys and metadata consistency; verify local Storage volume layout with the deployed version before copying.

## 22. Audit log requirements

No database audit writes during inspect/extract. Private operational evidence records stage, snapshot identifier, image digest, elapsed time and coverage. Tracked evidence contains sanitized results only. Recovery prerequisites include an independently held RESTIC_PASSWORD; the encrypted config copy cannot bootstrap decryption of itself.

## 23. Edge cases

1. Wrong password, wrong bucket/prefix, missing rights or wrong original instance ID.
2. Latest snapshot already contains the incident; explicit older selection is required.
3. Legacy snapshot lacks manifest, modules or a required bucket.
4. Damaged archive, partial download, full disk or interrupted extraction.
5. Nonempty destination, symlink/junction/reparse point or path traversal in snapshot paths.
6. Config contains CRLF/quotes/unused variables; parse dotenv without executing it.
7. Storage credentials are missing or one bucket returns an error.
8. Backup job never runs, so its own failure alert never fires.
9. The dump references Supabase roles/extensions or transcriber grants not bootstrapped on target.
10. API/worker starts before restoration and runs migrations/seed against an incomplete target.

## 24. Risks

Incorrect restore target: v1 only extracts to a new directory, leaves application restoration manual and requires explicit target review. Secret exposure: narrow config parser, sanitized output and private temporary files. Historical omissions: assess before spending time on full recovery and preserve current surviving resources. Inconsistent DB/Storage: report the limitation and test actual referenced assets. Pruning good backups after bad copies: abort before snapshot/prune and keep old repositories intact. Stronger validation may expose previously accepted partial installations; provide migration instructions and explicit database-only mode instead of silently breaking expectations.

## 25. Acceptance criteria

1. Given valid recovery config, inspect lists only snapshots belonging to the original installation without repository mutation.
2. Given a selected snapshot and a new safe directory, extraction returns decrypted files and an honest coverage assessment.
3. Given wrong credentials, unsafe path, nonempty destination or foreign snapshot, extraction fails before target changes.
4. Given a legacy snapshot, assessment reports unknown/missing coverage without initializing/replacing the source repository.
5. Given a complete backup with five required buckets and custom modules, each is inventoried and recovered; an induced copy failure aborts before restic backup/prune.
6. Given no Storage credentials in complete external mode, configuration fails; explicit database-only mode remains labeled partial.
7. Given a daily schedule and snapshot older than the configured 36-hour maximum, verification fails independently of retention.
8. Given an isolated recovered installation, login, two-company isolation, known file checksums and a custom-module route/UI work; elapsed recovery time and snapshot age are recorded.
9. Given missing real B2 access/hardware, synthetic tests may pass, but real rehearsal remains open and is not marked accepted.

## 26. Verification plan

Node built-in tests for CLI/parser/path safety and fake process failures. Shell tests through a Docker fixture with fake pg_dump/rclone/restic ensure failure ordering. Disposable S3-compatible repository tests validate inspect/extract and legacy handling; confirm no-lock behavior using the selected Restic version. Real B2 rehearsal is a distinct task using private recovery config and a specified isolated target. Run privacy, shell syntax, installer config tests and relevant existing backup tests after changes. No production data use in public fixtures.

## 27. Rollback plan

Source changes can be reverted without database migration. Preserve all pre-change snapshots and original credentials. Do not prune/init/unlock source repositories during rollback. Keep the old backup image/config available until a new complete snapshot and rehearsal pass; reverting must visibly restore the older limited coverage. Extraction failure preserves partial local output for diagnosis, clearly marked incomplete, and never deletes arbitrary user directories.

## 28. Future enhancements

Approved automated target provisioning/restore, point-in-time consistency, independent watchdog integration, periodic restoration, application-level export manifests and object-lock retention design. These require additional specs; do not enable B2 Object Lock on the current prune workflow without checking compatibility.
