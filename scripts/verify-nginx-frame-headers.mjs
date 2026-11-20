// Checks the framing headers nginx really sends with infra/nginx/spa.conf: the ERP SPA only
// framable by itself, booking embeds per URL (asked to the API), manage links never, and the
// ERP never served on a website's hostname. nginx:alpine runs the real file; a small local
// server stands in for the API gates (their logic is covered by the bookings portal suite).
//   node scripts/verify-nginx-frame-headers.mjs
import { spawnSync } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const results = []
const ok = (name, cond, detail = '') => { results.push(Boolean(cond)); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`) }
const freePort = () => new Promise((done) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => done(port)) }) })
const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8' })
const APP = 'app.example.test', SITE = 'www.cliente.example.test', EMBED = 'https://cliente.example.test'
const [apiPort, webPort] = [await freePort(), await freePort()]
const name = `runly-nginx-check-${process.pid}`
const html = mkdtempSync(join(tmpdir(), 'runly-nginx-'))
writeFileSync(join(html, 'index.html'), '<!doctype html><title>spa</title>')

// Stand-in for the API gates nginx calls (same answers as the real routes).
const fake = http.createServer((req, res) => {
  const host = String(req.headers.host ?? '').split(':')[0]
  const admin = host === APP
  if (req.url.startsWith('/public/website/admin-origin-check')) { res.writeHead(admin ? 204 : 403); return res.end() }
  if (req.url.startsWith('/public/bookings/frame-policy')) {
    if (!admin) { res.writeHead(403); return res.end() }
    const uri = new URL(String(req.headers['x-original-uri'] ?? '/'), 'http://x')
    const value = /^\/app\/p\/reservar\/gestion\/?$/.test(uri.pathname) ? "'none'" : uri.searchParams.get('embed') === '1' ? `'self' ${EMBED}` : "'self'"
    res.writeHead(204, { 'X-Booking-Frame-Ancestors': value }); return res.end()
  }
  res.writeHead(404); res.end()
})
await new Promise((done) => fake.listen(apiPort, '0.0.0.0', done))
const get = (path, host = APP) => new Promise((done) => http.get({ host: '127.0.0.1', port: webPort, path, headers: { host } }, (r) => {
  r.resume(); done({ status: r.statusCode, csp: [].concat(r.headers['content-security-policy'] ?? []).filter(Boolean) })
}).on('error', () => done({ status: 0, csp: [] })))

try {
  docker('network', 'create', name)
  docker('run', '-d', '--name', `${name}-api`, '--network', name, '--network-alias', 'api', 'node:22.22.3-alpine', 'node', '-e',
    `require('net').createServer(c=>{const u=require('net').connect(${apiPort},'host.docker.internal');c.pipe(u).pipe(c);u.on('error',()=>c.destroy());c.on('error',()=>u.destroy())}).listen(4010)`)
  const conf = resolve('infra/nginx/spa.conf').replace(/\\/g, '/')
  const run = docker('run', '-d', '--name', `${name}-nginx`, '--network', name, '-p', `127.0.0.1:${webPort}:80`, '-v', `${conf}:/etc/nginx/conf.d/default.conf:ro`, '-v', `${html.replace(/\\/g, '/')}:/usr/share/nginx/html:ro`, 'nginx:alpine')
  if (run.status !== 0) throw new Error(run.stderr)
  for (let i = 0; i < 60 && (await get('/app/')).status !== 200; i++) await new Promise((r) => setTimeout(r, 500))

  const app = await get('/app/'), deep = await get('/app/m/runly.pos/pos/caja'), pub = await get('/p/notes/demo')
  ok('ERP shell: only the ERP may frame it', app.status === 200 && app.csp.includes("frame-ancestors 'self'"), app.csp.join(' | '))
  ok('ERP deep link (SPA fallback): same', deep.csp.includes("frame-ancestors 'self'"), deep.csp.join(' | '))
  ok('Public SPA pages under /p/: same', pub.csp.includes("frame-ancestors 'self'"), pub.csp.join(' | '))
  const embed = await get('/app/p/reservar/centro?embed=1'), plain = await get('/app/p/reservar/centro'), manage = await get('/app/p/reservar/gestion')
  ok('Booking embed: the authorized site (and no stricter global header on that path)', embed.csp.join(' ') === `frame-ancestors 'self' ${EMBED}`, embed.csp.join(' | '))
  ok('Booking portal without embed: the ERP only', plain.csp.join(' ') === "frame-ancestors 'self'", plain.csp.join(' | '))
  ok('Manage link: never framed', manage.csp.join(' ') === "frame-ancestors 'none'", manage.csp.join(' | '))
  ok('A website hostname never gets the ERP or the portal', (await get('/app/', SITE)).status === 403 && (await get('/app/p/reservar/centro?embed=1', SITE)).status === 403)
} finally {
  docker('rm', '-f', `${name}-nginx`, `${name}-api`); docker('network', 'rm', name)
  fake.close(); rmSync(html, { recursive: true, force: true })
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
  process.exitCode = results.every(Boolean) && results.length ? 0 : 1
}
