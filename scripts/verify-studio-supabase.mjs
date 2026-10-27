// Real Runly app + Auth + Storage. Isolated only; Worker requires --worker-image.
import { createRequire } from 'node:module'
import {execFileSync} from 'node:child_process'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { createStudioStack, command } from './fixtures/studio/supabase-stack.mjs'
import { seedStudioScenario } from './fixtures/studio/supabase-data.mjs'
import { useStudioRealtimeSource } from './fixtures/studio/realtime-source.mjs'
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
import { verifyStudioMultipage } from './fixtures/studio/supabase-multipage.mjs'
import { verifyStudioTextMultipage } from './fixtures/studio/supabase-text-multipage.mjs'

const apiImage=process.argv.find(value=>value.startsWith('--api-image='))?.slice('--api-image='.length)
const webImage=process.argv.find(value=>value.startsWith('--web-image='))?.slice('--web-image='.length)
const workerImage=process.argv.find(value=>value.startsWith('--worker-image='))?.slice('--worker-image='.length)
if(workerImage&&!/^runly-studio-realtime:[a-f0-9]{8}-worker$/.test(workerImage))throw Error('EXPLICIT_LOCAL_WORKER_IMAGE_REQUIRED')
const stack = await createStudioStack({...apiImage?{apiImage}:{},...webImage?{webImage}:{},enableMcp:process.argv.includes('--operations-only')})
let web
async function close() {
  web?.httpServer.closeAllConnections()
  await new Promise(resolve => web ? web.httpServer.close(resolve) : resolve())
  await stack.close()
}
const interrupted = () => { close().finally(() => process.exit(130)) }
process.once('SIGINT', interrupted); process.once('SIGTERM', interrupted)
try {
  if(process.argv.includes('--current-realtime')||webImage){
    const file=join(stack.directory,'kong.yml'),source=await readFile(file,'utf8')
    const configured=source.replace(/(  - name: realtime-v1-ws[\s\S]*?read_timeout:) 3000/,'$1 60000')
    assert.notEqual(configured,source,'Expected disposable WebSocket fault timeout')
    await writeFile(file,configured)
  }
  console.log('Starting dedicated local Supabase project.')
  await stack.compose(['up', '-d', '--wait', '--wait-timeout', '120', 'supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong'], { log: join(stack.directory, 'startup.log') })
  await assert.rejects(stack.initialize(), /DISPOSABLE_DATABASE_NOT_VERIFIED/)
  await stack.verifyTarget()
  await stack.pool.query('UPDATE runly_studio_test.environment SET id=$1', ['wrong-project'])
  await assert.rejects(stack.initialize(), /DISPOSABLE_DATABASE_NOT_VERIFIED/)
  await stack.pool.query('UPDATE runly_studio_test.environment SET id=$1', [stack.name])
  await stack.initialize()
  const data = await seedStudioScenario(stack)
  if(process.argv.includes('--current-realtime'))await useStudioRealtimeSource(stack)
  await stack.compose(['up', '-d', 'studio-catalog-test', 'runly-api'], { log: join(stack.directory, 'api-start.log') })
  let ready = false
  for (let attempt = 0; attempt < 90; attempt++) {
    try { if ((await fetch(`${stack.urls.api}/public/website/desktop/config`)).ok) { ready = true; break } } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  if (!ready) throw Error('ISOLATED_API_NOT_READY')
  if(webImage){
    assert.ok(process.argv.includes('--operations-only'),'Image verification requires the operations suite')
    await stack.compose(['up','-d','runly-web'],{log:join(stack.directory,'web-start.log')})
    const id=await stack.compose(['ps','-q','runly-web']),directory=join(stack.directory,'docker-web')
    await mkdir(directory,{recursive:true});await command('docker',['cp',`${id}:/usr/share/nginx/html/.`,directory])
    const bundle=await inspectStudioWeb(directory,{forbiddenValues:[stack.secret.SUPABASE_SERVICE_ROLE_KEY,stack.secret.SUPABASE_JWT_SECRET,stack.secret.SUPABASE_POSTGRES_PASSWORD]})
    const result={passed:true,apiImage,webImage,bundle,operations:await verifyStudioOperations(stack,data),gradients:await verifyStudioGradients(stack,data),photos:await verifyStudioPhotos(stack,data),shapePhotos:await verifyStudioPhotos(stack,data,{shape:true})}
    if(process.argv.includes('--include-multipage')){
      result.multipage=await verifyStudioMultipage(stack,data)
      result.textMultipage=await verifyStudioTextMultipage(stack,data)
      result.multipagePdf=JSON.parse(execFileSync('python',['scripts/fixtures/studio/v7-inspect-pdf.py',stack.directory],{encoding:'utf8'}))
    }
    if(workerImage){
      const config=JSON.parse(await readFile(stack.composeFile,'utf8'))
      config.services['runly-worker']={image:workerImage,pull_policy:'never',restart:'no',environment:{...config.services['runly-api'].environment,RUNLY_SKIP_DB_INIT:'1'},networks:{default:null}}
      await writeFile(stack.composeFile,JSON.stringify(config,null,2))
      await stack.compose(['up','-d','runly-worker'],{log:join(stack.directory,'worker-start.log')});await new Promise(r=>setTimeout(r,5000))
      const workerId=await stack.compose(['ps','-q','runly-worker']),[info]=JSON.parse(await command('docker',['inspect',workerId]))
      assert.equal(info.State.Running,true)
      assert.ok(!/ERR_MODULE_NOT_FOUND|Cannot find package|SyntaxError/.test(await stack.compose(['logs','--no-color','runly-worker'])))
      result.worker={image:workerImage,running:true,importsValid:true}
    }
    await writeFile(join(stack.directory,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
  }else if(process.argv.includes('--photos-only')){
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
    const result={passed:true,operations:await verifyStudioOperations(stack,data),gradients:await verifyStudioGradients(stack,data),photos:await verifyStudioPhotos(stack,data),shapePhotos:await verifyStudioPhotos(stack,data,{shape:true}),bundle}
    if(process.argv.includes('--include-multipage')){
      result.multipage=await verifyStudioMultipage(stack,data)
      result.textMultipage=await verifyStudioTextMultipage(stack,data)
      const python=execFileSync('python',['scripts/fixtures/studio/v7-inspect-pdf.py',stack.directory],{encoding:'utf8'})
      result.multipagePdf=JSON.parse(python)
    }
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
