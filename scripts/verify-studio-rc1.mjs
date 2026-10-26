// Builds are separate and explicit. This runner only uses prebuilt local images
// and its own fresh, identity-checked Supabase Docker project; never workspace env.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {createStudioStack,command,unusedPort} from './fixtures/studio/supabase-stack.mjs'
import {seedStudioScenario} from './fixtures/studio/supabase-data.mjs'
import {verifyRcTemplates} from './fixtures/studio/rc1-templates.mjs'
import {verifyRcMcp} from './fixtures/studio/rc1-mcp.mjs'
import {verifyStudioSupabase} from './fixtures/studio/supabase-browser.mjs'
import {verifyStudioCollaboration} from './fixtures/studio/supabase-collaboration.mjs'
import {verifyStudioResources} from './fixtures/studio/supabase-resources.mjs'
import {verifyStudioComposition} from './fixtures/studio/supabase-composition.mjs'
import {verifyStudioCreative} from './fixtures/studio/supabase-creative.mjs'
import {verifyStudioPhotos} from './fixtures/studio/supabase-photos.mjs'
import {inspectStudioWeb} from './lib/studio-web-verification.mjs'

const arg=name=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)
const revision=execFileSync('git',['rev-parse','--verify',arg('revision')??'HEAD'],{encoding:'utf8'}).trim()
assert.match(revision,/^[a-f0-9]{40}$/)
const short=revision.slice(0,8),image=kind=>`runly-studio-rc1:${short}-${kind}`
const previousImage='runly-studio-rc1:65c4587b-api'
const result={revision,passed:false,images:{},checks:[],limitations:[]}
for(const kind of ['api','web','worker']){
  const [info]=JSON.parse(await command('docker',['image','inspect',image(kind)]))
  assert.equal(info.Config.Labels['org.opencontainers.image.revision'],revision)
  result.images[kind]={tag:image(kind),id:info.Id,platform:`${info.Os}/${info.Architecture}`}
}
const stack=await createStudioStack({apiImage:image('api'),webImage:image('web'),normalApiStartup:true,enableMcp:true})
let compatibility
const record=message=>{result.checks.push(message);console.log(`RC1: ${message}`)}
async function waitApi(url){for(let i=0;i<240;i++){try{if((await fetch(url+'/public/website/desktop/config')).ok)return}catch{}await new Promise(r=>setTimeout(r,500))}throw Error('RC_API_NOT_READY')}
async function verifyMigrationHistory(){
  const migrations=await stack.pool.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name')
  const files=execFileSync('git',['ls-tree','-r','--name-only',revision,'prisma/migrations'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(p=>p.endsWith('/migration.sql'))
  const container=await stack.compose(['ps','-q','runly-api'])
  const shipped=JSON.parse(await command('docker',['exec',container,'node','--input-type=module','-e',"import{readFileSync,readdirSync}from'node:fs';import{createHash}from'node:crypto';const hash=v=>createHash('sha256').update(v).digest('hex');console.log(JSON.stringify(readdirSync('prisma/migrations').filter(n=>/^\\d/.test(n)).map(name=>{const b=readFileSync('prisma/migrations/'+name+'/migration.sql');return{name,hash:hash(b),normalized:hash(b.toString().replaceAll('\\r\\n','\\n'))}})))"]))
  assert.equal(migrations.rows.length,files.length)
  let eolVariants=0
  for(const file of files){const name=file.split('/').at(-2),row=migrations.rows.find(r=>r.migration_name===name),bytes=execFileSync('git',['show',`${revision}:${file}`]),artifact=shipped.find(r=>r.name===name);assert.ok(row?.finished_at&&!row.rolled_back_at);assert.equal(row.checksum,artifact?.hash,name);assert.equal(artifact.normalized,createHash('sha256').update(bytes.toString().replaceAll('\r\n','\n')).digest('hex'),name);if(artifact.hash!==createHash('sha256').update(bytes).digest('hex'))eolVariants++}
  assert.ok(migrations.rows.some(r=>r.migration_name==='20261205000000_studio_templates'))
  return {count:files.length,appliedChecksumsMatchImage:true,imageSqlMatchesGitExceptLineEndings:true,eolVariants}
}
async function changeConfiguration(change){
  assert.equal((await stack.pool.query('SELECT id FROM runly_studio_test.environment')).rows[0]?.id,stack.name)
  const config=JSON.parse(await readFile(stack.composeFile,'utf8'));await change(config);await writeFile(stack.composeFile,JSON.stringify(config,null,2))
}
try {
  console.log(`RC1 product snapshot ${revision}; project ${stack.name}`)
  await stack.compose(['up','-d','--wait','--wait-timeout','120','supabase-db','supabase-auth','supabase-rest','supabase-realtime','supabase-storage','supabase-kong'],{log:join(stack.directory,'startup.log')})
  await assert.rejects(stack.initialize(),/DISPOSABLE_DATABASE_NOT_VERIFIED/);await stack.verifyTarget()
  // The real image CMD runs all migrations + seed, with no node entrypoint bypass.
  await stack.compose(['up','-d','--no-deps','studio-catalog-test','runly-api'],{log:join(stack.directory,'normal-api-start.log')});await waitApi(stack.urls.api)
  result.migrations=await verifyMigrationHistory()
  const initialLog=await stack.compose(['logs','--no-color','runly-api']);assert.ok(initialLog.includes('Applying database migrations')&&initialLog.includes('Running seed'))
  record('Normal API image startup applies every migration and seed only on verified disposable Supabase')
  const countBefore=(await stack.pool.query('SELECT count(*)::int AS n FROM _prisma_migrations')).rows[0].n
  await changeConfiguration(config=>{config.services['runly-api'].environment.RUNLY_SKIP_DB_INIT='1'})
  await stack.compose(['up','-d','--force-recreate','runly-api'],{log:join(stack.directory,'skip-api-start.log')});await waitApi(stack.urls.api)
  const skipLog=await stack.compose(['logs','--no-color','runly-api']);assert.ok(skipLog.includes('Skipping migrations and seed'));assert.ok(!skipLog.includes('Applying database migrations'))
  assert.equal((await stack.pool.query('SELECT count(*)::int AS n FROM _prisma_migrations')).rows[0].n,countBefore)
  record('RUNLY_SKIP_DB_INIT=1 starts actual API image without migration/seed; history unchanged')
  const data=await seedStudioScenario(stack)
  await stack.compose(['up','-d','runly-web'],{log:join(stack.directory,'web-start.log')})
  const webContainer=await stack.compose(['ps','-q','runly-web']),webDir=join(stack.directory,'docker-web');await mkdir(webDir,{recursive:true})
  await command('docker',['cp',`${webContainer}:/usr/share/nginx/html/.`,webDir])
  result.bundle=await inspectStudioWeb(webDir,{forbiddenValues:[stack.secret.SUPABASE_SERVICE_ROLE_KEY,stack.secret.SUPABASE_JWT_SECRET,stack.secret.SUPABASE_POSTGRES_PASSWORD]})
  const fontFiles=await readdir(join(webDir,'studio-fonts'));assert.ok(['lato.ttf','lato-bold.ttf','lato-italic.ttf','pacifico.ttf'].every(f=>fontFiles.includes(f)))
  const runtime=await(await fetch(stack.urls.web+'/app/runtime-config.js')).text();assert.ok(runtime.includes(stack.urls.api)&&runtime.includes(stack.urls.kong));assert.ok(!runtime.includes(stack.secret.SUPABASE_SERVICE_ROLE_KEY))
  record('Actual nginx Web image injects isolated runtime config; fonts, lazy Studio/Fabric and public-only browser configuration verified')
  const rcTemplates=await verifyRcTemplates(stack,data);({compatibility}=rcTemplates);const {compatibility:_private,...publicTemplates}=rcTemplates;result.templates=publicTemplates
  result.mcp=await verifyRcMcp(stack,compatibility)
  if(!process.argv.includes('--focused')){
    result.general=await verifyStudioSupabase(stack,data)
    result.collaboration=await verifyStudioCollaboration(stack,data)
    result.resources=await verifyStudioResources(stack,data)
    result.composition=await verifyStudioComposition(stack,data)
    result.creative=await verifyStudioCreative(stack,data)
    result.photos=await verifyStudioPhotos(stack,data)
    result.shapePhotos=await verifyStudioPhotos(stack,data,{shape:true})
  }
  const previousPort=await unusedPort()
  await changeConfiguration(config=>{
    config.services['previous-api']={...config.services['runly-api'],image:previousImage,networks:{default:null},ports:[{target:4010,published:String(previousPort),host_ip:'127.0.0.1'}]}
    config.services['runly-worker']={image:image('worker'),pull_policy:'never',restart:'no',environment:{...config.services['runly-api'].environment},networks:{default:null}}
  })
  await stack.compose(['up','-d','previous-api'],{log:join(stack.directory,'previous-api-start.log')});const oldUrl=`http://127.0.0.1:${previousPort}`;await waitApi(oldUrl)
  const headers={Authorization:`Bearer ${compatibility.token}`,'X-Runly-Company-Id':compatibility.companyId,'Content-Type':'application/json'}
  const path=`/studio/designs/${compatibility.designId}`
  const current=await(await fetch(stack.urls.api+path,{headers})).json(),document=current.data.document
  const oldGet=await fetch(oldUrl+path,{headers});assert.equal(oldGet.status,400)
  const downlevel={...document,schemaVersion:4,objects:document.objects.map(({fillPaint,shape,startCap,endCap,...o})=>o)}
  const oldPut=await fetch(oldUrl+path,{method:'PUT',headers,body:JSON.stringify({name:current.data.name,revision:current.data.revision,document:downlevel})});assert.equal(oldPut.status,200)
  const lost=(await(await fetch(stack.urls.api+path,{headers})).json()).data
  assert.ok(document.objects.some(o=>o.fillPaint));assert.ok(!lost.document.objects.some(o=>o.fillPaint));assert.ok(!lost.document.objects.some(o=>o.shape));assert.ok(lost.document.objects.filter(o=>o.type==='line').every(o=>['none','arrow'].includes(o.endCap)))
  const restored=await fetch(stack.urls.api+path,{method:'PUT',headers,body:JSON.stringify({name:current.data.name,revision:lost.revision,document})});assert.equal(restored.status,200)
  result.compatibility={previousRef:'65c4587b',oldApiCanBootOnCurrentSchema:true,oldApiGetV5:oldGet.status,oldApiCanOverwriteWithV4:oldPut.status,v5PropertyLossConfirmed:true,restoredInDisposableDatabase:true,requiresCoordinatedUpgrade:true}
  record('Previous v4 API boots on migrated schema but rejects v5 reads; a current-revision v4 write loses fills/styles/caps. Loss demonstrated and restored only in disposable DB')
  const priorValidator=execFileSync('git',['show','42e09ba4:apps/shared/studio/document.js'],{encoding:'utf8'});const v3file=join(stack.directory,'v3-document.js');await writeFile(v3file,priorValidator)
  const oldContainer=await stack.compose(['ps','-q','previous-api']);await command('docker',['cp',v3file,`${oldContainer}:/app/apps/shared/studio/rc-v3-document.js`])
  const oldClient=await command('docker',['exec','-i',oldContainer,'node','--input-type=module','-e',"import{validateDocument as v4}from'./apps/shared/studio/document.js';import{validateDocument as v3}from'./apps/shared/studio/rc-v3-document.js';let s='';for await(const c of process.stdin)s+=c;const d=JSON.parse(s);const result={};for(const [k,f]of Object.entries({v3,v4})){try{f(d);result[k]='accepted'}catch{result[k]='rejected'}}console.log(JSON.stringify(result))"],{input:JSON.stringify(document)})
  result.compatibility.oldClientValidators=JSON.parse(oldClient);assert.deepEqual(result.compatibility.oldClientValidators,{v3:'rejected',v4:'rejected'})
  await stack.compose(['up','-d','runly-worker'],{log:join(stack.directory,'worker-start.log')});await new Promise(r=>setTimeout(r,5000))
  const workerId=await stack.compose(['ps','-q','runly-worker']);assert.ok(workerId);const [worker]=JSON.parse(await command('docker',['inspect',workerId]));assert.equal(worker.State.Running,true)
  const workerLog=await stack.compose(['logs','--no-color','runly-worker']);await writeFile(join(stack.directory,'worker-runtime.log'),workerLog);assert.ok(!/ERR_MODULE_NOT_FOUND|Cannot find package|SyntaxError/.test(workerLog))
  record('Worker image starts on isolated current schema with shared sources; no module/import errors')
  result.migrations=await verifyMigrationHistory();result.passed=true
} catch(error) {result.failure={message:error.message,stack:error.stack};throw error}
finally {await writeFile(join(stack.directory,'rc1-result.json'),JSON.stringify(result,null,2));await stack.close();console.log(JSON.stringify({artifact:stack.directory,passed:result.passed,checks:result.checks.length}))}
