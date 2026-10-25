// Real Runly app + Auth + Storage. No request interception, deployment env or workers.
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { createStudioStack } from './fixtures/studio/supabase-stack.mjs'
import { seedStudioScenario } from './fixtures/studio/supabase-data.mjs'
import { verifyStudioSupabase } from './fixtures/studio/supabase-browser.mjs'

const stack = await createStudioStack()
let web
try {
  console.log('Starting dedicated local Supabase project (no workers).')
  await stack.compose(['up', '-d', '--wait', '--wait-timeout', '120', 'supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong'], { log: join(stack.directory, 'startup.log') })
  await stack.verifyTarget()
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
  const { build, preview } = await import(pathToFileURL(require.resolve('vite')).href)
  const config = { root: resolve('apps/desktop'), configFile: resolve('apps/desktop/vite.config.js'), envDir: stack.directory,
    define: { 'import.meta.env.VITE_RUNLY_API_URL': JSON.stringify(stack.urls.api),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(stack.urls.kong), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(stack.secret.SUPABASE_ANON_KEY) },
    build: { outDir: join(stack.directory, 'web'), emptyOutDir: true },
    preview: { host: '127.0.0.1', port: stack.ports.web, strictPort: true } }
  console.log('Building real React frontend with isolated public configuration.')
  await build(config)
  web = await preview(config)
  const result = await verifyStudioSupabase(stack, data)
  await writeFile(join(stack.directory, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
} finally {
  await new Promise(resolve => web ? web.httpServer.close(resolve) : resolve())
  await stack.close()
}
