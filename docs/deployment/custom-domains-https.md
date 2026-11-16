# Customer-owned domains and HTTPS (operator guide)

Runly lets a site admin attach their own domain (for example `www.mitienda.mx`) to a website:
they add it in **Sitio web > Dominios > Dominio propio**, create the DNS records the screen
shows, and press **Verificar ahora**. Runly then serves that site for requests whose `Host` is
the domain.

**Runly does not issue or renew certificates and does not ship a reverse proxy.** Whoever
operates the installation terminates TLS for each customer hostname. This page explains what to
set up and how to troubleshoot it. Design: `docs/superpowers/specs/2026-11-14-website-custom-domains-design.md`.

## 1. Turn the feature on

| Variable | Meaning |
|---|---|
| `RUNLY_WEBSITE_CUSTOM_DOMAIN_TARGET` | What customers point their domain at: a hostname (`sites.tudominio.com`, shown as a CNAME) or the public IP of the installation (shown as an A/AAAA record). **Unset = feature off**: the panel says "No habilitado" and the API answers `custom_domains_unavailable`. |
| `RUNLY_WEBSITE_CUSTOM_DOMAIN_LIMIT` | Maximum active custom domains per company. Default `25`. |

Restart the API after changing them. Apply the database migrations first
(`20270105000000_website_custom_domains`, `20270105100000_website_domain_kind_custom`,
`20270105200000_website_domain_guard_custom`).

The target hostname must resolve to the server that receives web traffic for customer hosts,
the same place that already serves your platform subdomains (`<slug>.<RUNLY_WEBSITE_NAMESPACE_ROOT>`).
A bare domain (`mitienda.mx`, no `www`) cannot use a CNAME: customers need ALIAS/ANAME at their DNS
provider, or an A record with your IP (set the target to an IP if most customers hit this).

## 2. What the customer does in DNS

The screen shows exact values with copy buttons:

1. `TXT  _runly-verify.<domain>  =  <token>`: proves ownership. The token is issued by this
   installation and disappears once verified.
2. `CNAME <domain> -> <target>` (or `A`/`AAAA`, or `ALIAS` for a bare domain): sends traffic here.

Many DNS panels append the zone automatically: for `www.mitienda.mx` they usually want the host
`_runly-verify.www`, not the full name. DNS changes can take minutes (sometimes hours).

## 3. What you do: TLS and routing for the hostname

Requests for a custom host must reach the **same upstream that serves your platform subdomains**
with the original `Host` header preserved. The gateway resolves the site from `Host`; it refuses
the ERP's own hosts and anything that is not a verified, assigned domain. Pick one recipe.

### Automatic (recommended): `website-domains.mjs` on a server with nginx + Certbot

The installer ships `website-domains.mjs` next to `update-local.sh` / `update-external.sh`. It edits
the **server's** nginx (`/etc/nginx/conf.d`), never the web container's. Requirements on the server:
`nginx`, `certbot` and the running Runly containers. Run it as root from the installer directory:

```bash
sudo node website-domains.mjs setup
```

Once per instance it:

- writes `00-runly-acme.conf`: port 80 `default_server` that serves Let's Encrypt challenges from
  `/var/www/runly-acme` and redirects everything else to HTTPS. Ubuntu's stock site (the
  "Welcome to nginx!" page) is disabled, with a copy in `/etc/nginx/runly-backup/`;
- writes the `*.<RUNLY_WEBSITE_NAMESPACE_ROOT>` block when its wildcard certificate exists in
  `/etc/letsencrypt/live/<root>/` (or `--sites-cert=<dir>`) and no nginx file serves it yet. The wildcard
  certificate itself needs a DNS-01 challenge and is not issued by the script;
- installs `runly-website-domains-<prefix>.timer`, which runs `sync` every 5 minutes.

`sync` asks the API container which customer domains are verified (read-only
`apps/api/scripts/website-tls-domains.mjs`, hostnames only), requests a certificate with HTTP-01 for
each new one, writes `runly-site-<prefix>--<host>.conf`, and removes the blocks of released domains
(certificates are kept). Hostnames are validated before they reach any file or command, a failed
certificate is retried after an hour (Let's Encrypt limits failed validations), and every change is
rolled back if `nginx -t` rejects it. `sudo node website-domains.mjs status` lists each domain with its
certificate and nginx state. Several instances on one server keep separate files and timers.

Optional variables in the instance `.env`: `RUNLY_WEBSITE_TLS_EMAIL` (Let's Encrypt notices) and
`RUNLY_WEBSITE_TLS_UPSTREAM` (default `http://127.0.0.1:<RUNLY_WEB_HOST_PORT>`, the web container).

### A. nginx + Certbot by hand (one host at a time)

Copy your existing server block for `*.sites.<zone>`, change the name and certificate paths:

```nginx
server {
    listen 443 ssl;
    server_name www.mitienda.mx;
    ssl_certificate     /etc/letsencrypt/live/www.mitienda.mx/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.mitienda.mx/privkey.pem;
    # ... same locations/proxy_pass/proxy_set_header Host as your platform-subdomain block ...
}
```

Issue the certificate once DNS points to the server: `certbot certonly --nginx -d www.mitienda.mx`
(HTTP-01 needs port 80 reachable for that name). Certbot's timer renews it.

### B. An ACME proxy you already run (Caddy, Traefik)

Add a site entry per customer host that proxies to the same upstream; the proxy obtains and renews
the certificate by itself, for example in Caddy:

```
www.mitienda.mx {
    reverse_proxy <same upstream as your platform subdomains>
}
```

On-demand TLS (issue for any host automatically) is intentionally not provided by Runly. If you
want it, you must restrict it yourself (for example with Caddy's `ask`) so strangers cannot make
you request certificates for arbitrary names.

### C. Cloudflare in front

If the customer's zone is on Cloudflare with the proxy (orange cloud) on, Cloudflare terminates TLS
for visitors. Keep the `_runly-verify` TXT record **DNS only**. The origin leg needs your decision:
**Full (strict)** with an origin certificate on your server (recommended), or **Flexible** (HTTP to
the origin, weaker). Runly's HTTPS check will see Cloudflare's certificate, which is expected.

## 4. How Runly reports HTTPS

After verification the dialog shows an informational state; it never blocks serving:

| State | Meaning |
|---|---|
| `HTTPS listo` | A TLS handshake on `<domain>:443` returned a valid, unexpired certificate for that name. |
| `Certificado no válido` | A certificate answered but it is expired, self-signed, untrusted or for another name. |
| `HTTPS sin configurar` | Nothing answered on port 443 (no virtual host, firewall, DNS not pointing here yet). |
| `HTTPS sin comprobar` | The check has not been run. **Comprobar HTTPS** runs it (once a minute per domain). |

When **Growth** is installed, verifying a domain also creates three Growth monitors for it
(availability, SSL expiry, domain expiry) that alert admins before a certificate lapses.

## 5. Rules enforced by Runly

- Ownership is proven by the TXT record; nothing is served before that.
- Refused: IP addresses, single-label names, the ERP/admin hosts and their registrable domain,
  anything under the platform namespace, and names starting with `admin`, `api`, `auth`, `mcp`
  or `internal`.
- A verified domain belongs to one company; a pending claim is protected for one hour; a released
  domain can be claimed by anyone who proves DNS ownership.
- Verification is throttled (10 s per domain), HTTPS checks 1 per minute per domain.
- Domain rows are never deleted (a database trigger forbids it). Releasing a domain keeps the row
  as `quarantined` and stops serving at once; deleting a site releases its custom domains.

## 6. Troubleshooting

| Symptom | Check |
|---|---|
| "Todavía no encontramos el registro TXT" | Wrong host entered at the DNS provider (zone appended twice), not propagated yet, or a typo in the value. Query it: `dig +short TXT _runly-verify.www.mitienda.mx`. |
| Verified but the screen warns DNS does not point here | The CNAME/A is missing or points elsewhere; compare it with the target you configured. |
| `HTTPS sin configurar` | No certificate/virtual host for that name on your proxy, port 443 closed, or DNS still cached. |
| Browser shows the wrong site or a 404 | The site must be published (a draft site is not served), and the domain must be `assigned`. |
| Customer is on Cloudflare and verification keeps failing | The TXT record must not be proxied (it cannot be); only the CNAME/A can be orange-clouded. |
| Many customers, Let's Encrypt rate limits | Limits apply per registered domain; stagger issuance or use a wildcard where the customer controls DNS. |
