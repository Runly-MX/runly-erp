# Website custom domains: connect, DNS and SSL from a Runly instance - design

Date: 2026-11-14
Status: DRAFT for review. Nothing is implemented. Decisions already taken with the owner:
scope = connect owned domains **and edit their DNS through a provider API** (no domain
purchase in v1), and SSL is terminated **on each instance with Caddy**.

## Problem

`runly.website` only serves platform subdomains (`<slug>.sites.runly.mx`). "Dominio propio"
is a disabled card in `SiteDomains.jsx`. Nothing verifies that a customer owns a domain,
nothing creates or checks DNS records, and nothing issues certificates for customer hosts:
an operator does DNS and TLS by hand (`docs/deployment/dns-subdomains.md`). Customers cannot
put their own domain on a site themselves.

## Goals

- A site admin adds `www.mitienda.mx` (or an apex), gets exact DNS instructions, and the
  domain goes live with HTTPS without operator help.
- Optional: connect Cloudflare so Runly creates/updates/removes the needed DNS records.
- Certificates issue and renew automatically on the instance that serves the site.
- Health of every connected domain (HTTP, SSL, domain expiry) is monitored automatically
  through Growth monitors, with the existing alerts.

## Non-goals (v1)

Buying or renewing registrations, other DNS providers (the abstraction allows them later),
wildcard customer certificates, email/MX management, transferring domains between sites
(release then add), apex domains on providers that cannot flatten CNAME (documented, A record
path only).

## Facts this design builds on

- `website_domain` (`hostname` PK, `companyId`, `siteId`, `kind` only `platform`, `state`,
  `ready`, `registry*` columns). A host serves only when `state=assigned` and `ready=true`.
  Rows are append-only; a released name sits in a 90-day quarantine (`website-hostname-service.js`).
- Serving is by `Host` header: `website-gateway-service.js` resolves host -> site; nginx
  (`spa.conf`, `server_name _`) forwards `Host` to the API.
- ZIP/dist content must be served from a registrable domain separate from the ERP
  (`website-content-isolation.js`); customer domains satisfy that by construction but the
  check must be run for them.
- No Caddy for websites today; Caddy only fronts LiveKit in the installer. The main app in
  production sits behind host nginx + Certbot (`DEPLOY_VPS_DEV.md`).

## Design

### 1. Data model (additive migration)

Extend `website_domain` instead of a new table so the gateway keeps one lookup:
`kind` gains `custom`; new nullable columns `verification_token`, `verified_at`,
`dns_target` (what the customer must point to), `cert_state` (`none|pending|issued|failed`),
`cert_checked_at`, `last_error`. New table `website_dns_connection` (`id`, `company_id`,
`provider` = `cloudflare`, `zone_id`, `zone_name`, `token_enc`, `created_at`) holding the
provider credential encrypted with the same helper as Turnstile/SMTP secrets
(`encryptPassword`). The token is never returned by any endpoint or written to logs.

State machine for a custom domain: `pending_dns` -> `verified` -> `serving` (cert issued) ->
`released`. A custom host is never served before `verified` **and** `cert_state=issued`.

### 2. Ownership verification

Per domain a random token; the customer (or Runly through the provider) creates
`TXT _runly-verify.<host>` = token. The API checks with `dns.resolveTxt` against public
resolvers (queries only, no SSRF surface). Hijack protection: a hostname can be claimed by
one company at a time; claiming a host already `serving` for another company is refused
until the first releases it, and a host cannot be claimed if it is a subdomain of
the instance's own domains or the platform namespace.

### 3. DNS records and the provider abstraction

Instructions screen always works without a provider (copy the CNAME/A + TXT records).
`DnsProvider` interface: `listRecords`, `upsertRecord`, `deleteRecord`, `verifyToken`.
First implementation: Cloudflare, token with only `Zone:DNS:Edit` on the chosen zone;
Runly lists zones the token can see, the user picks one, Runly creates the TXT and CNAME/A
and removes them on release. Provider errors are surfaced in Spanish and never include the
token. Records Runly creates are tagged in the record comment so it only edits its own.

### 4. SSL with Caddy on each instance

Caddy uses **on-demand TLS** with an `ask` endpoint: before requesting a certificate it
calls `GET /internal/website/domain-allowed?domain=<host>` on the API; the API answers 200
only for hosts in state `verified`/`serving`. This prevents certificate issuance for
arbitrary hostnames. Caddy reverse-proxies to the API/web with the original `Host`, so the
existing gateway keeps working. The `ask` endpoint is reachable only from the internal
network (shared secret header and source check), rate limited.

Installer: add a `caddy` service (ports 80/443, persistent `/data` for certificates, the
Caddyfile rendered by the installer like `renderManagedCaddyfile` for LiveKit). The
customer's DNS must point the host to this instance's public IP.

**Coexistence risk (decide in the spike):** production today fronts the app with host nginx +
Certbot on 80/443. Options: (a) new installs use Caddy as the only edge (recommended);
(b) existing installs put nginx `stream` with `ssl_preread` in front, sending SNI for known
app domains to nginx and every other SNI to Caddy, with port 80 ACME challenges proxied to
Caddy. Phase 0 proves one of them end to end before any UI is built.

### 5. Serving and isolation

Gateway: a `custom` host resolves like a platform host once `serving`. Run the isolation
checks for dist/ZIP content against the customer host. `www` <-> apex redirect is a per-site
option (`registryRedirectTo` already exists as a column). Releasing a custom domain stops
serving at once, removes provider records Runly created, and keeps the append-only row
(quarantine rules unchanged).

### 6. Monitoring tie-in

When a custom domain becomes `serving`, create Growth monitors for it automatically
(`http`, `ssl`, `domain`; the user can edit them). Cert issuance failures surface in the
domain screen and notify site admins. Renewals are Caddy's; the SSL monitor is the safety net.

### 7. UI (Spanish, `@runly/ui`)

Replace the "Proximamente" card with "Dominio propio": wizard (1) type the domain, (2) see
the exact DNS records with copy buttons, or "Conectar con Cloudflare", (3) "Verificar ahora"
and live status (DNS found, verified, certificate issuing, online) with plain-language
errors. Permission `website.domains.manage` (already exists). Help and `docs/developers`
updated in the same change; the Hub registry docs are not affected.

## Security

Provider token encrypted, scoped, never returned or logged; `ask` endpoint internal-only and
rate limited; claim conflicts refused; TXT verification before any DNS mutation or
certificate; records tagged so Runly edits only what it created; no wildcard issuance;
issuance and verification failures audited (`AuditLog`).

## Testing

Unit: state machine, claim conflicts, TXT verification with injected resolver, `ask` endpoint
decisions, Cloudflare client against recorded fixtures (no live calls in CI), token never in
responses/logs. Integration: disposable stack with Caddy using its internal CA (no Let's
Encrypt) to prove on-demand issuance and `ask` refusal. Manual staging pass with a real
domain and real Let's Encrypt before release (staging endpoint first).

## Phases

0. **Spike (1 week):** Caddy on-demand TLS + `ask` + coexistence with nginx on a staging VPS.
1. **Connect with manual DNS:** model, verification, `ask`, Caddy in the installer, wizard
   without a provider, serving, release, monitors tie-in.
2. **Cloudflare:** connection, zone picker, record management and cleanup.
3. **Polish:** www/apex redirects, bulk status view, cert failure notifications, docs/help.
4. **Later:** other providers (GoDaddy, Route53), domain purchase through a reseller.

## Risks and open questions

- Whether the Developer Hub registry/edge must know about custom hosts (not inspected; this
  design keeps routing local to the instance). Confirm before Phase 1.
- Let's Encrypt rate limits per registered domain when one customer adds many hosts.
- Port 80/443 ownership on existing installs (see Section 4).
- Customers behind Cloudflare proxy ("orange cloud") break HTTP-01; document DNS-only or
  support the Cloudflare origin certificate path later.
- Apex domains need an A record to a stable IP; instances with changing IPs need guidance.
