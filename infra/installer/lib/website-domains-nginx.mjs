// Pure helpers for the host-side TLS sync of Website custom domains (website-domains.mjs).
// Hostnames come from the ERP database (verified by DNS, typed by tenants): every one is validated
// strictly before it reaches a file name, an nginx config or a certbot argument.

export const ACME_WEBROOT = '/var/www/runly-acme'
export const ACME_CONF = '00-runly-acme.conf'
export const RETRY_AFTER_FAILURE_MS = 60 * 60 * 1000 // Let's Encrypt limits failed validations per hostname

const HOSTNAME = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
export const isSafeHostname = (value) => typeof value === 'string' && HOSTNAME.test(value)
const SAFE_PREFIX = /^[a-z0-9][a-z0-9-]{0,62}$/
export function assertSafePrefix(prefix) {
  if (!SAFE_PREFIX.test(prefix)) throw Error(`WEBSITE_DOMAINS_UNSAFE_INSTANCE_PREFIX: ${JSON.stringify(prefix)}`)
  return prefix
}
const UPSTREAM = /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]|[a-z0-9.-]+):\d{1,5}$/
export function assertSafeUpstream(upstream) {
  if (!UPSTREAM.test(upstream)) throw Error(`WEBSITE_DOMAINS_UNSAFE_UPSTREAM: use http://host:port, got ${JSON.stringify(upstream)}`)
  return upstream
}

export const siteConfName = (prefix, hostname) => `runly-site-${prefix}--${hostname}.conf`
export const namespaceConfName = (prefix) => `runly-namespace-${prefix}.conf`
export const ownedSiteConf = (prefix, file) => {
  const start = `runly-site-${prefix}--`
  if (!file.startsWith(start) || !file.endsWith('.conf')) return null
  const hostname = file.slice(start.length, -'.conf'.length)
  return isSafeHostname(hostname) ? hostname : null
}

export function renderAcmeBlock(webroot = ACME_WEBROOT) {
  return `# Managed by Runly (infra/installer/website-domains.mjs). Port 80 for every name this server receives:
# Let's Encrypt HTTP-01 challenges, and HTTPS redirects for everything else.
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    location ^~ /.well-known/acme-challenge/ { root ${webroot}; default_type text/plain; }
    location / { return 301 https://$host$request_uri; }
}
`
}

const proxy = (upstream) => `    location / {
        proxy_pass ${upstream};
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        client_max_body_size 25m;
    }`

function tlsBlock({ names, certDir, upstream }) {
  return `server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${names};
    ssl_certificate     ${certDir}/fullchain.pem;
    ssl_certificate_key ${certDir}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
${proxy(upstream)}
}
`
}

export function renderSiteBlock({ hostname, upstream, certDir = `/etc/letsencrypt/live/${hostname}` }) {
  if (!isSafeHostname(hostname)) throw Error(`WEBSITE_DOMAINS_UNSAFE_HOSTNAME: ${JSON.stringify(hostname)}`)
  return `# Managed by Runly (infra/installer/website-domains.mjs). Customer domain ${hostname}; removed when it is released.\n${tlsBlock({ names: hostname, certDir, upstream: assertSafeUpstream(upstream) })}`
}

export function renderNamespaceBlock({ root, upstream, certDir }) {
  if (!isSafeHostname(root)) throw Error(`WEBSITE_DOMAINS_UNSAFE_NAMESPACE: ${JSON.stringify(root)}`)
  return `# Managed by Runly (infra/installer/website-domains.mjs). Platform site addresses *.${root} (wildcard certificate).\n${tlsBlock({ names: `*.${root}`, certDir, upstream: assertSafeUpstream(upstream) })}`
}

// What one sync run must do. `failures` maps hostname -> last failed issuance (ms) to back off.
export function planSync({ domains, ownedHosts, hasCert, failures = {}, now = Date.now() }) {
  const wanted = [...new Set(domains)].filter(isSafeHostname)
  const skipped = domains.filter((domain) => !isSafeHostname(domain))
  const issue = [], waiting = [], write = []
  for (const hostname of wanted) {
    if (hasCert(hostname)) { write.push(hostname); continue }
    if (failures[hostname] && now - failures[hostname] < RETRY_AFTER_FAILURE_MS) waiting.push(hostname)
    else issue.push(hostname)
  }
  const remove = ownedHosts.filter((hostname) => !wanted.includes(hostname))
  return { issue, waiting, write, remove, skipped }
}
