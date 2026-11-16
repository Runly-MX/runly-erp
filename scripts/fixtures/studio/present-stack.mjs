// Disposable Studio stack for browser verification of presentations and motion:
// local Supabase services, every Prisma migration, the API image under test, the
// React build of the working tree and Chrome. Never touches a regular database.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { readFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { createStudioStack } from './supabase-stack.mjs'
import { seedStudioScenario } from './supabase-data.mjs'

const sleep = ms => new Promise(done => setTimeout(done, ms))
export async function until(fn, label, timeout = 20000) {
  const end = Date.now() + timeout
  for (;;) {
    const value = await fn().catch(() => null)
    if (value) return value
    if (Date.now() > end) throw Error(`timeout: ${label}`)
    await sleep(150)
  }
}

// The API under test must contain the committed code: build it from `git archive HEAD`
// so uncommitted files of other work never reach the image.
export function buildApiImageFromHead() {
  const sha = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim()
  const tag = `runly-studio-verify:api-${sha}`
  if (execFileSync('docker', ['images', '-q', tag], { encoding: 'utf8' }).trim()) return tag
  // The tar of HEAD is the build context (docker build -), no working-tree files.
  const context = execFileSync('git', ['archive', '--format=tar', 'HEAD'], { maxBuffer: 2 ** 31 - 1 })
  execFileSync('docker', ['build', '-f', 'infra/docker/api.Dockerfile', '-t', tag, '-'], { input: context, stdio: ['pipe', 'ignore', 'inherit'], maxBuffer: 2 ** 30 })
  return tag
}

export function apiImageFromArgs(argv = process.argv) {
  const explicit = argv.find(value => value.startsWith('--api-image='))?.slice('--api-image='.length)
  if (explicit) return explicit
  if (argv.includes('--build-api-image')) return buildApiImageFromHead()
  throw Error('Usa --api-image=<etiqueta local> o --build-api-image (construye la API desde HEAD).')
}

export async function startPresentStack({ apiImage, shots, keep = process.argv.includes('--keep') }) {
  await mkdir(shots, { recursive: true })
  const stack = await createStudioStack({ apiImage })
  let web, browser
  const pageErrors = []
  async function close() {
    await browser?.close().catch(() => {})
    web?.httpServer.closeAllConnections()
    await new Promise(done => (web ? web.httpServer.close(done) : done()))
    if (!keep) await stack.close()
  }
  process.once('SIGINT', () => { close().finally(() => process.exit(130)) })
  await stack.compose(['up', '-d', '--wait', '--wait-timeout', '120', 'supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong'], { log: join(stack.directory, 'startup.log') })
  await stack.verifyTarget()
  await stack.initialize()
  const scenario = await seedStudioScenario(stack)
  const [company] = scenario.companies, password = scenario.users[0].password
  async function profile(label, roleId) {
    const email = `present-${label}@studio.example.test`
    const { data, error } = await scenario.admin.auth.admin.createUser({ email, password, email_confirm: true })
    assert.equal(error, null)
    const user = (await stack.pool.query('INSERT INTO user_profile(id,auth_user_id,email,display_name,updated_at) VALUES(uuidv7(),$1,$2,$3,now()) RETURNING id', [data.user.id, email, `Present ${label}`])).rows[0]
    await stack.pool.query('INSERT INTO membership(id,company_id,user_id,role_id,updated_at) VALUES(uuidv7(),$1,$2,$3,now())', [company.id, user.id, roleId])
    return { ...user, email, password }
  }
  const role = async (key, permissions) => {
    const row = (await stack.pool.query("INSERT INTO role(id,company_id,key,name,updated_at) VALUES(uuidv7(),$1,$2,$2,now()) RETURNING id", [company.id, key])).rows[0]
    await stack.pool.query('INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key = ANY($2)', [row.id, permissions])
    return row.id
  }
  const adminRole = (await stack.pool.query("SELECT id FROM role WHERE key='runly.admin' AND company_id IS NULL AND enabled LIMIT 1")).rows[0].id
  const users = {
    owner: await profile('owner', adminRole),
    editor: await profile('editor', await role('studio.verify.editor', ['studio.view', 'studio.create', 'studio.edit', 'files.access', 'files.assets.read'])),
    viewer: await profile('viewer', await role('studio.verify.viewer', ['studio.view', 'files.access', 'files.assets.read'])),
  }
  // The installer prepares Notes private storage as the storage owner; the API refuses to boot without it.
  execFileSync('docker', ['exec', '-i', `${stack.name}-supabase-db-1`, 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres'],
    { input: await readFile(resolve('infra/installer/supabase/volumes/db/notes-private-storage-owner.sql')), stdio: ['pipe', 'ignore', 'inherit'] })
  await stack.compose(['up', '-d', 'studio-catalog-test', 'runly-api'], { log: join(stack.directory, 'api-start.log') })
  await until(async () => (await fetch(`${stack.urls.api}/health`)).ok, 'API boot', 90000)

  const tokens = new Map()
  async function token(user) {
    if (!tokens.has(user.email)) {
      const response = await fetch(`${stack.urls.api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: user.email, password: user.password }) })
      assert.equal(response.status, 200)
      tokens.set(user.email, (await response.json()).data.access_token)
    }
    return tokens.get(user.email)
  }
  async function api(path, { user = users.owner, data, body, method = data ? 'POST' : 'GET', headers = {} } = {}) {
    return fetch(`${stack.urls.api}${path}`, { method, body: body ?? (data ? JSON.stringify(data) : undefined),
      headers: { Authorization: `Bearer ${await token(user)}`, 'X-Runly-Company-Id': company.id, ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers } })
  }
  const json = async response => { const payload = await response.json(); assert.ok(response.ok, `${response.status} ${JSON.stringify(payload).slice(0, 300)}`); return payload.data ?? payload }
  const stored = async id => (await stack.pool.query('SELECT document, revision FROM studio_design WHERE id=$1', [id])).rows[0]
  async function uploadPhoto(color, name = 'foto.png') {
    const sharp = createRequire(resolve('apps/api/package.json'))('sharp')
    const form = new FormData()
    form.set('file', new File([await sharp({ create: { width: 800, height: 600, channels: 4, background: color } }).png().toBuffer()], name, { type: 'image/png' }))
    form.set('moduleKey', 'runly.files'); form.set('entityType', 'AtlasFile')
    return json(await api('/files/upload', { method: 'POST', body: form }))
  }
  async function createDesign(name, document, share = []) {
    const design = await json(await api('/studio/designs', { data: { name, document } }))
    for (const [user, role] of share) await json(await api(`/studio/designs/${design.id}/collaborators`, { method: 'PUT', data: { userId: user.id, role } }))
    return design
  }

  const require = createRequire(resolve('apps/desktop/package.json'))
  for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key]
  const { build, preview } = await import(pathToFileURL(require.resolve('vite')).href)
  const config = { base: '/', root: resolve('apps/desktop'), configFile: resolve('apps/desktop/vite.config.js'), envDir: stack.directory, logLevel: 'warn',
    define: { 'import.meta.env.VITE_RUNLY_API_URL': JSON.stringify(stack.urls.api), 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(stack.urls.kong), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(stack.secret.SUPABASE_ANON_KEY) },
    build: { outDir: join(stack.directory, 'web'), emptyOutDir: true }, preview: { host: '127.0.0.1', port: stack.ports.web, strictPort: true } }
  await build(config); web = await preview(config)
  browser = await chromium.launch({ channel: 'chrome', headless: true })

  async function openEditor(user, designId, options = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options })
    const page = await context.newPage()
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.goto(`${stack.urls.web}/app/login`)
    await page.locator('#identifier').fill(user.email); await page.locator('#password').fill(user.password)
    await page.getByRole('button', { name: 'Acceder al sistema', exact: true }).click()
    await page.waitForURL(url => !url.pathname.includes('/login'))
    await page.goto(`${stack.urls.web}/app/m/runly.studio/?design=${designId}`)
    await page.getByRole('button', { name: /Deshacer/ }).or(page.getByText('Solo lectura')).first().waitFor({ timeout: 60000 })
    return { context, page }
  }

  return { stack, company, users, api, json, stored, uploadPhoto, createDesign, openEditor, pageErrors, close,
    shot: (page, name) => page.screenshot({ path: join(shots, `${name}.png`) }) }
}

// Shared Studio UI helpers for the verification scripts.
export const ui = {
  // Opens (never toggles closed) the Formato panel.
  formatPanel: async page => {
    const button = page.getByRole('navigation', { name: 'Herramientas de diseño' }).getByRole('button', { name: 'Formato', exact: true })
    if (await button.getAttribute('aria-pressed') !== 'true') await button.click()
  },
  layersPanel: async page => {
    const button = page.getByRole('navigation', { name: 'Herramientas de diseño' }).getByRole('button', { name: 'Capas', exact: true })
    if (await button.getAttribute('aria-pressed') !== 'true') await button.click()
  },
  layer: (page, text) => page.getByRole('list', { name: 'Capas del diseño' }).locator('li', { hasText: text }),
  slideSection: page => page.getByRole('region', { name: 'Diapositiva' }),
  durationInput: page => page.getByRole('region', { name: 'Diapositiva' }).locator('input[aria-label="Duración de la diapositiva en segundos"]'),
  player: page => page.getByRole('dialog', { name: /^Presentación:/ }),
  counter: page => page.getByRole('dialog', { name: /^Presentación:/ }).getByText(/^\d+ \/ \d+$/),
  undo: page => page.getByRole('button', { name: /^Deshacer/ }),
  redo: page => page.getByRole('button', { name: /^Rehacer/ }),
  selectionBar: page => page.getByRole('toolbar', { name: 'Opciones de la selección' }),
}

export function createReport() {
  const checks = [], failures = []
  return {
    ok(message) { checks.push(message); console.log(`  ok  ${message}`) },
    async step(name, fn) {
      const only = process.argv.find(value => value.startsWith('--only='))?.slice(7)
      if (only && !name.includes(only)) { console.log(`  skip ${name}`); return }
      try { await fn() } catch (error) { failures.push(`${name}: ${error.message.split('\n')[0]}`); console.log(`  FAIL ${name}: ${error.message.split('\n').slice(0, 4).join(' | ')}`) }
    },
    fatal(error) { failures.push(`fatal: ${error.message.split('\n')[0]}`); console.log(error) },
    finish() {
      console.log(`\n${checks.length} checks passed, ${failures.length} failures`)
      for (const failure of failures) console.log(`  - ${failure}`)
      process.exitCode = failures.length ? 1 : 0
    },
  }
}
