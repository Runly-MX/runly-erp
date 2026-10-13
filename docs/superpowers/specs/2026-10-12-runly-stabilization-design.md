# Runly stabilization and operational acceptance

Date: 2026-10-12
Status: In Progress
Spec file: docs/superpowers/specs/2026-10-12-runly-stabilization-design.md
Plan file: docs/superpowers/plans/2026-10-12-runly-stabilization.md

## 1. Feature title

Runly stabilization: recoverability, isolation, delivery and acceptance.

## 2. Status

In Progress. The user requested written planning and incremental commits, then confirmed continuation on 2026-10-12. The B2 workstream's safe source implementation is underway; operational targets/credentials and other child workstreams remain open. This is not deployment or acceptance of an unseen specification.

## 3. Context

Baseline: `docs/architecture/2026-10-12-foda-runly-erp.md`, audit of revision `3cc50234`. The current workspace also includes subsequent Windows installer/device work; preserve it and refresh affected findings before changing code. The FODA is already committed. Existing specifications remain historical evidence and must be reconciled with subsequent work rather than automatically reopened.

## 4. Problem

Runly's functionality, package distribution and platform integrations have advanced faster than reproducible recovery, regression gates and acceptance evidence. Existing backup scripts can report incomplete Storage copies as successful; the SDK can return stale company data after body consumption; suites reveal contract drift. Published shared packages and local workspace packages need consistent consumption tests.

## 5. Goals

1. Recover an installation from B2 in an isolated target with measured data age and recovery time.
2. Correct confirmed SDK, identity and React regressions with focused tests.
3. Classify every baseline failing test and dependency alert; establish a reproducible regression gate.
4. Verify workspace and distributed shared packages against the same public contracts.
5. Identify versions and acceptance evidence for each release and critical business journey.
6. Reconcile backlog status and assign accountable owners for operational evidence.

## 6. Non-goals

No global rewrite, unsolicited deployment/publication, production restore/reset, persisted Atlas identity migration, wholesale registry migration, new ERP module, fiscal certification or blanket dependency upgrade. Planning commits do not authorize actions against a real installation. Changes requiring live targets are scheduled only after their target and scope are identified.

## 7. User stories

- As an operator, I can rebuild a damaged installation using independently held recovery material.
- As a user, switching companies prevents an old response from updating my current context.
- As a maintainer, I can determine exactly what passed before a release.
- As an external package consumer, I can install a reviewed version without the ERP source tree.
- As a product owner, I can distinguish implementation from deployment and operational acceptance.

## 8. UX requirements

Preserve current flows while correcting defects. Operational messages are Spanish and identify the failing stage without exposing credentials. React changes use existing @runly/ui components. No new administration interface is specified here.

## 9. Routes/screens

No new route or screen at program level. Existing external-chat visitor panel and acceptance journeys are reviewed by focused workstreams. New routes require a child specification.

## 10. Data model

No program-level application model changes. Recovery metadata is an operational file contract defined by the B2 child spec. Queue/proposal persistence changes require a separate approved schema design.

## 11. Prisma impact

New/modified models: N/A. New migration required: No at planning level. Never edit applied migrations or repair their history manually. Installation/restore tests use disposable databases and distinguish PostgreSQL 18 migration tests from the actual Supabase major version being recovered.

## 12. API contract

Preserve existing APIs. Readiness/operational telemetry changes require a focused spec defining dependencies, timeout, exposure and response codes. SDK corrections do not change successful business payload shapes.

## 13. SDK contract

All SDK JSON/blob transports must reject successful responses whose original company is no longer current after body consumption, using existing `company_changed`/409 semantics. Audit explicit-company calls and offline queue behavior before extending rejection rules. No heuristic reassignment of historical offline mutations.

## 14. Validator contract

No new shared Zod schema. Conditional-layout nullability changes are first classified against intended semantics; a failing regex is not authority to alter business validation.

## 15. Module manifest impact

Reconcile official manifest keys with the explicit identity catalog, including `runly.attendance`. Preserve legacy aliases and stored keys. No new module or new permission is introduced by this program.

## 16. Navigation impact

Preserve intended current navigation. Growth contract expectations must be reconciled with current approved behavior, not reverted merely to pass a test.

## 17. Blueprint impact

N/A at program level. Any behavioral compiler/renderer fix needs its own focused contract tests and scope review.

## 18. RBAC/permissions

Preserve existing guards. Verify negative company/resource cases, revocation and grants in disposable integration tests, then selected real-service acceptance. Record skipped security suites explicitly. No broad bypass or wildcard exception to make a guardrail pass.

## 19. Multi-company behavior

Distinguish backend authorization, browser context freshness and isolation of privileged extensions. Existing SQL isolation passes are retained as evidence, not treated as sufficient HTTP/Storage/Realtime acceptance. Modules receive privileged server context today; the trust policy must state whether authors are trusted before expanding third-party install access.

## 20. Files/storage impact

Recovery must cover required DB, Storage buckets, instance-local module sources and configuration. New complete snapshots must distinguish coverage from repository integrity. Historical snapshots remain recoverable with explicit unknown/missing coverage. See B2 child spec.

## 21. Export/import requirements

Operational evidence/manifests only. No new PDF/XLSX business export. Private recovery inventories/logs stay outside tracked files; repository evidence contains commands, sanitized results and dates.

## 22. Audit log requirements

Planning/CI changes require no application AuditLog entries. MirAI execution recovery must separately specify idempotency, reconciliation and observable audit failure; no silent success when an audit obligation cannot be fulfilled.

## 23. Edge cases

1. The source tree, installed dependencies or deployed images differ from the audit baseline.
2. A test is obsolete while another exposes a real contract regression.
3. A backup decrypts correctly but lacks a bucket or module source.
4. A response's headers arrive before a company switch and its body arrives afterward.
5. A package packs successfully but cannot be used outside workspace resolution.
6. A release rolls back an image while a forward migration remains applied.
7. Hardware, external services or secrets are unavailable for acceptance.

## 24. Risks

- Expanding scope prevents closure: separate commits and child specs; do not attach unrelated UI work.
- Repeating implementation from stale docs: confirm current code and history before opening tasks.
- Damaging an installation during recovery: isolated target and explicit cutover plan; preserve source evidence.
- Leaking operational data: private logs/config, fixtures with example domains and privacy gate before commits.
- Registry migration introduces version skew: retain workspace development and exact registry versions for independent consumers.
- Green checks hide omitted scope: list skips, test harness limitations, source version and operational blockers.

## 25. Acceptance criteria

1. A chosen B2 snapshot restores an isolated installation; known data/files/modules and user login work; missing coverage is explicitly reported.
2. The delayed SDK JSON-body company-switch test passes, as do request, multipart, blob and unchanged-company regressions.
3. Identity catalogs cover all official keys without inventing Atlas counterparts for current-only modules.
4. Baseline suites have no unclassified failures; accepted exceptions have owner, reason and review date.
5. CI executes required regression/build/privacy gates and reports optional integration skips separately.
6. Six shared packages are consumable using public exports and exact approved versions without sibling source access.
7. Selected web/native business journeys have evidence attached to identifiable release artifacts.
8. Every workstream has a named accountable owner before operational execution; unknown assignments are open tasks, not implicit completion.

## 26. Verification plan

Focused `node --test`, bounded API/shared suite commands, `pnpm test:isolation:fresh`, desktop build, privacy and permission/schema checks. Recovery and registry contracts use disposable targets. Hardware and real services use a separate acceptance matrix with private configuration. Secret scanning requires Gitleaks; missing tooling is a failure of that gate, not a clean scan.

## 27. Rollback plan

Use focused revert commits for source changes; do not reset unrelated work. Preserve restore targets and evidence until reviewed. Switching back to an older image is allowed only after checking schema compatibility. Schema changes require a forward recovery migration or the approved full-restore procedure. No automatic production rollback.

## 28. Future enhancements

Untrusted-module process isolation, point-in-time DB/Storage consistency, proposal leases/idempotency, observability/readiness, signed release manifests and cross-module reporting are tracked in the program plan; substantial changes receive separate specs. Do not promise dates before capacity, required hardware and target environments are confirmed.
