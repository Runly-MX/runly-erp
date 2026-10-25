// Real Runly app + Auth + Storage. No request interception, deployment env or workers.
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { createStudioStack } from './fixtures/studio/supabase-stack.mjs'
import { seedStudioScenario } from './fixtures/studio/supabase-data.mjs'
import { verifyStudioSupabase } from './fixtures/studio/supabase-browser.mjs'
import { inspectStudioWeb } from './lib/studio-web-verification.mjs'
import { verifyStudioCollaboration } from './fixtures/studio/supabase-collaboration.mjs'
import { verifyStudioResources } from './fixtures/studio/supabase-resources.mjs'
import { verifyStudioComposition } from './fixtures/studio/supabase-composition.mjs'

const stack = await createStudioStack()
let web
async function close() {
  web?.httpServer.closeAllConnections()
  await new Promise(resolve => web ? web.httpServer.close(resolve) : resolve())
  await stack.close()
}
const interrupted = () => { close().finally(() => process.exit(130)) }
process.once('SIGINT', interrupted); process.once('SIGTERM', interrupted)
try {
  console.log('Starting dedicated local Supabase project (no workers).')
  await stack.compose(['up', '-d', '--wait', '--wait-timeout', '120', 'supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong'], { log: join(stack.directory, 'startup.log') })
  await assert.rejects(stack.initialize(), /DISPOSABLE_DATABASE_NOT_VERIFIED/)
  await stack.verifyTarget()
  await stack.pool.query('UPDATE runly_studio_test.environment SET id=$1', ['wrong-project'])
  await assert.rejects(stack.initialize(), /DISPOSABLE_DATABASE_NOT_VERIFIED/)
  await stack.pool.query('UPDATE runly_studio_test.environment SET id=$1', [stack.name])
  await stack.initialize()
  const data = await seedStudioScenario(stack)
  await stack.compose(['up', '-d', 'runly-api'], { log: join(stack.directory, 'api-start.log') })
  let ready = false
  for (let attempt = 0; attempt < 90; attempt++) {
    try { if ((await fetch(`${stack.urls.api}/public/website/desktop/config`)).ok) { ready = true; break } } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  if (!ready) throw Error('ISOLATED_API_NOT_READY')
  const require = createRequire(resolve('apps/desktop/package.json'))
  for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key]
  Object.assign(process.env, { VITE_RUNLY_API_URL: stack.urls.api, VITE_SUPABASE_URL: stack.urls.kong, VITE_SUPABASE_ANON_KEY: stack.secret.SUPABASE_ANON_KEY })
  const { build, preview } = await import(pathToFileURL(require.resolve('vite')).href)
  const config = { base: '/', root: resolve('apps/desktop'), configFile: resolve('apps/desktop/vite.config.js'), envDir: stack.directory,
    define: { 'import.meta.env.VITE_RUNLY_API_URL': JSON.stringify(stack.urls.api),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(stack.urls.kong), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(stack.secret.SUPABASE_ANON_KEY) },
    build: { outDir: join(stack.directory, 'web'), emptyOutDir: true },
    preview: { host: '127.0.0.1', port: stack.ports.web, strictPort: true } }
  console.log('Building real React frontend with isolated public configuration.')
  await build(config)
  const bundle = await inspectStudioWeb(config.build.outDir, { forbiddenValues: [stack.secret.SUPABASE_SERVICE_ROLE_KEY,
    stack.secret.SUPABASE_JWT_SECRET, stack.secret.SUPABASE_POSTGRES_PASSWORD] })
  web = await preview(config)
  const result = process.argv.includes('--composition-only') ? { passed: true, composition: await verifyStudioComposition(stack, data), bundle } : { ...(process.argv.includes('--collaboration-only') ? { passed: true } : await verifyStudioSupabase(stack, data)),
    collaboration: await verifyStudioCollaboration(stack, data), resources: await verifyStudioResources(stack, data), composition: await verifyStudioComposition(stack, data), bundle }
  await writeFile(join(stack.directory, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
} finally {
  process.removeListener('SIGINT', interrupted); process.removeListener('SIGTERM', interrupted)
  await close()
}
