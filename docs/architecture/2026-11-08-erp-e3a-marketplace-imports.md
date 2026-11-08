# ERP E3a — Real Marketplace imports (Studio template, automation)

Status: implemented and verified 2026-11-08 (no UI, no deploy, no productive keys).
Builds on E2 (`2026-11-09-erp-e2-resource-catalog-consumer.md`) and E1b (shared validators).

## What it does

A person can import, from the Marketplace resource feed, **one Studio template** or **one automation**.
In both cases the Runly server downloads and verifies the package itself, inspects it, and creates
nothing until the person confirms explicitly. An imported automation is **always paused**.

- The request only names the exact release: `{ resourceKey, version, releaseId, acknowledgeStale? }`.
  Bytes never come from the browser, an arbitrary URL or Hub storage: only from
  `createResourceCatalogService().downloadPackage()` (feed-relative URL, size bound by type,
  SHA-256 and size checked), then re-checked against the release (`releaseId`, `sha256`, `size`).
- Eligibility (trust, compatibility, withdrawal, revocation, freshness) is the E2 verdict. A stale
  feed needs `acknowledgeStale: true`; an expired one never imports.
- Before creating anything, the confirm step re-reads the feed (forced refresh) and re-checks the
  same release. Withdrawn/revoked/untrusted after the preparation: the preparation is discarded
  (staged Studio files compensated; automation preparation cancelled) and nothing is created.
- Actor and company come from the existing auth (`userContext.profile.id`, `companyId`).

Code: `apps/api/src/services/marketplace/marketplace-import-gate.js` (the only door to the feed),
`apps/api/src/services/marketplace/automation-import-service.js`, Studio changes in
`apps/api/src/routes/studio/interchange/{service,router}.js`, routes in `routes/automations-routes.js`.
Wiring: one `createResourceCatalogService({ prisma })` + gate in `apps/api/src/index.js`, default trust
(no resource key is pinned in this build, so production imports nothing until a key is pinned).

## Studio template

Reuses the existing interchange engine (`inspect → prepare → confirm`, staging, quotas, compensation).

| | Route (all require `studio.view` and header `X-Runly-Studio-Protocol: 3` on POST) | SDK (`client.studio`) |
|---|---|---|
| Query | `GET /studio/interchange/marketplace/resources?q=&acknowledgeStale=` | `marketplaceTemplates(params, token)` |
| Inspect | `POST /studio/interchange/marketplace/inspect` `{resourceKey,version,releaseId,acknowledgeStale?}` | `inspectMarketplaceTemplate(ref, token)` |
| Prepare | `POST /studio/interchange/marketplace/imports` `{...ref, target: 'design'\|'personal'\|'company', name?}` | `prepareMarketplaceTemplateImport(data, token)` |
| Status / asset preview / cancel | existing `/studio/interchange/imports/:id...` | existing methods |
| Confirm | existing `POST /studio/interchange/imports/:id/confirm` `{digest, acceptWarnings}` | `confirmPackageImport` |

Responses:
- Query: `{ data: { catalog: { sequence, freshness, installable, requiresAcknowledgement, reason, ... }, items: [E2 resource description] } }`.
- Inspect: `{ data: { resource, source, diagnostics: { ok, errors[{code,message,path}], warnings, licenses, fonts, personalData, losses }, package: <same report as a local .runlystudio inspect: pages, resources, fonts, warnings, preview, blockingErrors> } }`. Saves nothing.
- Prepare: the existing job report plus `source` and `diagnostics` (201). Blocked package (unknown font,
  forbidden license, format error): `422 { code: 'STUDIO_PACKAGE_BLOCKED', details: { diagnostics } }`.

Permissions: `studio.view`; target permission checked **before** downloading (`studio.create` design,
`studio.templates.manage` personal, `studio.templates.publish` company); `files.assets.create` when the
package has images. Always a new copy; existing designs/templates are never overwritten.
Provenance: `studio_interchange_job.source` = `{ kind:'marketplace', type, resourceKey, version, releaseId,
sha256, size, title, license, publisher, publisherVerified, catalogSequence, acknowledgedStale, importedBy,
companyId, downloadedAt }`, also returned in the job report.

## Automation

Flow: Inspect → risk report → consent → confirm → paused automation. Routes require `automations.manage`.

| | Route | SDK (`client.modules`) |
|---|---|---|
| Query | `GET /automations/marketplace/resources?q=&acknowledgeStale=` | `marketplaceAutomations(params, token)` |
| Inspect | `POST /automations/marketplace/inspect` `{...ref}` | `inspectMarketplaceAutomation(ref, token)` |
| Prepare | `POST /automations/marketplace/imports` `{...ref}` → 201 | `prepareMarketplaceAutomationImport(ref, token)` |
| Status | `GET /automations/marketplace/imports/:id` | `marketplaceAutomationImport(id, token)` |
| Confirm | `POST /automations/marketplace/imports/:id/confirm` `{definitionDigest, services[], acceptRisks: true, key?}` → 201 | `confirmMarketplaceAutomationImport(id, consent, token)` |
| Cancel | `DELETE /automations/marketplace/imports/:id` | `cancelMarketplaceAutomationImport(id, token)` |

Inspect: `{ resource, source, blocked, report, definition, definitionDigest }`; saves nothing.
Prepare/status: `{ id, state, expiresAt, source, report, definition, definitionDigest, services,
consentRequired: { definitionDigest, services, acceptRisks: true }, result?, consent? }`.
`report` = `{ label, trigger, stepCount, services, httpHosts, errors[], needsConfiguration[], notes[],
removed{people,externalEmails,chatChannels,fileIds,contactIds,templateIds,recordIds}, fileRisk (what the
published file asked for, E1b riskSummary), importsPaused: true }`.
Confirm result: `{ id, key, label, enabled: false, grantedServices, provenance }`.

Rules:
- Cleaning is the E1b default (people, external emails, chat channels, file/contact/template/record ids are
  removed **before** anything is stored). Steps left incomplete are `needsConfiguration` (allowed; the
  automation stays paused until someone completes and activates it).
- Blocking (`422 AUTOMATION_IMPORT_BLOCKED`, `details.report.errors`): unreadable/newer file, unknown
  service, invalid definition, HTTP host not in the instance allowlist (`AUTOMATION_HTTP_HOST_NOT_ALLOWED`).
  Re-checked at confirm (`409`), since the allowlist can change.
- Consent is bound to the cleaned definition digest (canonical JSON SHA-256), the exact service list, the
  actor and the company (another actor or company gets 404). Different digest → `AUTOMATION_IMPORT_DIGEST_MISMATCH`;
  different list → `AUTOMATION_IMPORT_CONSENT_MISMATCH`.
- Confirm does NOT use `system-automations-service.save()` (which grants every service in use). One transaction
  creates the automation with `enabled:false`, `webhookToken:null`, `createdById` = confirming actor, a key
  generated in the destination (`<slug>_<6 hex>`, or the requested free `key`), grants only the consented
  services to `system.automations` for that company, writes `audit_log` (`automation.marketplace.imported`,
  metadata: release, sha256, publisher, catalog sequence, consent) and commits the import row. Any failure
  rolls back everything. Existing key → `409 AUTOMATION_KEY_TAKEN`; never overwrites. Repeat confirm returns
  the same result.
- Nothing runs: no trigger, action, HTTP call, test, schedule, listener or webhook token. The webhook URL is
  created when someone activates it through the normal editor (`PUT /automations/:key`), which is also the
  consent path for any later change.

## Persistence

Migration `prisma/migrations/20261229100000_marketplace_imports`: `studio_interchange_job.source jsonb`
and raw table `marketplace_automation_import` (prepared/committed/cancelled, cleaned definition + digest,
services, report, consent, result, 30-minute expiry; committed ⇔ result + consent + confirmed_at; RLS on,
no grants to `anon`/`authenticated`). No Prisma models (raw SQL like the interchange job). At most 5 pending
automation preparations per actor and company.

Error shape (both routers): `{ error, code, details? }`. Catalog codes from E2 (`RESOURCE_REVOKED`,
`RESOURCE_WITHDRAWN`, `RESOURCE_KEY_UNTRUSTED`, `RESOURCE_RUNLY_VERSION`, `RESOURCE_FORMAT_UNSUPPORTED`,
`RESOURCE_FEED_EXPIRED`, `RESOURCE_ACKNOWLEDGEMENT_REQUIRED`, `RESOURCE_PACKAGE_MISMATCH` 502,
`RESOURCE_FEED_NOT_CONFIGURED`/`RESOURCE_FEED_UNAVAILABLE` 503, `RESOURCE_NOT_FOUND` 404) plus
`MARKETPLACE_RELEASE_MISMATCH` and `MARKETPLACE_TYPE_MISMATCH` (409).

## Verification

`node scripts/verify-marketplace-imports.mjs` (disposable Supabase: real PostgreSQL, Auth, private Storage,
this tree's migrations + seed; never `.env`). Feed: the real H4 lab export captured in
`scripts/fixtures/marketplace/h4-lab` (seq 2 published; seq 4 with the Studio release withdrawn and the
automation revoked; signed with a lab TEST key) plus negative snapshots re-signed with the public
test-vector key. Both keys are injected as trust in the test only. Verified 2026-11-08: 11/11 checks
(valid imports, two companies/actors, permissions, quota, Storage interruption + recovery, unknown font,
forbidden license, wrong digest, double confirm, withdrawal/revocation after prepare, rollback, expiry,
untrusted key, altered bytes, incompatible version, consent mismatch, external recipients and people removed,
forbidden HTTP host, >200 KiB file, newer file version, existing key, no runs/jobs/schedules, grants only on
consent, local key revocation persisted across restart). Unit: `apps/api/src/services/marketplace/__tests__`.

## Risks and dependencies

- Production imports nothing until a resource public key is pinned (`catalog-resource-public-key.js`) and
  `catalog.resources.url` is configured; both are out of E3a.
- HTTP step bodies are copied as published (they cannot carry headers); a publisher could embed a literal token
  in a body. It is visible in the report's `definition` before consent, and the host must already be allowlisted.
- Grants given at confirm persist like any saved automation's grants; deleting the automation removes them via
  the existing `syncGrants`.
- The feed refresh is triggered by imports (lookup older than 1 h, forced at confirm); there is no scheduled refresh yet.
- UI (Claude) consumes the contracts above; no navigation or visual Marketplace was added.
