# Runly stabilization — implementation program

Date: 2026-10-12
Spec: docs/superpowers/specs/2026-10-12-runly-stabilization-design.md
Status: In Progress

## Goal

Execute the FODA findings in bounded workstreams with reproducible evidence, a recoverable installation and consistent workspace/registry package contracts. Planning is authorized; these checklists are not implementation completion or permission to deploy/publish/restore a real installation.

## Architecture summary

Keep the ERP monorepo and `workspace:*`; independent repositories consume exact approved @runly-mx registry versions under logical @runly imports. Restore B2 data through the existing encrypted Restic/S3 design, first in isolation. Retain aliases/stored identities. Use focused regressions before broad test gates; separate application correctness, packaging, deployment and operational acceptance.

## File Structure Map

This program changes only its documents and tracker. Each implementation workstream gets an exact file map in its child plan before editing code; discovery locations below are not unrestricted edit authorization.

Create:
- `docs/superpowers/specs/2026-10-12-runly-stabilization-design.md`
- `docs/superpowers/specs/2026-10-12-b2-recovery-hardening-design.md`
- `docs/superpowers/plans/2026-10-12-runly-stabilization.md`
- `docs/superpowers/plans/2026-10-12-b2-recovery-hardening.md`

Modify: `docs/TASKS.md` (add current program, preserve historical evidence).

Follow-up specs/plans to create before significant changes:
- `2026-10-12-company-transport-stabilization-design.md` / plan.
- `2026-10-12-regression-delivery-gates-design.md` / plan.
- `2026-10-12-shared-package-consumer-contracts-design.md` / plan.
- `2026-10-12-operational-acceptance-design.md` / plan.

Dates above identify this program's intended artifacts; use actual creation dates if written on a later day. Readiness, AI execution recovery and extension trust enforcement require their own focused child specs once discovery settles their contracts.

## Task 0 — Freeze evidence and assign work

- [x] Review the audit and current source status; preserve the subsequent installer/device changes.
- [x] Write program and B2 specifications (28 sections each).
- [x] Write program and B2 plans, dependencies, commit boundaries and initial tracker.
- [x] Confirm the proposed program/B2 specs/plans before implementation per `docs/spec-driven-development.md`; declare `Mode: IMPLEMENTATION` with the relevant paths. Confirmed: 2026-10-12 (user continuation; declaration in chat). Later child workstreams retain their own design tasks.
- [ ] Assign a named owner for code/CI, a recovery operator and a product/hardware acceptance owner. One person may hold multiple roles; unassigned roles remain visible.
- [ ] Refresh baseline suites on the implementation revision; record Node/pnpm versions and omitted integration groups. Do not assume the October 12 audit describes later commits.

Validation: numbered spec headings, file references, `pnpm check:privacy`, `git diff --check`; only planning tasks are marked complete. Baseline commands listed below run when implementation begins, not repeatedly for documentation edits.

Commit boundary: specifications, then plans/tracker. Existing FODA commit remains independent.

## Task 1 — B2 recovery and backup coverage (P0)

Dependency: Task 0 confirmation. Child plan: `2026-10-12-b2-recovery-hardening.md`.

- [ ] Inspect original snapshot availability using explicitly provided private recovery configuration; keep the source repository read-only.
- [x] Implement inspect/extract/assess and legacy coverage reporting.
- [x] Make required source/copy failures abort new complete backups; inventory all required buckets, modules and config.
- [x] Separate snapshot maximum age from retention; preserve old repository passwords/identities across reruns.
- [x] Verify in disposable fixtures and a disposable S3-compatible repository.
- [ ] Rehearse a real B2 snapshot on an explicitly identified isolated target and record missing assets, time and data age.

Verified: 2026-10-12 (63/63 synthetic targeted tests and subsequent fixture checks recorded in `docs/deployment/backup-acceptance.md`). Real B2 rehearsal deferred by user instruction; no real installation accepted.

Cierre: the operator can recover without the original server; login, resources, module source and company isolation are tested. Synthetic success alone cannot close the real rehearsal.

Commits: extraction CLI; complete-backup coverage; config/freshness; tested Spanish runbook/evidence. Use a distinct commit for each validated scope; code and its regression tests stay together.

## Task 2 — Confirmed correctness and context regressions (P0/P1)

Can progress independently of Task 1 code; deployment waits for a usable recovery path. Create child spec/plan first.

Discovery locations: `packages/sdk/src/index.js`, `company-fetch.js`, SDK company-fetch tests, `packages/core/src/module-identity.js`, official manifests/registration tests, external-chat visitor panel, `scripts/check-company-scope.mjs`.

- [x] Fix JSON-body company changes with the existing error semantics; test delayed JSON, blob, multipart, unchanged company, explicit-company and offline behaviors. Verified: 2026-10-12 (52/52 SDK tests, no skips; privacy and whitespace passed). Focused spec/plan: `2026-10-12-sdk-company-response-design.md` / `2026-10-12-sdk-company-response.md`. Other Task 2 corrections remain pending.
- [x] Add `runly.attendance` to current-only identities without inventing an Atlas alias; prove both identity and fallback tests. Verified: 2026-10-12 (31/31 core/identity/registration tests, both Registry implementations; RBAC 321/321, privacy and whitespace passed). Focused spec/plan: `2026-10-12-attendance-identity-design.md` / `2026-10-12-attendance-identity.md`.
- [x] Correct the confirmed conditional hook; verify transitions between no selection and selected conversation. Verified: 2026-10-12 (real React/Chrome fixture reproduced leaked countdown interval and passed after correction; closed/absent-expiry/unmount covered; targeted React Doctor has zero errors and 3 unrelated warnings; build/privacy/whitespace passed). Focused spec/plan: `2026-10-12-chat-visitor-hook-design.md` / `2026-10-12-chat-visitor-hook.md`.
- [ ] Classify all nine transport gate findings and add only evidenced narrow exceptions or use the transport. A substring header check is not a substitute for behavior tests.

Discovery: 2026-10-12, all nine current findings classified in `docs/architecture/2026-10-12-company-transport-findings.md`. Six public/asset contracts and three business calls that already send company headers but lack a post-body check. Behavioral proofs, code correction and narrow guardrail reconciliation remain pending; check:company-scope still exits 1.

Validation: SDK company-fetch, identity/registration and focused screen tests; React Doctor for changed React scope and web build when React changes. `pnpm check:company-scope` must pass without broad directory exclusions.

Commits: SDK race + tests; identity catalog + tests; hook fix; reviewed transport guardrail reconciliation. Do not combine them solely to make one green result.

## Task 3 — Baseline failures and dependency triage (P1)

Dependencies: Task 2 for confirmed regression families. Other classification may proceed earlier.

- [ ] Build a failure ledger: test, reproducible trigger, true regression/obsolete test/generated drift, owner and resolution evidence.
- [ ] Refresh project mocks against the service's real authorization contract.
- [ ] Validate Growth navigation intent; reconcile the assertion with that intent.
- [ ] Validate conditional-field nullability semantics before changing compiler/test expectations.
- [ ] Update scaffolder expectations to its supported files; syntax-check JavaScript rather than Markdown.
- [ ] Reconcile runtime catalog, public library docs and exported Dev Kit with lockfile/current exports. Read preview-runtime's actual external map; the QR test currently checks the old location.
- [ ] Capture current `pnpm audit --json`; classify by runtime/development, version, reachable input and patch feasibility.
- [ ] Patch one compatible dependency family per commit, with targeted regressions and packed-package verification where relevant. Significant major upgrades need additional design.
- [ ] Configure Gitleaks tooling for CI; missing binary remains visible as a failed secret gate.

Cierre: no unclassified failures or dependency alerts. A remaining exception includes scope, owner, reason, review date and mitigating evidence; do not turn assertions off to claim success.

## Task 4 — CI and reproducible releases (P1)

Dependency: Tasks 2/3 enough to define a truthful baseline; child spec/plan required.

- [ ] Add PR/push gates: frozen install, API/shared tests, disposable isolation, build web, privacy/secrets, UUID/schema/RBAC and company transport.
- [ ] Introduce real hooks/JavaScript lint rules progressively with a reviewed baseline; new violations fail. Avoid a global formatting/refactor commit.
- [ ] Set execution bounds and explicit fixture variables; ordinary CI must not inherit a deployment DB URL.
- [ ] Publish machine-readable test/skip/failure reports. If force-exit remains temporarily necessary, disclose it and track handle cleanup.
- [ ] Separate nightly/manual real-service tests from PR gates. Missing evidence must not appear as passed.
- [ ] Record source SHA, schema migration head, image digests, native versions and package revisions for each release.
- [ ] Rehearse upgrade from the previous supported release and check compatibility before proposing rollback.

Cierre: intentionally broken representative contracts/build/isolation checks fail the gate; verified releases have exact artifacts. Remote branch protection/publication setup is reviewed as a separate operational action.

Commits: reproducible test runner/reporting; mandatory workflow gates; lint baseline; release provenance. No package/image/APK publication is implicit in workflow creation.

## Task 5 — Workspace and registry package parity (P1)

Dependency: Task 3 generated-contract reconciliation. Keep ERP workspace consumption throughout. Child spec/plan required.

- [ ] Confirm approved six-package allowlist and current external consumer pins through read-only evidence.
- [ ] Pack from an exact clean committed revision into staging; do not claim dirty workspace artifacts are released versions.
- [ ] Test public exports, JSX/CSS processing and compiler/preview contracts in a consumer without sibling ERP source, local workspace resolution or undeclared hoisted dependencies.
- [ ] Verify no duplicate React/runtime caused by packaging; retain logical @runly imports and intended Atlas aliases.
- [ ] Validate exact dependency versions and shared manifest checksums; frozen external install must reproduce the contract.
- [ ] Add consumer tests to preparation/release verification; real registry retrieval is a separate acceptance check requiring existing read access.
- [ ] Document coordinated consumer updates and rollback to a prior exact package revision; do not migrate ERP imports to @runly-mx.

Commits: isolated consumer fixtures; release preparation gate; registry acceptance/docs. Cierre: pack and registry consumers pass without local source fallback. Publishing a new set requires a separate concrete release request.

## Task 6 — Operational acceptance and observability (P1)

Dependencies: usable recovery (Task 1), context correctness (Task 2), identifiable artifacts (Task 4). Prepare child spec/plan and private target inventory.

- [ ] Select and assign three first journeys: purchase → partial receipt/payment → asset/document; attendance enrollment → punch → correction/hours; file sharing/editing → revoke → recovery.
- [ ] Add collaboration acceptance: two internal users, external guest, Wi-Fi/mobile networks, reconnection, recording/Egress/transcription and revoked access.
- [ ] Verify Android background notifications/calls, blocked screen, audio routing, camera/QR/NFC and session recovery on supported hardware. Record unsupported functions explicitly.
- [ ] Check pending deployment-specific transcriber provision, PWA delivery and module catalog publication against actual versions before requesting changes.
- [ ] Specify liveness/readiness and queue/backup monitoring, including an independent signal for jobs that never started.
- [ ] Specify MirAI crash recovery/idempotency and observable audit failure; exercise crashes between claim/action/result.
- [ ] Define trusted-author installation policy and privileged module boundaries; untrusted execution isolation is a separate substantial workstream.
- [ ] Define authentication/revocation requirements, JWT claim policy and necessary CORS origins; test instead of tightening indiscriminately and breaking guest/native flows.

Cierre: versioned acceptance matrix reports passed/failed/unsupported/blocked, with operator evidence. Pending real services/hardware stay open while other independent tasks proceed.

## Task 7 — Product scope, performance and backlog closure (P2)

- [ ] Agree supported accounting/fiscal scope and sources of truth across catalog stock, assets, purchases and ledgers; no compliance claim without business validation.
- [ ] Measure selected routes on representative hardware/network: load, interaction latency, memory and large imports; establish budgets before optimizing chunks.
- [ ] Prioritize keyboard/focus/accessibility failures in first journeys; then targeted complexity reductions where they reduce measured risk.
- [ ] Reconcile dated status/architecture/next-steps docs with implemented, verified, deployed and accepted states. Preserve historical evidence.
- [ ] Close or split obsolete backlog entries; retain explicitly deferred hardware/features and cross-module reporting with rationale.

Commits: measured focused improvements; current-state docs. Reporting engines and new vertical modules get separate specs rather than being slipped into stabilization.

## Verification Gate

Implementation baseline commands:

```powershell
node --test --test-timeout=60000 --test-concurrency=8 "apps/api/src/**/*.test.js"
node --test --test-timeout=60000 --test-concurrency=8 "packages/**/*.test.js" "apps/desktop/src/**/*.test.js"
pnpm test:isolation:fresh
pnpm --filter @runly/desktop build:web
pnpm check:privacy
pnpm check:secrets
pnpm check:company-scope
pnpm check:uuid-policy
pnpm check:supabase-schema-ownership
pnpm rbac:verify-catalog
git diff --check
```

Runner globs and tracked script/installer/Prisma tests must be validated on the chosen Node version; Task 4 supplies the authoritative enumeration. No use of live DB opt-in flags on an unidentified database. Root `pnpm lint` is recorded but not treated as proof of hook correctness until real rules are enabled. Every completed task receives dated actual command/results; failed/omitted checks stay visible.

## Commit and progress policy

For each scope: inspect → update exact child spec/plan → implementation declaration after confirmation → code plus meaningful regression → focused validation → progress evidence → commit only those paths. Commit on validated boundaries, not every edit or fixed elapsed interval. Document red baseline failures and new regressions separately. Preserve unrelated work; inspect staged paths before commit. Do not push, publish or deploy merely because a commit exists.

## Rollback Notes

Source rollback uses focused revert commits. No branch reset, historical migration rewrite or deletion of original B2 data. Keep earlier image/package revisions until upgrade and restore acceptance pass. A failed rehearsal affects only its explicit disposable target and leaves the real installation untouched.

## Verification evidence

Verified: 2026-10-12 (planning documents only: spec section structure, document references, privacy and whitespace checks; no implementation, deployment or real B2 rehearsal performed).
