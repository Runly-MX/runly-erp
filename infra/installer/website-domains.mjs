#!/usr/bin/env node
// Host-side TLS for Website addresses on THIS server's nginx (not the web container's).
//   sudo node website-domains.mjs setup [--mode=local|external] [--sites-cert=/etc/letsencrypt/live/<dir>]
//   sudo node website-domains.mjs sync   [--mode=...]
//   sudo node website-domains.mjs status [--mode=...]
// setup (once per instance): port-80 block for Let's Encrypt + HTTPS redirects, optional *.<namespace> block,
// and a systemd timer that runs `sync` every 5 minutes. sync: asks the API container which customer domains
// are verified, issues a certificate for each new one (certbot, HTTP-01), writes its nginx block, and removes
// the blocks of released domains. Nothing is written unless `nginx -t` accepts it; certificates are never deleted.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolveInstanceIdentity, containerName } from './lib/instance-identity.mjs'
import { ACME_CONF, ACME_WEBROOT, assertSafePrefix, assertSafeUpstream, isSafeHostname, namespaceConfName, ownedSiteConf, planSync, renderAcmeBlock, renderNamespaceBlock, renderSiteBlock, siteConfName } from './lib/website-domains-nginx.mjs'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const CONF_DIR = process.env.RUNLY_NGINX_CONF_DIR || '/etc/nginx/conf.d'
const LIVE_DIR = '/etc/letsencrypt/live'
const STATE_DIR = '/var/lib/runly-website-domains'
const args = process.argv.slice(2)
const command = args.find((a) => !a.startsWith('--')) ?? 'status'
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const log = (message) => console.log(`[runly-domains] ${message}`)

function parseEnv(content) {
  const env = {}
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (match) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return env
}
function instance() {
  const explicit = option('mode')
  const modes = (explicit ? [explicit] : ['external', 'local']).filter((mode) => fs.existsSync(path.join(DIR, `.env.${mode}`)))
  if (!modes.length) throw Error(`WEBSITE_DOMAINS_NO_INSTANCE: no .env.local or .env.external next to ${DIR}`)
  if (modes.length > 1) throw Error('WEBSITE_DOMAINS_AMBIGUOUS_MODE: both .env.local and .env.external exist; pass --mode=local or --mode=external')
  const mode = modes[0], content = fs.readFileSync(path.join(DIR, `.env.${mode}`), 'utf8'), env = parseEnv(content)
  const { containerPrefix } = resolveInstanceIdentity(content)
  const upstream = assertSafeUpstream(env.RUNLY_WEBSITE_TLS_UPSTREAM || `http://127.0.0.1:${env.RUNLY_WEB_HOST_PORT || 5173}`)
  return { mode, env, prefix: assertSafePrefix(containerPrefix), api: containerName(containerPrefix, `api-${mode}`), upstream }
}
const run = (cmd, argv, opts = {}) => spawnSync(cmd, argv, { encoding: 'utf8', ...opts })
function requireTools() {
  if (process.getuid && process.getuid() !== 0) throw Error('WEBSITE_DOMAINS_ROOT_REQUIRED: run with sudo')
  if (run('certbot', ['--version']).error && !run('apt-get', ['--version']).error) {
    log('Installing certbot...')
    run('apt-get', ['install', '-y', '-qq', 'certbot'], { stdio: 'inherit', env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' } })
  }
  for (const [tool, hint] of [['nginx', 'sudo apt install nginx'], ['certbot', 'sudo apt install certbot'], ['docker', 'Docker must be installed']]) {
    if (run(tool, ['--version']).error && run(tool, ['-v']).error) throw Error(`WEBSITE_DOMAINS_TOOL_MISSING: ${tool} (${hint})`)
  }
}
const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null)

// Applies file changes atomically for nginx: if `nginx -t` rejects them, every file goes back as it was.
function applyNginx(changes) {
  const effective = changes.filter(({ file, content }) => read(file) !== content)
  if (!effective.length) return false
  const previous = effective.map(({ file }) => ({ file, content: read(file) }))
  for (const { file, content } of effective) content === null ? fs.rmSync(file, { force: true }) : fs.writeFileSync(file, content)
  const test = run('nginx', ['-t'])
  if (test.status !== 0) {
    for (const { file, content } of previous) content === null ? fs.rmSync(file, { force: true }) : fs.writeFileSync(file, content)
    throw Error(`WEBSITE_DOMAINS_NGINX_REJECTED: nothing was changed.\n${test.stderr}`)
  }
  execFileSync('systemctl', ['reload', 'nginx'])
  return true
}

function setup() {
  requireTools()
  const inst = instance()
  fs.mkdirSync(path.join(ACME_WEBROOT, '.well-known/acme-challenge'), { recursive: true })
  // Ubuntu's stock site also claims default_server on port 80 ("Welcome to nginx!"); keep a copy and disable it.
  const stock = '/etc/nginx/sites-enabled/default'
  if (fs.existsSync(stock) && /default_server/.test(read(stock) ?? '') && /\/var\/www\/html/.test(read(stock) ?? '')) {
    fs.mkdirSync('/etc/nginx/runly-backup', { recursive: true })
    fs.copyFileSync(stock, '/etc/nginx/runly-backup/sites-enabled-default')
    fs.rmSync(stock)
    log('Disabled the stock nginx site (copy in /etc/nginx/runly-backup).')
  }
  const changes = [{ file: path.join(CONF_DIR, ACME_CONF), content: renderAcmeBlock() }]
  const root = inst.env.RUNLY_WEBSITE_NAMESPACE_ROOT
  const certDir = option('sites-cert') ?? (root && fs.existsSync(path.join(LIVE_DIR, root)) ? path.join(LIVE_DIR, root) : null)
  const alreadyServed = root && run('nginx', ['-T']).stdout.includes(`*.${root}`) && !read(path.join(CONF_DIR, namespaceConfName(inst.prefix)))
  if (root && certDir && !alreadyServed) changes.push({ file: path.join(CONF_DIR, namespaceConfName(inst.prefix)), content: renderNamespaceBlock({ root, upstream: inst.upstream, certDir }) })
  else if (root && !alreadyServed) log(`*.${root} is not served yet: issue its wildcard certificate (DNS-01) and run setup again with --sites-cert=<certificate dir>.`)
  applyNginx(changes)
  log('Port 80 ready for certificates and HTTPS redirects.')
  const unit = `runly-website-domains-${inst.prefix}`
  fs.writeFileSync(`/etc/systemd/system/${unit}.service`, `[Unit]\nDescription=Runly website domains TLS sync (${inst.prefix})\nAfter=docker.service nginx.service\n\n[Service]\nType=oneshot\nExecStart=${process.execPath} ${path.join(DIR, 'website-domains.mjs')} sync --mode=${inst.mode}\n`)
  fs.writeFileSync(`/etc/systemd/system/${unit}.timer`, `[Unit]\nDescription=Run ${unit} every 5 minutes\n\n[Timer]\nOnBootSec=2min\nOnUnitActiveSec=5min\n\n[Install]\nWantedBy=timers.target\n`)
  execFileSync('systemctl', ['daemon-reload'])
  execFileSync('systemctl', ['enable', '--now', `${unit}.timer`])
  log(`Automatic sync enabled (${unit}.timer, every 5 minutes). Running it now...`)
  sync(inst)
}

function verifiedDomains(inst) {
  const out = run('docker', ['exec', inst.api, 'node', 'apps/api/scripts/website-tls-domains.mjs'])
  if (out.status !== 0) throw Error(`WEBSITE_DOMAINS_API_UNAVAILABLE: could not ask ${inst.api} for verified domains. Is Runly running?\n${out.stderr}`)
  return JSON.parse(out.stdout || '[]')
}

function sync(inst = instance()) {
  requireTools()
  const stateFile = path.join(STATE_DIR, `${inst.prefix}.json`)
  const state = JSON.parse(read(stateFile) ?? '{"failures":{}}')
  const ownedHosts = fs.readdirSync(CONF_DIR).map((file) => ownedSiteConf(inst.prefix, file)).filter(Boolean)
  const hasCert = (hostname) => fs.existsSync(path.join(LIVE_DIR, hostname, 'fullchain.pem'))
  const plan = planSync({ domains: verifiedDomains(inst), ownedHosts, hasCert, failures: state.failures })
  for (const name of plan.skipped) log(`Skipped an invalid hostname: ${JSON.stringify(name)}`)
  for (const name of plan.waiting) log(`${name}: last certificate attempt failed; retrying within the hour.`)
  for (const hostname of plan.issue) {
    log(`${hostname}: requesting a certificate...`)
    const email = inst.env.RUNLY_WEBSITE_TLS_EMAIL
    const result = run('certbot', ['certonly', '--webroot', '-w', ACME_WEBROOT, '-d', hostname, '--non-interactive', '--agree-tos', '--keep-until-expiring', '--deploy-hook', 'systemctl reload nginx', ...(email ? ['--email', email] : ['--register-unsafely-without-email'])])
    if (result.status === 0 && hasCert(hostname)) { delete state.failures[hostname]; plan.write.push(hostname) } else {
      state.failures[hostname] = Date.now()
      log(`${hostname}: certificate failed (does its DNS point to this server?). ${(result.stderr || '').split('\n').filter(Boolean).slice(-2).join(' ')}`)
    }
  }
  const changes = [
    ...plan.write.map((hostname) => ({ file: path.join(CONF_DIR, siteConfName(inst.prefix, hostname)), content: renderSiteBlock({ hostname, upstream: inst.upstream }) })),
    ...plan.remove.map((hostname) => ({ file: path.join(CONF_DIR, siteConfName(inst.prefix, hostname)), content: null })),
  ]
  const changed = applyNginx(changes)
  fs.mkdirSync(STATE_DIR, { recursive: true })
  fs.writeFileSync(stateFile, JSON.stringify(state))
  const pending = plan.waiting.length + plan.issue.filter((hostname) => !plan.write.includes(hostname)).length
  log(`${plan.write.length} served, ${plan.remove.length} removed, ${pending} pending${changed ? "; nginx reloaded" : ""}.`)
}

function status() {
  const inst = instance()
  log(`Instance ${inst.prefix} (${inst.mode}), API container ${inst.api}, upstream ${inst.upstream}`)
  for (const hostname of verifiedDomains(inst).filter(isSafeHostname)) {
    const cert = fs.existsSync(path.join(LIVE_DIR, hostname, 'fullchain.pem')), conf = fs.existsSync(path.join(CONF_DIR, siteConfName(inst.prefix, hostname)))
    log(`${hostname}: certificate ${cert ? 'yes' : 'no'}, nginx ${conf ? 'yes' : 'no'}`)
  }
}

try {
  if (command === 'setup') setup()
  else if (command === 'sync') sync()
  else if (command === 'status') status()
  else throw Error(`Unknown command ${command}. Use setup, sync or status.`)
} catch (error) {
  console.error(`[runly-domains] ${error.message}`)
  process.exit(1)
}
