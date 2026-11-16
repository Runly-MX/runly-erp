import test from 'node:test'
import assert from 'node:assert/strict'
import { isSafeHostname, ownedSiteConf, planSync, renderAcmeBlock, renderNamespaceBlock, renderSiteBlock, siteConfName, assertSafeUpstream, assertSafePrefix, RETRY_AFTER_FAILURE_MS } from '../lib/website-domains-nginx.mjs'

test('hostnames from the database are validated before reaching nginx, certbot or a file name', () => {
  for (const ok of ['villa-om.dimare.mx', 'www.mitienda.com.mx', 'a1.io']) assert.equal(isSafeHostname(ok), true, ok)
  for (const bad of ['x.mx; include /etc/passwd', 'evil.mx\n}', '../etc.mx', 'UPPER.mx', '-a.mx', 'a..mx', '*.mx', 'localhost', 'a.mx ', '1.2.3.4', '']) assert.equal(isSafeHostname(bad), false, JSON.stringify(bad))
  assert.throws(() => renderSiteBlock({ hostname: 'x.mx;}', upstream: 'http://127.0.0.1:5173' }))
  assert.throws(() => assertSafeUpstream('http://127.0.0.1:5173; return 200'))
  assert.throws(() => assertSafePrefix('../runly'))
})

test('rendered blocks proxy to the instance upstream with the Host header and the right certificate', () => {
  const site = renderSiteBlock({ hostname: 'villa-om.dimare.mx', upstream: 'http://127.0.0.1:5173' })
  assert.match(site, /server_name villa-om\.dimare\.mx;/)
  assert.match(site, /ssl_certificate +\/etc\/letsencrypt\/live\/villa-om\.dimare\.mx\/fullchain\.pem;/)
  assert.match(site, /proxy_pass http:\/\/127\.0\.0\.1:5173;/)
  assert.match(site, /proxy_set_header Host \$host;/)
  assert.match(renderNamespaceBlock({ root: 'sites.example.com', upstream: 'http://127.0.0.1:5173', certDir: '/etc/letsencrypt/live/sites.example.com' }), /server_name \*\.sites\.example\.com;/)
  const acme = renderAcmeBlock('/var/www/runly-acme')
  assert.match(acme, /listen 80 default_server;/)
  assert.match(acme, /acme-challenge\/ \{ root \/var\/www\/runly-acme;/)
  assert.match(acme, /return 301 https:\/\/\$host\$request_uri;/)
})

test('a sync issues new certificates, serves certified domains, backs off failures and removes only its own released blocks', () => {
  const now = 10 * RETRY_AFTER_FAILURE_MS
  const plan = planSync({
    domains: ['ya.mx', 'nuevo.mx', 'fallo.mx', 'reintento.mx', 'bad;.mx'],
    ownedHosts: ['ya.mx', 'liberado.mx'],
    hasCert: (h) => h === 'ya.mx',
    failures: { 'fallo.mx': now - 1000, 'reintento.mx': now - RETRY_AFTER_FAILURE_MS - 1 },
    now,
  })
  assert.deepEqual(plan, { issue: ['nuevo.mx', 'reintento.mx'], waiting: ['fallo.mx'], write: ['ya.mx'], remove: ['liberado.mx'], skipped: ['bad;.mx'] })
  assert.equal(ownedSiteConf('runly', siteConfName('runly', 'ya.mx')), 'ya.mx')
  assert.equal(ownedSiteConf('runly', siteConfName('otra', 'ya.mx')), null, 'another instance on the same server keeps its blocks')
  assert.equal(ownedSiteConf('runly', 'default.conf'), null)
})
