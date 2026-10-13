# Backup and recovery acceptance

Date: 2026-10-12
Status: implementation verified with synthetic infrastructure; real B2/Supabase acceptance pending.

## What was verified

Verified: 2026-10-12 (combined targeted suite: 63/63, no skips; fixture Compose,
syntax and privacy checks passed). Supplementary path/configured-image checks
validate canonical snapshot paths and supplied image references; absent deployment
versions are not invented. Configured references do not prove the running image
digest; collect actual artifact versions in the private real-rehearsal inventory.

- Recovery config parses dotenv without execution and forwards only the five required Restic/AWS environment variables.
- Local Docker endpoint and immutable resolved image are checked before credentials reach a container.
- Original instance snapshot selection, explicit IDs, new destinations, link/junction rejection and interruption cleanup are covered.
- Legacy snapshots remain unknown/incomplete; new manifests validate SHA-256 and file sizes without claiming application recovery.
- Disposable MinIO read-only IAM access can inspect/extract without repository locks or object changes.
- Actual PostgreSQL 17 metadata inventory, pg_dump, rclone, Restic upload/check/tag and extraction were exercised. A known row was recovered into a new database.
- Five synthetic buckets, module source and instance config were included; local layout was verified separately with fixtures.
- Docker pipeline tests inject dump, metadata, copy, missing source, drift, access, upload, integrity, tagging and pruning errors. No failed required collection/upload is labeled complete.
- Only successful upload plus integrity check promotes a pending snapshot. Retention is scoped to verified matching coverage; old unknown snapshots are retained for manual review.
- Independent age checks reject stale, pending, partial, wrong-host and future-clock candidates. Complete external config requires source Storage access.
- Isolated installer config writes/rendering preserve existing password, identity, regions and unrelated fields. This does not claim full installer deployment reruns.
- Compose validated using synthetic env files with `config --quiet`; no services started by that check.

## Reproduce local verification

Use a disposable development environment with Node dependencies and Docker local.
Build the image first; the S3 test requires locally available MinIO and PostgreSQL
17 images. Each integration test resolves those references to image IDs before use.
The fixtures create their own containers/network/repository and remove them afterward.
They never read deployment credentials.

```powershell
docker build -f infra/docker/backup.Dockerfile -t runly-backup-recovery:verification .
$env:RUN_RECOVERY_S3_TESTS='1'
$env:RUN_BACKUP_PIPELINE_TESTS='1'
node --test scripts/recovery/__tests__/*.test.mjs apps/backup/tests/*.test.mjs infra/installer/lib/backup-config.test.mjs infra/installer/lib/backup-installer-preservation.test.mjs
pnpm check:privacy
git diff --check
```

Without the opt-in variables, Docker integration groups are explicitly skipped.
Do not report their default skipped run as operational acceptance.

## Real rehearsal checklist

- [ ] Privately identify original deployment mode, database server/dump versions, compatible Supabase/Runly images and repository prefix.
- [ ] Locate original RESTIC_PASSWORD outside the encrypted repository and obtain a B2 read/list credential. Do not create a replacement encryption password for old snapshots.
- [ ] Define an isolated, nonpublic target; prevent scheduled jobs and notifications from affecting original users/external integrations.
- [ ] Choose a pre-incident snapshot; extract and assess actual coverage before restoring a database.
- [ ] Bootstrap compatible Supabase infrastructure with API/worker/jobs stopped. Restore DB, classify errors and confirm Auth/role/extension prerequisites.
- [ ] Restore Storage in the correct raw-volume or S3-object format, preserving keys, configuration and database metadata semantics.
- [ ] Restore module source and adjust target connection settings. Keep backup/SMTP/push/sync side effects disabled during the rehearsal.
- [ ] Start the reviewed application version deliberately; verify migrations/seed compatibility.
- [ ] Verify login, two-company negative access, known rows, files from every required bucket and installed custom-module route/UI.
- [ ] Record extraction, database restore and validation times plus snapshot data age; agree RPO/RTO and schedule with the operator.
- [ ] Test a new complete backup only after an authorized rollout; prove that independent monitoring detects an absent job.
- [ ] Review restoration/cutover results before any production traffic or source replacement.

## Current operational limitation

Presence-only review of the usual local installer/root env files found no B2 recovery
fields or original Restic password. No live source credential retrieval, actual B2
inspection, deployment, package/image publication, production restore or cutover was
performed. The original installation/private secret manager must supply the recovery
kit. No actual operational addresses, credentials, user data or workstation paths
are recorded here.

These source changes require a backup image containing the new scripts before
server rollout. Editing an env file alone does not upgrade the running backup job.

The synthetic database models Storage metadata and a fixture application table;
it is not a full Supabase Auth/Storage/Realtime acceptance environment. The code is
not sufficient evidence of recovery of an actual customer's installation.
