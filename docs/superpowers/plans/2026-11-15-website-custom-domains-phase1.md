# Website custom domains, phase 1 (connect with manual DNS) - implementation plan

Spec: `docs/superpowers/specs/2026-11-14-website-custom-domains-design.md` (revised 2026-11-15).
Scope of this plan: custom hostnames per site, ownership proof by DNS TXT, serving by `Host`,
informational HTTPS status, release, Growth monitors tie-in, wizard UI, operator guide.
Out of scope: Cloudflare (phase 2), certificates, any reverse proxy.

## Findings that shape the plan

- **The Hub is not involved.** Its registry stores only `<slug>.<namespace>` platform names and
  its edge routes only single-label hosts under served namespaces (404 for anything else).
  Custom hosts are served directly by the installation; nothing in the Hub changes. The Hub
  cannot enforce uniqueness across installations: two installations could both hold the same
  custom host. Mitigation: ownership needs a TXT token issued by *this* installation, and the
  verification also reports whether the host's DNS points at *this* installation.
- **Do not touch `website-hostname-service.js`.** It is built around registry-managed platform
  names (`owned()` filters `registryManaged`, `localNamespaceUsable`...). Custom domains get
  their own service next to it and share only the `website_domain` table.
- **The gateway already serves what we need.** `website-gateway-service.js` serves a host when
  `state='assigned' AND ready AND siteId` and `registryManaged=false` skips the registry
  staleness rule. A verified custom row therefore works with no gateway change; admin hosts
  are already refused, and dist content is checked with `isolation.publicHost`.
- UI today lists rows with `registryManaged` logic (`SiteDomains.jsx`); custom rows need their
  own branch (`kind === 'custom'`).

## Decisions fixed by this plan

- Custom rows use `kind='custom'`, `registryManaged=false`, states `pending` -> `assigned`
  (verified, serving) -> `released`. Row stays append-only.
- A **released** custom host can be claimed again by any company that proves DNS ownership
  (the 90-day quarantine protects brand-sensitive platform slugs, not domains people own).
  A host that is `assigned` for another company is refused with 409.
- Refused hostnames: IP literals, single-label names, the admin/ERP hosts, anything under
  `RUNLY_WEBSITE_NAMESPACE_ROOT`, reserved first labels used for infrastructure
  (`admin`, `api`, `auth`, `mcp`, `internal`), and anything the isolation policy rejects.
- Feature switch: custom domains are offered only when `RUNLY_WEBSITE_CUSTOM_DOMAIN_TARGET`
  is set (the hostname or IP customers point to). Without it the card stays "Proximamente".
- The TXT token is a challenge, not a secret (the customer must publish it); the provider
  credential of phase 2 is the only secret and is out of scope here.

## Tasks

### Task 1 - Schema (additive migration)
- `prisma/schema.prisma` `WebsiteDomain`: add nullable `verificationToken` (`verification_token`),
  `verifiedAt` (`verified_at`, timestamptz), `dnsTarget` (`dns_target`), `httpsState`
  (`https_state`: `unknown|ok|invalid|unreachable`), `httpsCheckedAt`, `lastError`.
- Migration `2027XXXXXXXXXX_website_custom_domains/migration.sql` with `ADD COLUMN IF NOT EXISTS`;
  index on `(kind, state)` for the verification sweep. No change to existing rows.
- Verify: `pnpm db:generate`, `pnpm db:migrate`, existing `website-hostname-local.test.js` still passes.

### Task 2 - Pure helpers and the service
- New `apps/api/src/services/website-custom-domain-service.js` with
  `createWebsiteCustomDomainService({ prisma, adminHosts, namespaceRoot, target, resolveTxt,
  resolveAddresses, probeHttps, now, onVerified })` (all I/O injected; defaults use
  `node:dns/promises` and `createGrowthMonitorProbes().probeSsl`).
- `normalizeCustomHostname(input)`: lowercase, trim, strip scheme/path/port, punycode via
  `URL`, reuse `strictWebsiteHostname`, apply the refusal list above. Errors are
  `WebsiteServiceError` with Spanish messages and stable codes.
- `add({ companyId, siteId, hostname, access })` (needs `website.domains.manage` +
  `website.site.update`, site must be enabled): create `pending` row with a 32-byte
  base64url token; same company+site returns the existing row; released row is reclaimed
  (new token, `verifiedAt` null); `assigned` for someone else -> `hostname_taken` 409;
  per-company cap (default 25 custom hosts, env override) to bound abuse.
- `verify(...)`: `resolveTxt('_runly-verify.' + host)` must contain the token -> set
  `state='assigned', ready=true, verifiedAt=now`, clear `lastError`, call `onVerified`
  (best effort). Otherwise store `lastError` ("No encontramos el registro TXT...") and
  return the same view with `verified:false`. Always also compute `pointsHere` by resolving
  the host's A/AAAA/CNAME against the configured target (advisory, never blocking).
  Throttle: one verification per host per 10 s.
- `checkHttps(...)`: only for `assigned` rows; run the SSL probe on `host:443`, map to
  `https_state`, store `httpsCheckedAt`; throttle 1 per minute per host. Messages in Spanish.
- `release(...)`: `state='released', ready=false, verificationToken=null`; row kept.
- `list/status` view: `{ hostname, kind, state, ready, verified, httpsState, dnsRecords: [
  { type:'TXT', name:'_runly-verify.<host>', value:<token> }, { type:'CNAME'|'A', name:<host>,
  value:<target> } ], pointsHere, lastError }`. The TXT token is shown only while `pending`.
- Tests (`__tests__/website-custom-domain.test.js`, fake prisma + injected resolvers): refusal
  list, claim conflicts, reclaim after release, token match/mismatch, throttle, https mapping,
  cap, no serving before verify (`ready=false`).

### Task 3 - Routes
- In `routes/website/releases-routes.js` (or a sibling `custom-domains-routes.js` mounted by the
  same router factory): `POST /sites/:siteId/custom-domains`,
  `GET /sites/:siteId/custom-domains/:hostname`, `POST .../verify`, `POST .../check-https`,
  `POST .../release`. Permission `website.domains.manage` (read: `website.site.read`);
  reuse `args(c)` and the error handler. Validate bodies with Zod.
- `gateway.domains()` select adds `verifiedAt, httpsState, lastError` so the existing list
  endpoint feeds the UI; custom rows never expose the token there (status endpoint only).
- Wire the service where `createWebsiteHostnameService` is instantiated; pass
  `adminHosts`, `namespaceRoot`, `target`.

### Task 4 - Gateway and isolation tests
- Extend the gateway tests: a verified custom host resolves; `pending` and `released` hosts
  answer not-found; an admin host cannot be claimed; a dist release on a custom host passes
  `isolation.publicHost` only for allowed hosts. No gateway code change expected; if a test
  fails, fix the gateway, not the test.

### Task 5 - Growth monitors tie-in
- `onVerified({ companyId, siteId, hostname })`: if `runly.growth` has a property for that
  site (`GrowthProperty.websiteSiteId`), create `http`, `ssl` and `domain` monitors for the
  host through the existing Growth monitor service (idempotent by type+host). Skips silently
  when Growth is not installed or no property exists. Test with a fake service.

### Task 6 - SDK and client
- `packages/sdk/src/domains/website.js` and `apps/desktop/.../lib/websiteApi.js`:
  `addCustomDomain`, `customDomainStatus`, `verifyCustomDomain`, `checkCustomDomainHttps`,
  `releaseCustomDomain`. Query key `websiteKeys.customDomain`.

### Task 7 - UI (Spanish, `@runly/ui`, files under 800 lines)
- Replace the "Proximamente" panel in `SiteDomains.jsx` with `CustomDomainPanel.jsx`
  (when the feature is configured; capability flag from the site state/contracts). Rows with
  `kind==='custom'` render in the address list with status pills: "Pendiente de DNS",
  "Verificado", "HTTPS listo", "HTTPS sin configurar".
- `AddCustomDomainDialog.jsx`: step 1 type the domain; step 2 the DNS records with a copy
  button per value and a short explanation; "Verificar ahora"; step 3 result with plain-
  language errors and, once verified, the HTTPS status and what to ask the operator.
- `ConfirmDialog` for release. Never claim HTTPS while `httpsState !== 'ok'`.
- Run the UI audit checklist; verify in the real browser (Playwright) on desktop and phone.

### Task 8 - Docs
- `docs/deployment/custom-domains-https.md`: the three operator recipes (nginx + Certbot,
  existing ACME proxy, Cloudflare proxy), the env var, expected DNS, troubleshooting.
- Website help (`manifests/official/help/runly.website/views/dominios.md`) for end users;
  run `node scripts/sync-help-content.mjs` in `../runly-web` and commit there.
- Update the spec: released custom hosts are reclaimable; refusal list; Hub conclusion.

### Task 9 - Verification and rollout
- `pnpm lint`, targeted `node --test`, `pnpm build:web`, the E2E on the test company
  (add -> pending with records -> verify fails clearly -> release -> re-add), and a manual
  staging pass with a real domain (TXT + CNAME + the operator's certificate) before release.
- Rollout: apply the migration on each VPS, set `RUNLY_WEBSITE_CUSTOM_DOMAIN_TARGET`, run the
  seed/sync so help and nav refresh; Claude does not deploy.

## Order and size
Tasks 1-4 are the backend (one block, testable alone); 5-6 are small; 7 is the largest;
8-9 close it. Commit after each verified block, no AI attribution lines.

## Risks to watch while implementing
- TXT lookup caching/propagation delays: the UI must say "puede tardar unos minutos".
- A malicious tenant adding many hosts: the per-company cap and the throttles.
- Operators without TLS will see `HTTPS sin configurar`; the copy must point to the guide.
