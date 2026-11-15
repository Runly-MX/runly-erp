# Website custom domains: connect and DNS from a Runly instance - design

Date: 2026-11-14 (revised 2026-11-15)
Status: DRAFT for review. Nothing is implemented. Decisions taken with the owner:
scope = connect owned domains **and edit their DNS through a provider API** (no domain
purchase in v1), and **SSL is not provided by Runly**: whoever operates each instance
terminates TLS for the custom hostnames. Runly will not ship Caddy or issue certificates
for now.

## Problem

`runly.website` only serves platform subdomains (`<slug>.sites.runly.mx`). "Dominio propio"
is a disabled card in `SiteDomains.jsx`. Nothing verifies that a customer owns a domain and
nothing creates or checks DNS records; an operator does it by hand
(`docs/deployment/dns-subdomains.md`). Customers cannot attach their own domain to a site.

## Goals

- A site admin adds `www.mitienda.mx` (or an apex), gets exact DNS instructions, proves
  ownership, and the instance serves the site for that `Host`.
- Optional: connect Cloudflare so Runly creates, updates and removes the needed DNS records.
- Show the operator-facing state of HTTPS (is a valid certificate answering for this host?)
  using the existing Growth SSL check, without issuing anything.
- Health of every connected domain (HTTP, SSL, domain expiry) monitored automatically by
  Growth monitors, with the existing alerts.

## Non-goals (v1)

Issuing or renewing certificates, shipping a reverse proxy or ACME client, buying or
renewing registrations, other DNS providers (the abstraction allows them later), wildcard
hosts, email/MX management, moving a domain between sites (release then add), apex domains
on providers that cannot flatten CNAME (documented; A record path only).

## Facts this design builds on

- `website_domain` (`hostname` PK, `companyId`, `siteId`, `kind` only `platform`, `state`,
  `ready`, `registry*` columns). A host serves only when `state=assigned` and `ready=true`.
  Rows are append-only; a released name sits in a 90-day quarantine (`website-hostname-service.js`).
- Serving is by `Host` header: `website-gateway-service.js` resolves host -> site; nginx
  (`spa.conf`, `server_name _`) forwards `Host` to the API.
- ZIP/dist content must be served from a registrable domain separate from the ERP
  (`website-content-isolation.js`); the check must be run for customer hosts too.
- Production fronts the app with host nginx + Certbot (`DEPLOY_VPS_DEV.md`). Runly does not
  change that in this feature.

## Design

### 1. Data model (additive migration)

Extend `website_domain` so the gateway keeps one lookup: `kind` gains `custom`; new nullable
columns `verification_token`, `verified_at`, `dns_target` (what the customer must point to),
`https_state` (`unknown|ok|invalid|unreachable`, informational), `https_checked_at`,
`last_error`. New table `website_dns_connection` (`id`, `company_id`, `provider` =
`cloudflare`, `zone_id`, `zone_name`, `token_enc`, `created_at`) with the provider credential
encrypted by the same helper as Turnstile/SMTP secrets (`encryptPassword`); never returned
by any endpoint and never logged.

State machine of a custom domain: `pending_dns` -> `verified` (serving) -> `released`.
A custom host is served once ownership is verified. Certificates are the operator's concern,
so serving does not wait for HTTPS; `https_state` only informs.

### 2. Ownership verification

Per domain a random token; the customer (or Runly through the provider) creates
`TXT _runly-verify.<host>` = token. The API checks with `dns.resolveTxt` (DNS queries only,
no SSRF surface). Hijack protection: one company at a time per hostname; claiming a host
already serving for another company is refused until released; hosts under the instance's own
domains or the platform namespace cannot be claimed.

### 3. DNS records and the provider abstraction

The instructions screen always works without a provider (records to copy). `DnsProvider`
interface: `listRecords`, `upsertRecord`, `deleteRecord`, `verifyToken`. First implementation:
Cloudflare with a token limited to `Zone:DNS:Edit` on the chosen zone; Runly lists the zones
the token can see, the user picks one, Runly creates the TXT and the CNAME/A and removes them
on release. Errors are shown in Spanish and never include the token. Records created by
Runly are tagged in the record comment so Runly only edits its own.

### 4. HTTPS is the operator's job (documented, not shipped)

The domain screen tells the customer what it needs: the host must reach this instance's
public IP/target and the operator must have TLS for it. A new operator guide
(`docs/deployment/custom-domains-https.md`, also in `docs/developers` only if it affects
Builder users) gives three recipes: (a) nginx + Certbot per host (HTTP-01), (b) any ACME
proxy the operator already runs (Caddy, Traefik), (c) Cloudflare proxy in front of the
origin. The domain screen runs the existing SSL probe on `https://<host>` after
verification and shows `https_state` in plain language ("el certificado esta listo",
"no responde por HTTPS: configura el certificado en tu servidor").
No `ask`/allow-list endpoint is built now; if an operator later wants on-demand TLS it can be
added as a small internal endpoint without changing this model.

### 5. Serving and isolation

Gateway: a verified `custom` host resolves like a platform host. Isolation checks for
dist/ZIP content run against the customer host. `www` <-> apex redirect is a per-site option
(`registryRedirectTo` already exists). Releasing a custom domain stops serving at once,
removes provider records Runly created, and keeps the append-only row (quarantine unchanged).

### 6. Monitoring tie-in

When a custom domain is verified, Growth monitors (`http`, `ssl`, `domain`) are created for
it automatically (editable by the user). A failing SSL or HTTP monitor is how a missing
certificate shows up to the customer, with the alerts already built.

### 7. UI (Spanish, `@runly/ui`)

Replace the "Proximamente" card with "Dominio propio": wizard (1) type the domain, (2) see the
exact DNS records with copy buttons, or "Conectar con Cloudflare", (3) "Verificar ahora" and
live status (DNS found, verified, HTTPS ok or pending) with plain errors. Permission
`website.domains.manage` (exists). Help and `docs/developers` updated in the same change.

## Security

Provider token encrypted, scoped, never returned or logged; claim conflicts refused; TXT
verification before any DNS mutation or serving; records tagged so Runly edits only what it
created; verification and provider failures audited (`AuditLog`); probes of customer hosts use
the existing SSRF-guarded fetcher.

## Testing

Unit: state machine, claim conflicts, TXT verification with an injected resolver, Cloudflare
client against recorded fixtures (no live calls in CI), token never in responses or logs,
`https_state` mapping. Integration: gateway serves a verified custom host and refuses an
unverified one. Manual staging pass with a real domain and Cloudflare account before release.

## Phases

1. **Connect with manual DNS:** model, verification, gateway serving, release, https status,
   monitors tie-in, wizard without a provider, operator HTTPS guide.
2. **Cloudflare:** connection, zone picker, record management and cleanup.
3. **Polish:** www/apex redirects, bulk status view, help and developer docs.
4. **Later:** other providers (GoDaddy, Route53), on-demand TLS endpoint, domain purchase.

(The earlier Caddy spike is gone: nothing in the instance depends on who owns ports 80/443.)

## Risks and open questions

- Whether the Developer Hub registry/edge must know about custom hosts (not inspected). This
  design keeps routing local to the instance; confirm before Phase 1.
- Without Runly-provided SSL, support load shifts to operators: the guide and the clear
  `https_state` messages are the mitigation.
- Customers behind the Cloudflare proxy hit a different path for certificates; document it.
- Apex domains need an A record to a stable IP; instances with changing IPs need guidance.
