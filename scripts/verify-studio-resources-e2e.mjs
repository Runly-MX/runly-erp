// Full Studio Resources E2E: disposable Supabase project + API and worker images built by
// scripts/build-studio-resources-local.mjs + the React app built from the working tree, with files other
// sessions are editing replaced by their committed (HEAD) content. Playwright drives the UI.
//   node scripts/build-studio-resources-local.mjs
//   node scripts/verify-studio-resources-e2e.mjs
// Everything it creates carries the unique `runly-studio-e2e-<hex12>` project name; cleanup is the stack's own
// scoped `compose down --volumes` for that name. No other container, network, volume or image is touched.
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { createStudioStack, command } from './fixtures/studio/supabase-stack.mjs'
import { seedStudioScenario } from './fixtures/studio/supabase-data.mjs'
import { inspectStudioWeb } from './lib/studio-web-verification.mjs'
import { prepareDisposableNotesStorageOwner } from './fixtures/realtime-2/notes-storage-owner.mjs'
import { verifyStudioCreative } from './fixtures/studio/supabase-creative.mjs'

const build = JSON.parse(await readFile(resolve('.artifacts/studio/resources-build.json'), 'utf8'))
for (const image of Object.values(build.images)) assert.match(image, /^runly-studio-resources:[a-f0-9]{12}-(api|worker)$/)
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()
// Files this workstream owns or needs; every other modified source file under the web roots is held back to HEAD.
const KEEP = [/^apps\/shared\/studio\//, /^packages\/sdk\/src\/domains\/studio\.js$/, /StudioCreativeResources\.jsx$/, /StudioCredits\.jsx$/,
  // HEAD renders <ToolButton> without importing it; the working-tree one-line import is required to open the Files tab.
  /runly\.studio\/components\/StudioResources\.jsx$/]
const heldBack = git('diff', '--name-only', '--diff-filter=M', 'HEAD', '--', 'apps/desktop', 'apps/shared', 'packages/ui', 'packages/sdk')
  .split(/\r?\n/).filter(file => /\.(?:js|jsx|css)$/.test(file) && !KEEP.some(pattern => pattern.test(file)))
console.log(`Held back to HEAD (other sessions): ${heldBack.length ? heldBack.join(', ') : 'none'}`)
const stack = await createStudioStack({ apiImage: build.images.api })
let web
async function close() {
  web?.httpServer.closeAllConnections()
  await new Promise(resolvePromise => web ? web.httpServer.close(resolvePromise) : resolvePromise())
  await stack.close()
}
const interrupted = () => { close().finally(() => process.exit(130)) }
process.once('SIGINT', interrupted); process.once('SIGTERM', interrupted)
try {
  console.log(`Starting disposable project ${stack.name}`)
  await stack.compose(['up', '-d', '--wait', '--wait-timeout', '120', 'supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong'], { log: join(stack.directory, 'startup.log') })
  await stack.verifyTarget()
  await stack.initialize()
  // Current API images refuse to start without owner-prepared private Notes Storage (disposable project only).
  await prepareDisposableNotesStorageOwner(stack)
  const data = await seedStudioScenario(stack)
  await stack.compose(['up', '-d', 'studio-catalog-test', 'runly-api'], { log: join(stack.directory, 'api-start.log') })
  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    try { if ((await fetch(`${stack.urls.api}/public/website/desktop/config`)).ok) { ready = true; break } } catch { /* startup */ }
    await new Promise(r => setTimeout(r, 500))
  }
  if (!ready) throw Error('ISOLATED_API_NOT_READY')
  // Worker from the same snapshot, same environment as the API.
  const config = JSON.parse(await readFile(stack.composeFile, 'utf8'))
  config.services['runly-worker'] = { image: build.images.worker, pull_policy: 'never', restart: 'no', environment: { ...config.services['runly-api'].environment, RUNLY_SKIP_DB_INIT: '1' }, networks: { default: null } }
  await writeFile(stack.composeFile, JSON.stringify(config, null, 2))
  await stack.compose(['up', '-d', 'runly-worker'], { log: join(stack.directory, 'worker-start.log') }); await new Promise(r => setTimeout(r, 5000))
  const [workerInfo] = JSON.parse(await command('docker', ['inspect', await stack.compose(['ps', '-q', 'runly-worker'])]))
  assert.equal(workerInfo.State.Running, true)
  assert.ok(!/ERR_MODULE_NOT_FOUND|Cannot find package|SyntaxError/.test(await stack.compose(['logs', '--no-color', 'runly-worker'])))

  const require = createRequire(resolve('apps/desktop/package.json'))
  for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key]
  Object.assign(process.env, { VITE_RUNLY_API_URL: stack.urls.api, VITE_SUPABASE_URL: stack.urls.kong, VITE_SUPABASE_ANON_KEY: stack.secret.SUPABASE_ANON_KEY })
  const { build: viteBuild, preview } = await import(pathToFileURL(require.resolve('vite')).href)
  const sources = new Map(heldBack.map(file => [resolve(file).replaceAll('\\', '/'), git('show', `HEAD:${file}`)]))
  const viteConfig = { base: '/', root: resolve('apps/desktop'), configFile: resolve('apps/desktop/vite.config.js'), envDir: stack.directory,
    define: { 'import.meta.env.VITE_RUNLY_API_URL': JSON.stringify(stack.urls.api), 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(stack.urls.kong), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(stack.secret.SUPABASE_ANON_KEY) },
    build: { outDir: join(stack.directory, 'web'), emptyOutDir: true }, preview: { host: '127.0.0.1', port: stack.ports.web, strictPort: true },
    plugins: [{ name: 'studio-hold-back-foreign-edits', enforce: 'pre', load(id) { return sources.get(id.split('?')[0].replaceAll('\\', '/')) ?? null } }] }
  console.log('Building the React frontend with isolated public configuration.')
  await viteBuild(viteConfig)
  const bundle = await inspectStudioWeb(viteConfig.build.outDir, { forbiddenValues: [stack.secret.SUPABASE_SERVICE_ROLE_KEY, stack.secret.SUPABASE_JWT_SECRET, stack.secret.SUPABASE_POSTGRES_PASSWORD] })
  web = await preview(viteConfig)
  const creative = await verifyStudioCreative(stack, data)
  const result = { passed: true, images: build.images, heldBack, worker: { running: true, importsValid: true }, bundle, creative }
  await writeFile(join(stack.directory, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2))
} finally {
  process.removeListener('SIGINT', interrupted); process.removeListener('SIGTERM', interrupted)
  await close()
}
