// Repeats the mobile deep link /app/m/runly.notes/?note=<id> against a disposable Supabase stack and
// the API image under test. Every run is a new touch context that logs in and opens the link; the
// editor must appear WITHOUT any tapping and the URL must keep ?note=. No timeouts are stretched
// and nothing is retried: a run either opens the note or it is a failure.
//   node scripts/verify-notes-mobile-deeplink.mjs --api-image=runly-notes-private:api-<sha> [--web-root=apps/desktop] [--runs=20] [--label=name]
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve, join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { createStudioStack } from './fixtures/studio/supabase-stack.mjs'
import { seedStudioScenario } from './fixtures/studio/supabase-data.mjs'
import { prepareDisposableNotesStorageOwner } from './fixtures/realtime-2/notes-storage-owner.mjs'

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const image = arg('api-image'), webRoot = resolve(arg('web-root', 'apps/desktop')), runs = Number(arg('runs', '20')), label = arg('label', 'run')
assert.match(image ?? '', /^runly-notes-private:[a-zA-Z0-9_-]+$/)
assert.ok(Number.isInteger(runs) && runs >= 1 && runs <= 100)
const wait = ms => new Promise(r => setTimeout(r, ms))
const stack = await createStudioStack({ apiImage: image })
let browser, preview
try {
  await stack.compose(['up', '-d', '--wait', '--wait-timeout', '120', 'supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong'])
  await stack.verifyTarget(); await stack.initialize(); await prepareDisposableNotesStorageOwner(stack)
  const { users, companies } = await seedStudioScenario(stack), company = companies[0], user = users[0]
  await stack.pool.query("UPDATE runly_module SET enabled=true,status='INSTALLED' WHERE key IN ('runly.notes')")
  await stack.pool.query("INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key LIKE 'notes.%' ON CONFLICT DO NOTHING", [company.roleId])
  const note = (await stack.pool.query("INSERT INTO notes(company_id,owner_user_id,title,content) VALUES($1,$2,'Nota enlace profundo',$3::jsonb) RETURNING id", [company.id, user.id, JSON.stringify('<p>Contenido enlace profundo</p>')])).rows[0]
  await stack.compose(['up', '-d', 'runly-api'])
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${stack.urls.api}/health`)).ok) break } catch {} await wait(500) }

  const directory = join(stack.directory, 'deeplink-web')
  await mkdir(directory, { recursive: true })
  for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key]
  const { build, preview: startPreview } = await import(pathToFileURL(createRequire(join(webRoot, 'package.json')).resolve('vite')).href)
  const config = {
    root: webRoot, configFile: join(webRoot, 'vite.config.js'), envDir: directory, base: '/',
    define: { 'import.meta.env.VITE_RUNLY_API_URL': JSON.stringify(stack.urls.api), 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(stack.urls.kong), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(stack.secret.SUPABASE_ANON_KEY) },
    build: { outDir: join(directory, 'web'), emptyOutDir: true }, preview: { host: '127.0.0.1', port: stack.ports.web, strictPort: true },
  }
  await build(config)
  preview = await startPreview(config)
  browser = await chromium.launch({ channel: 'chrome', headless: true })

  const results = []
  for (let n = 1; n <= runs; n++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      return /^https?:$/.test(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname) ? route.abort() : route.continue()
    })
    await context.addInitScript(id => localStorage.setItem('runly-active-company', id), company.id)
    const page = await context.newPage(), started = Date.now()
    try {
      await page.goto(`${stack.urls.web}/app/login`)
      await page.locator('#identifier').fill(user.email); await page.locator('#password').fill(user.password)
      await page.getByRole('button', { name: 'Acceder al sistema', exact: true }).click()
      await page.waitForURL(url => !url.pathname.includes('/login'))
      await page.goto(`${stack.urls.web}/app/m/runly.notes/?note=${note.id}`)
      let opened = false
      try { await page.locator('.ProseMirror:visible').first().waitFor({ timeout: 20000 }); opened = true } catch {}
      if (!opened && process.env.RUNLY_DEEPLINK_DIAG && n === 1) {
        await mkdir(process.env.RUNLY_DEEPLINK_DIAG, { recursive: true })
        await page.screenshot({ path: join(process.env.RUNLY_DEEPLINK_DIAG, label + '.png') }).catch(() => {})
        console.error(JSON.stringify({ diag: await page.evaluate(() => ({ url: location.href, text: document.body.innerText.slice(0, 800), rootChildren: document.querySelector('#root')?.children.length })) }))
      }
      const finalUrl = new URL(page.url())
      results.push({ run: n, opened, keptNoteParam: finalUrl.searchParams.get('note') === note.id, path: finalUrl.pathname + finalUrl.search.replace(note.id, '<id>'), ms: Date.now() - started })
    } finally { await context.close() }
  }
  const failures = results.filter(r => !r.opened || !r.keptNoteParam)
  const summary = { label, image, webRoot: webRoot.replaceAll('\\', '/').split('/').slice(-3).join('/'), runs, opened: results.filter(r => r.opened).length, failures }
  console.log(JSON.stringify(summary))
  process.exitCode = failures.length ? 1 : 0
} finally {
  await browser?.close().catch(() => {}); await preview?.close?.().catch(() => {}); await stack.close()
}
