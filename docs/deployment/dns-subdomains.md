# DNS & subdomains — production checklist

Every production ("external") Runly ERP install needs a small set of DNS records
provisioned *before* running the installer or a reverse proxy step. This page is
the single checklist; the feature-specific docs below go into the reverse proxy
and env var details for each one.

None of these subdomains are optional placeholders — each is read from a real
env var and, where the installer manages TLS itself, the installer will not
finish (or will refuse to start the related service) until the record resolves
and a certificate is issued.

## Checklist

| Purpose | Example | Required when | Points to | Details |
|---|---|---|---|---|
| Main app (web + API) | `erp.tudominio.com` | Always | Runly VPS | [DEPLOY_VPS_DEV.md](../DEPLOY_VPS_DEV.md) — host Nginx proxies `/` to the web container and `/api` (or a dedicated path/port) to the API container |
| Supabase API | `supabase.tudominio.com` | Always | Supabase VPS | Part of the separate self-hosted Supabase stack, not Runly's `docker-compose`; see [05_supabase_prisma_strategy.md](../05_supabase_prisma_strategy.md) |
| Supabase Studio | `studio.supabase.tudominio.com` | Optional — admin use only | Supabase VPS | Never expose without an auth wall or IP allowlist; it is full DB/Storage admin access |
| LiveKit RTC (Runly Calls) | `rtc.tudominio.com` | Only if Calls is enabled with `LIVEKIT_MODE=embedded` | Runly VPS | [infra/installer/README.md § Runly Calls / LiveKit](../../infra/installer/README.md#runly-calls--livekit) — not needed for `LIVEKIT_MODE=external` or `disabled` |
| Collabora Office editor | `office.tudominio.com` | Only if `RUNLY_OFFICE_ENABLED=true` | Runly VPS | [office-collabora.md](office-collabora.md) |

## Env vars that must match each domain

| Domain | Env var(s) |
|---|---|
| Main app | `RUNLY_APP_URL`, `CORS_ORIGIN`, `VITE_RUNLY_API_URL` |
| Supabase API | `SUPABASE_URL`, `VITE_SUPABASE_URL`, `DATABASE_URL` / `DIRECT_URL` host |
| Supabase Studio | `SUPABASE_STUDIO_URL` (reference only — not read by the app at runtime) |
| LiveKit RTC | `LIVEKIT_DOMAIN` (installer derives `LIVEKIT_URL=wss://<domain>` from it) |
| Collabora Office | `COLLABORA_PUBLIC_URL`, `RUNLY_OFFICE_HOST_ORIGIN` (the ERP origin the browser actually uses, not Office's own domain) |

Getting `RUNLY_OFFICE_HOST_ORIGIN` or `LIVEKIT_DOMAIN` wrong is the most common
misconfiguration — they must match what the browser actually loads (`RUNLY_APP_URL`
/ the main app subdomain), not the service's own subdomain.

## Order of operations

1. Create every DNS A record this install needs (per the table above) and let it
   propagate. Point Runly-hosted subdomains at the **Runly VPS** IP; Supabase
   subdomains stay on the **Supabase VPS** IP — these are two separate machines
   in the self-hosted topology described in
   [06_deployment_strategy.md](../06_deployment_strategy.md).
2. Open the required ports on the Runly VPS firewall before starting the
   installer:
   - Main app: `80/tcp`, `443/tcp`
   - LiveKit RTC (embedded mode only): `80/tcp`, `443/tcp`, `443/udp`, `7881/tcp`, `7882/udp`
   - Collabora Office: no extra public port — it rides the main app's `80/443`
     via reverse proxy; `9980` stays loopback-only
3. Only then run `npm run runly:external` (or the manual Certbot/Nginx steps in
   [DEPLOY_VPS_DEV.md](../DEPLOY_VPS_DEV.md)). For `LIVEKIT_MODE=embedded` with
   `LIVEKIT_TLS_MODE=managed`, the installer's Caddy step actively waits for a
   valid certificate on `LIVEKIT_DOMAIN` and will not report the install as
   ready until DNS resolves.

## Not every deployment needs every row

- A dev/staging install with Calls disabled (`LIVEKIT_MODE=disabled`) skips the
  `rtc.*` record entirely.
- Office is disabled by default; skip `office.*` until you deliberately enable
  `RUNLY_OFFICE_ENABLED=true`.
- Supabase Studio is admin tooling — many installs never expose it publicly and
  instead reach it over an SSH tunnel or VPN.

## Customer-owned website domains

Customers can attach their own domain to a site. Runly verifies ownership by DNS but does not issue
certificates: see [custom-domains-https.md](custom-domains-https.md) for the env vars
(`RUNLY_WEBSITE_CUSTOM_DOMAIN_TARGET`, `RUNLY_WEBSITE_CUSTOM_DOMAIN_LIMIT`), the TLS recipes and troubleshooting.
