// Real Runly app + Auth + Storage. No request interception, deployment env or workers.
import { createRequire } from 'node:module'
import {execFileSync} from 'node:child_process'
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
import { verifyStudioCreative } from './fixtures/studio/supabase-creative.mjs'
import { measureStudioBaseline } from './lib/studio-web-baseline.mjs'
import { verifyStudioPhotos } from './fixtures/studio/supabase-photos.mjs'
import { verifyStudioGradients } from './fixtures/studio/supabase-gradients.mjs'
import { verifyStudioOperations } from './fixtures/studio/supabase-operations.mjs'

const apiImage=process.argv.find(value=>value.startsWith('--api-image='))?.slice('--api-image='.length)
const stack = await createStudioStack({...apiImage?{apiImage}:{},enableMcp:process.argv.includes('--operations-only')})
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
  await stack.compose(['up', '-d', 'studio-catalog-test', 'runly-api'], { log: join(stack.directory, 'api-start.log') })
  let ready = false
  for (let attempt = 0; attempt < 90; attempt++) {
    try { if ((await fetch(`${stack.urls.api}/public/website/desktop/config`)).ok) { ready = true; break } } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  if (!ready) throw Error('ISOLATED_API_NOT_READY')
  if(process.argv.includes('--photos-only')){
    const result={passed:true,photos:await verifyStudioPhotos(stack,data),shapePhotos:await verifyStudioPhotos(stack,data,{shape:true})}
    await writeFile(join(stack.directory,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
  }else{
  const require = createRequire(resolve('apps/desktop/package.json'))
  for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key]
  Object.assign(process.env, { VITE_RUNLY_API_URL: stack.urls.api, VITE_SUPABASE_URL: stack.urls.kong, VITE_SUPABASE_ANON_KEY: stack.secret.SUPABASE_ANON_KEY })
  const { build, preview } = await import(pathToFileURL(require.resolve('vite')).href)
  const config = { base: '/', root: resolve('apps/desktop'), configFile: resolve('apps/desktop/vite.config.js'), envDir: stack.directory,
    define: { 'import.meta.env.VITE_RUNLY_API_URL': JSON.stringify(stack.urls.api),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(stack.urls.kong), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(stack.secret.SUPABASE_ANON_KEY) },
    build: { outDir: join(stack.directory, 'web'), emptyOutDir: true },
    preview: { host: '127.0.0.1', port: stack.ports.web, strictPort: true } }
  // Verify a committed source snapshot while another session edits UI, without
  // checkout, branch, worktree or modifying any working file.
  const requestedRef=process.argv.find(value=>value.startsWith('--source-ref='))?.slice('--source-ref='.length)
  let sourceRef
  if(requestedRef){
    if(!/^(HEAD|[a-f0-9]{7,40})$/i.test(requestedRef))throw Error('COMMITTED_SOURCE_REF_REQUIRED')
    sourceRef=execFileSync('git',['rev-parse','--verify',requestedRef],{encoding:'utf8'}).trim()
    const changed=execFileSync('git',['diff','--name-only','--diff-filter=M',sourceRef,'--','apps/desktop','apps/shared','packages/ui','packages/sdk'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(file=>/\.(?:js|jsx|css)$/.test(file))
    const sources=new Map(changed.map(file=>[resolve(file).replaceAll('\\','/'),execFileSync('git',['show',`${sourceRef}:${file}`],{encoding:'utf8',maxBuffer:16*1024*1024})]))
    config.plugins=[{name:'studio-committed-source',enforce:'pre',load(id){return sources.get(id.split('?')[0].replaceAll('\\','/'))??null}}]
  }
  console.log('Building real React frontend with isolated public configuration.')
  const baselineRef=process.argv.find(value=>value.startsWith('--baseline-ref='))?.slice('--baseline-ref='.length)??'HEAD'
  const baseline=process.argv.includes('--measure-baseline')?await measureStudioBaseline(build,config,stack.directory,baselineRef):null
  await build(config)
  const bundle = await inspectStudioWeb(config.build.outDir, { forbiddenValues: [stack.secret.SUPABASE_SERVICE_ROLE_KEY,
    stack.secret.SUPABASE_JWT_SECRET, stack.secret.SUPABASE_POSTGRES_PASSWORD] })
  if(sourceRef)bundle.sourceRef=sourceRef
  if(baseline)bundle.baseline=baseline
  web = await preview(config)
  if(process.argv.includes('--operations-only')){
    const result={passed:true,operations:await verifyStudioOperations(stack,data),gradients:await verifyStudioGradients(stack,data),bundle}
    await writeFile(join(stack.directory,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
  }else if(process.argv.includes('--gradients-only')){
    const result={passed:true,gradients:await verifyStudioGradients(stack,data),bundle}
    await writeFile(join(stack.directory,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
  }else{
  const photos=await verifyStudioPhotos(stack,data)
  const result = process.argv.includes('--creative-only') ? { passed:true,creative:await verifyStudioCreative(stack,data),bundle } : process.argv.includes('--composition-only') ? { passed: true, composition: await verifyStudioComposition(stack, data), bundle } : { ...(process.argv.includes('--collaboration-only') ? { passed: true } : await verifyStudioSupabase(stack, data)),
    collaboration: await verifyStudioCollaboration(stack, data), resources: await verifyStudioResources(stack, data), composition: await verifyStudioComposition(stack, data),creative:await verifyStudioCreative(stack,data), bundle }
  result.shapePhotos=await verifyStudioPhotos(stack,data,{shape:true})
  result.photos=photos
  result.gradients=await verifyStudioGradients(stack,data)
  await writeFile(join(stack.directory, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  }
  }
} finally {
  process.removeListener('SIGINT', interrupted); process.removeListener('SIGTERM', interrupted)
  await close()
}
