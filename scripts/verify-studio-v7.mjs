// Immutable local candidate: API + actual nginx Web + Worker, one Git revision.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {createStudioStack,command} from './fixtures/studio/supabase-stack.mjs'
import {seedStudioScenario} from './fixtures/studio/supabase-data.mjs'
import {verifyStudioOperations} from './fixtures/studio/supabase-operations.mjs'
import {verifyStudioGradients} from './fixtures/studio/supabase-gradients.mjs'
import {verifyStudioPhotos} from './fixtures/studio/supabase-photos.mjs'
import {verifyRc2Exports} from './fixtures/studio/rc2-exports.mjs'
import {measureRc2Receipts} from './fixtures/studio/rc2-receipts.mjs'
import {verifyStudioMultipage} from './fixtures/studio/supabase-multipage.mjs'
import {verifyV7Compatibility} from './fixtures/studio/v7-compatibility.mjs'
import {inspectStudioWeb} from './lib/studio-web-verification.mjs'
import {verifyStudioFinalUi} from './fixtures/studio/final-ui.mjs'
const arg=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)
const phase=arg('phase')??'all'
assert.ok(['all','multipage','exports','compatibility','receipts','ui'].includes(phase))
const revision=execFileSync('git',['rev-parse','--verify',arg('revision')??'HEAD'],{encoding:'utf8'}).trim(),short=revision.slice(0,8)
const image=kind=>`runly-studio-v7:${short}-${kind}`,result={revision,phase,passed:false,checks:[],images:{}}
for(const kind of ['api','web','worker']){const [info]=JSON.parse(await command('docker',['image','inspect',image(kind)]));assert.equal(info.Config.Labels['org.opencontainers.image.revision'],revision);result.images[kind]={tag:image(kind),id:info.Id}}
const stack=await createStudioStack({apiImage:image('api'),webImage:image('web'),normalApiStartup:true,enableMcp:true})
const record=message=>{result.checks.push(message);console.log(`Studio v7: ${message}`)}
async function ready(){for(let i=0;i<240;i++){try{if((await fetch(stack.urls.api+'/public/website/desktop/config')).ok)return}catch{}await new Promise(r=>setTimeout(r,500))}throw Error('Studio v7 API did not start')}
async function history(){
  const files=execFileSync('git',['ls-tree','-r','--name-only',revision,'prisma/migrations'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(f=>f.endsWith('/migration.sql'))
  const rows=(await stack.pool.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations')).rows
  const id=await stack.compose(['ps','-q','runly-api'])
  const shipped=JSON.parse(await command('docker',['exec',id,'node','--input-type=module','-e',"import{readFileSync,readdirSync}from'node:fs';import{createHash}from'node:crypto';const hash=v=>createHash('sha256').update(v).digest('hex');console.log(JSON.stringify(readdirSync('prisma/migrations').filter(n=>/^\\d/.test(n)).map(name=>{const b=readFileSync('prisma/migrations/'+name+'/migration.sql');return{name,raw:hash(b),normalized:hash(b.toString().replaceAll('\\r\\n','\\n'))}})))"]))
  assert.equal(files.length,rows.length)
  for(const file of files){const name=file.split('/').at(-2),row=rows.find(r=>r.migration_name===name),asset=shipped.find(r=>r.name===name),blob=execFileSync('git',['show',`${revision}:${file}`],{encoding:'utf8'});assert.ok(row?.finished_at&&!row.rolled_back_at);assert.equal(row.checksum,asset.raw,name);assert.equal(asset.normalized,createHash('sha256').update(blob.replaceAll('\r\n','\n')).digest('hex'),name)}
  return {count:files.length,checksumsMatchImage:true,normalizedSqlMatchesGit:true}
}
try{
  await stack.compose(['up','-d','--wait','--wait-timeout','120','supabase-db','supabase-auth','supabase-rest','supabase-realtime','supabase-storage','supabase-kong'],{log:join(stack.directory,'startup.log')})
  await stack.verifyTarget()
  await stack.compose(['up','-d','runly-api','studio-catalog-test'],{log:join(stack.directory,'normal-api-start.log')});await ready()
  result.migrations=await history();record('Normal API startup applied all migrations and seed only on identity-checked fresh Supabase; SQL/history match the immutable image')
  const data=await seedStudioScenario(stack)
  await stack.compose(['up','-d','runly-web'],{log:join(stack.directory,'web-start.log')})
  const webContainer=await stack.compose(['ps','-q','runly-web']),webDir=join(stack.directory,'docker-web');await mkdir(webDir,{recursive:true});await command('docker',['cp',`${webContainer}:/usr/share/nginx/html/.`,webDir])
  result.bundle=await inspectStudioWeb(webDir,{forbiddenValues:[stack.secret.SUPABASE_SERVICE_ROLE_KEY,stack.secret.SUPABASE_JWT_SECRET,stack.secret.SUPABASE_POSTGRES_PASSWORD]})
  record('Actual nginx Web image: isolated runtime config, no server secrets, lazy Studio/Fabric')
  if(['all','multipage'].includes(phase)){result.multipage=await verifyStudioMultipage(stack,data);result.multipagePdf=JSON.parse(await command('python',['scripts/fixtures/studio/v7-inspect-pdf.py',stack.directory]))}
  if(phase==='all'){
  result.operations=await verifyStudioOperations(stack,data)
  record(`${result.operations.checks.length} collaboration/receipt/template/security groups passed`)
  result.gradients=await verifyStudioGradients(stack,data)
  record(`${result.gradients.checks.length} gradient groups passed`)
  result.photos=await verifyStudioPhotos(stack,data)
  record(`${result.photos.checks.length} photo groups passed`)
  result.shapePhotos=await verifyStudioPhotos(stack,data,{shape:true})
  record(`${result.shapePhotos.checks.length} shape photo groups passed`)
  }
  if(['all','exports'].includes(phase)){
  result.exports=await verifyRc2Exports(stack,data)
  result.pdf=JSON.parse(await command('python',['scripts/fixtures/studio/rc2-inspect-pdf.py',stack.directory]))
  record('Independent PDF inspection/rasterization validates RGB/CMYK, real effective PPI, physical boxes, flattened alpha and crop marks')
  }
  if(['all','receipts'].includes(phase))result.receipts=await measureRc2Receipts(stack,data,{duration:Number(arg('receipt-duration-ms')??120000)})
  if(['all','ui'].includes(phase)){result.finalUi=await verifyStudioFinalUi(stack,data);record(`${result.finalUi.checks.length} final collaboration/export UI checks passed`)}
  if(['all','compatibility'].includes(phase))result.compatibility=await verifyV7Compatibility(stack,data)
  const config=JSON.parse(await readFile(stack.composeFile,'utf8'));config.services['runly-worker']={image:image('worker'),pull_policy:'never',restart:'no',environment:{...config.services['runly-api'].environment,RUNLY_SKIP_DB_INIT:'1'},networks:{default:null}};await writeFile(stack.composeFile,JSON.stringify(config,null,2))
  await stack.compose(['up','-d','runly-worker'],{log:join(stack.directory,'worker-start.log')});await new Promise(r=>setTimeout(r,5000))
  const workerId=await stack.compose(['ps','-q','runly-worker']),[worker]=JSON.parse(await command('docker',['inspect',workerId]));assert.equal(worker.State.Running,true)
  const workerLog=await stack.compose(['logs','--no-color','runly-worker']);assert.ok(!/ERR_MODULE_NOT_FOUND|Cannot find package|SyntaxError/.test(workerLog));record('Worker of the same revision starts on isolated schema without import errors')
  result.migrations=await history();result.passed=true
}catch(error){result.failure={message:error.message,stack:error.stack};throw error}
finally{await writeFile(join(stack.directory,'v7-result.json'),JSON.stringify(result,null,2));await stack.close();console.log(JSON.stringify({artifact:stack.directory,passed:result.passed}))}
