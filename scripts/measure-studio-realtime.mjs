// Reproducible Chrome + real isolated Supabase/API benchmark. No .env or shared DB.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import { createStudioStack } from './fixtures/studio/supabase-stack.mjs'
import { seedStudioScenario } from './fixtures/studio/supabase-data.mjs'
import { blankDocument, appendObject } from '../apps/shared/studio/document.js'
import { verifyStudioRealtimeSecurity } from './fixtures/studio/realtime-security.mjs'
import { useStudioRealtimeSource } from './fixtures/studio/realtime-source.mjs'
const apiRequire = createRequire(resolve('apps/api/package.json'))
const { build } = apiRequire('esbuild'), { createClient } = apiRequire('@supabase/supabase-js')
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const phase = arg('phase') ?? 'before', seconds = Number(arg('seconds') ?? 60), apiImage = arg('api-image')
assert.ok(['before','after'].includes(phase)); assert.ok(seconds >= 5 && seconds <= 300); assert.match(apiImage ?? '', /^runly-studio[^:]*:[a-zA-Z0-9_.-]+$/)
if(arg('result'))assert.match(arg('result'),/^[a-zA-Z0-9_-]+$/)
if(arg('source-ref'))assert.match(arg('source-ref'),/^[a-fA-F0-9]{7,40}$/)
const output = resolve('.artifacts/studio/realtime'), results = []
await mkdir(output, { recursive: true })
const wait = ms => new Promise(r => setTimeout(r, ms))
const stack = await createStudioStack({ apiImage, enableMcp: true })
let browser, server
async function cpu(service) {
  const container = await stack.compose(['ps','-q',service])
  const stat = execFileSync('docker',['exec',container,'cat','/sys/fs/cgroup/cpu.stat'],{encoding:'utf8'})
  return Number(stat.match(/usage_usec (\d+)/)[1]) / 1e6
}
async function sql() {
  await stack.pool.query('SELECT pg_stat_clear_snapshot()')
  const table = (await stack.pool.query("SELECT n_tup_ins,n_tup_upd,n_tup_del,seq_scan,idx_scan FROM pg_stat_user_tables WHERE relname='studio_presence'")).rows[0]
  const queries = (await stack.pool.query("SELECT queryid::text,query,calls::int,total_exec_time FROM pg_stat_statements WHERE query ~* 'studio_presence|studio_design|realtime_authorization_revision' AND query NOT LIKE '%pg_stat_%'")).rows
  const totals=(await stack.pool.query("SELECT sum(calls)::bigint calls,sum(total_exec_time) ms,sum(rows)::bigint rows FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND query NOT LIKE '%pg_stat_%'")).rows[0]
  const realtime=(await stack.pool.query("SELECT sum(calls)::bigint calls,sum(total_exec_time) ms FROM pg_stat_statements WHERE query LIKE '%realtime%messages%' AND query NOT LIKE '%pg_stat_%'")).rows[0]
  return { table, queries,totals,realtime }
}
function sqlDelta(before, after) {
  const table = Object.fromEntries(Object.entries(after.table).map(([k,v]) => [k,Number(v)-Number(before.table[k])]))
  const queries = after.queries.map(q => { const old = before.queries.find(o => o.queryid === q.queryid); return { query: q.query, calls: q.calls - (old?.calls ?? 0), ms: q.total_exec_time - (old?.total_exec_time ?? 0) } }).filter(q => q.calls)
  return { table, queries,totals:Object.fromEntries(Object.entries(after.totals).map(([k,v])=>[k,Number(v)-Number(before.totals[k])])),realtimeAuthorization:Object.fromEntries(Object.entries(after.realtime).map(([k,v])=>[k,Number(v)-Number(before.realtime[k])])),presenceReads: queries.filter(q => /^SELECT.*FROM studio_presence/is.test(q.query)).reduce((n,q) => n+q.calls,0), revisionReads: queries.filter(q => /SELECT revision.*realtime_authorization_revision/is.test(q.query)).reduce((n,q) => n+q.calls,0) }
}
const percentile = (values, p) => values.length ? [...values].sort((a,b) => a-b)[Math.min(values.length-1,Math.floor(values.length*p))] : null
try {
  if(arg('events-per-second')||arg('bytes-per-second')){
    const events=Number(arg('events-per-second')??2000),bytes=Number(arg('bytes-per-second')??2000000)
    assert.ok(Number.isInteger(events)&&events>=100&&events<=100000)
    assert.ok(Number.isInteger(bytes)&&bytes>=100000&&bytes<=100000000)
    const config=JSON.parse(await readFile(stack.composeFile,'utf8'))
    assert.equal(config.name,stack.name)
    Object.assign(config.services['supabase-realtime'].environment,{TENANT_MAX_EVENTS_PER_SECOND:String(events),TENANT_MAX_BYTES_PER_SECOND:String(bytes)})
    await writeFile(stack.composeFile,JSON.stringify(config,null,2))
  }
  // Generic fault fixtures use 3 s HTTP timeouts. Preserve Kong's normal
  // 60 s WebSocket idle budget for intentionally quiet native Presence.
  const kongPath=join(stack.directory,'kong.yml'),kong=await readFile(kongPath,'utf8')
  const websocketKong=kong.replace(/(  - name: realtime-v1-ws[\s\S]*?read_timeout:) 3000/, '$1 60000')
  assert.notEqual(websocketKong,kong,'Expected explicit WebSocket fixture timeout')
  await writeFile(kongPath,websocketKong)
  await stack.compose(['up','-d','--wait','--wait-timeout','120','supabase-db','supabase-auth','supabase-rest','supabase-realtime','supabase-storage','supabase-kong'],{log:join(stack.directory,'startup.log')})
  await stack.verifyTarget(); await stack.initialize()
  await stack.pool.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements')
  const data = await seedStudioScenario(stack), { users, companies, admin } = data, company = companies[0]
  for (let i=users.length; i<(arg('scenario')?.includes('cursor-20')?22:12); i++) {
    const email = `bench-${i}@studio.example.test`, password = users[0].password
    const result = await admin.auth.admin.createUser({email,password,email_confirm:true}); assert.ok(!result.error)
    const profile = (await stack.pool.query('INSERT INTO user_profile(id,auth_user_id,display_name,email,updated_at) VALUES(uuidv7(),$1,$2,$3,now()) RETURNING id',[result.data.user.id,`Bench ${i}`,email])).rows[0]
    await stack.pool.query('INSERT INTO membership(id,company_id,user_id,role_id,updated_at) VALUES(uuidv7(),$1,$2,$3,now())',[company.id,profile.id,company.roleId])
    users.push({...profile,authId:result.data.user.id,email,password})
  }
  const authSessions=[]
  const tokens = await Promise.all(users.map(async (u,index) => {
    const auth = createClient(stack.urls.kong,stack.secret.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
    const response = await auth.auth.signInWithPassword({email:u.email,password:u.password}); assert.ok(!response.error);authSessions[index]=response.data.session; return response.data.session.access_token
  }))
  if (phase === 'after') {
    await useStudioRealtimeSource(stack)
  }
  await stack.compose(['up','-d','runly-api'],{log:join(stack.directory,'api-start.log')})
  for(let attempt=0;;attempt++){if(await fetch(stack.urls.api+'/public/website/desktop/config').then(r=>r.ok).catch(()=>false))break;if(attempt>=90)throw Error('API_NOT_READY');await wait(500)}
  const api = async (path,body,actor=0) => {
    const response = await fetch(stack.urls.api+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${tokens[actor]}`,'X-Runly-Company-Id':company.id,'X-Runly-Studio-Protocol':'3','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
    const result = await response.json(); assert.ok(response.ok,JSON.stringify(result)); return result.data
  }
  let doc = appendObject(blankDocument(320,240),'rectangle',{id:'shape-1',x:10,y:10,width:80,height:60})
  const page = appendObject(blankDocument(320,240),'rectangle',{id:'shape-2',x:10,y:10,width:80,height:60}); doc.additionalPages=[{page:{...page.page,id:'page-2'},objects:page.objects}]
  const design = await api('/studio/designs',{name:'Realtime benchmark',document:doc})
  const actors = [0,2,...Array.from({length:users.length-4},(_,i)=>i+4)]
  for(const actor of actors.slice(1)) await fetch(`${stack.urls.api}/studio/designs/${design.id}/collaborators`,{method:'PUT',headers:{Authorization:`Bearer ${tokens[0]}`,'X-Runly-Company-Id':company.id,'Content-Type':'application/json'},body:JSON.stringify({userId:users[actor].id,role:'EDITOR'})}).then(async r=>assert.ok(r.ok,await r.text()))
  if(process.argv.includes('--security')){const result=await verifyStudioRealtimeSecurity(stack,data,tokens,design);await writeFile(join(output,'security.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))}
  const boundary = `import {createRunlyClient} from '${resolve('packages/sdk/src/index.js').replaceAll('\\','/')}';import{createClient as nativeClient}from'@supabase/supabase-js';let api,client,config;export const createClient=(...args)=>{const c=nativeClient(...args);(window.studioSockets??=[]).push(c);return c};export const createIsolatedRealtimeClient=getToken=>createClient(config.url,config.key,{accessToken:async()=>getToken(),auth:{persistSession:false,autoRefreshToken:false}});export const updateToken=async token=>{config.token=token;await client.realtime.setAuth(token)};export const runly=new Proxy({},{get:(_,p)=>api[p]});export const supabase=new Proxy({},{get:(_,p)=>typeof client[p]==='function'?client[p].bind(client):client[p]});export async function configure(c){const reuse=client&&config?.url===c.url&&config?.key===c.key;config=c;api=createRunlyClient({baseUrl:c.api,getActiveCompanyId:()=>c.companyId});if(!reuse)client=nativeClient(c.url,c.key,{accessToken:async()=>config.token,auth:{persistSession:false,autoRefreshToken:false}});await client.realtime.setAuth(c.token);}`
  const boundaryPath = join(output,'boundary.js'); await writeFile(boundaryPath,boundary)
  const sourceRef=arg('source-ref'),legacySource=sourceRef?execFileSync('git',['show',`${sourceRef}:apps/desktop/src/modules/runly.studio/hooks/useStudioRealtime.js`],{encoding:'utf8'}):null
  const compiled = await build({entryPoints:['scripts/fixtures/studio/realtime-browser.jsx'],bundle:true,platform:'browser',format:'esm',write:false,nodePaths:[resolve('apps/desktop/node_modules')],plugins:[{name:'fixture-boundary',setup(b){b.onResolve({filter:/studio-realtime-boundary|\/lib\/(runly|supabase)\.js$/},()=>({path:boundaryPath}));b.onResolve({filter:/^@supabase\/supabase-js$/},args=>args.importer.endsWith('useStudioRealtime.js')?{path:boundaryPath}:null);if(legacySource)b.onLoad({filter:/useStudioRealtime\.js$/},()=>({contents:legacySource,loader:'js'}))}}]})
  server = createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?compiled.outputFiles[0].contents:'<!doctype html><div id="root"></div><script type="module" src="/fixture.js"></script>')})
  await new Promise(r=>server.listen(0,'127.0.0.1',r)); const url=`http://127.0.0.1:${server.address().port}`
  const nativeLifecycle=process.argv.includes('--native-lifecycle')
  browser=await chromium.launch({channel:'chrome',headless:!nativeLifecycle,
    ...(nativeLifecycle?{ignoreDefaultArgs:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']}:{}),
    args:nativeLifecycle?['--window-position=-32000,-32000']:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows']})
  if(process.argv.includes('--e2e')){
    const {verifyStudioRealtimeBrowser}=await import('./fixtures/studio/realtime-e2e.mjs')
    const outageSeconds=Number(arg('outage-seconds')??30);assert.ok(outageSeconds>=30&&outageSeconds<=180)
    const result=await verifyStudioRealtimeBrowser({stack,data,tokens,authSessions,design,browser,url,outageMs:outageSeconds*1000,nativeLifecycle})
    await writeFile(join(output,'e2e.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
  }
  const scenarios=[{name:'idle-1',n:1},{name:'cursor-1',n:1,move:true},{name:'editing-2',n:2,move:true,edit:true},{name:'cursor-5',n:5,move:true},{name:'cursor-10',n:10,move:true},{name:'different-pages',n:2,move:true,pages:true},{name:'same-user-tabs',n:2,move:true,same:true},{name:'hidden',n:1,move:true,hidden:true},...(arg('scenario')?.includes('cursor-20')?[{name:'cursor-20',n:20,move:true}]:[])]
  for(const scenario of scenarios.filter(s=>!arg('scenario')||arg('scenario').split(',').includes(s.name))) {
    const contexts=[],pages=[],metrics={live:0,current:0,revision:0,context:0,httpBytes:0,httpTransferBytes:0,wsSent:0,wsReceived:0,wsBytesSent:0,wsBytesReceived:0,latencies:[],cursorLatencies:[],joinMs:[]},tasks=[]
    let recording=false
    for(let i=0;i<scenario.n;i++) {
      const context=await browser.newContext(),page=await context.newPage();contexts.push(context);pages.push(page)
      page.on('pageerror',error=>console.error('Browser error:',error.message))
      page.on('response',response=>{if(response.url().endsWith('/collaboration')&&!response.ok())void response.text().then(body=>console.error('Context rejected:',response.status(),body))})
      const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Performance.enable');page.cdp=cdp
      cdp.on('Network.webSocketFrameSent',e=>{if(recording){metrics.wsSent++;metrics.wsBytesSent+=Buffer.byteLength(e.response.payloadData,e.response.opcode===2?'base64':'utf8')}})
      cdp.on('Network.webSocketFrameReceived',e=>{if(recording){metrics.wsReceived++;metrics.wsBytesReceived+=Buffer.byteLength(e.response.payloadData,e.response.opcode===2?'base64':'utf8')}})
      page.on('requestfinished',request=>{if(!recording||!request.url().startsWith(stack.urls.api))return;const pathname=new URL(request.url()).pathname;if(pathname.endsWith('/live'))metrics.live++;if(/current|\/designs\/[^/]+$/.test(pathname))metrics.current++;if(/revision|protocol/.test(pathname))metrics.revision++;if(/collaboration/.test(pathname))metrics.context++;const timing=request.timing();if(timing.responseEnd>=0)metrics.latencies.push(timing.responseEnd);tasks.push(request.response().then(async r=>{metrics.httpBytes+=Buffer.byteLength(request.postData()??'')+(await r.body()).length;const sizes=await request.sizes();metrics.httpTransferBytes+=sizes.requestBodySize+sizes.requestHeadersSize+sizes.responseBodySize+sizes.responseHeadersSize}).catch(()=>{}))})
      await page.goto(url);await page.waitForFunction(()=>!!window.start)
      const actor=scenario.same?0:actors[i],start=Date.now()
      await page.evaluate(input=>window.start(input),{api:stack.urls.api,url:stack.urls.kong,key:stack.secret.SUPABASE_ANON_KEY,token:tokens[actor],companyId:company.id,actorId:users[actor].id,designId:design.id})
      try{await page.waitForFunction(()=>window.state().status==='Conectado',{},{timeout:20000})}catch(error){console.error('Connection state:',await page.evaluate(()=>window.state()));throw error}metrics.joinMs.push(Date.now()-start)
    }
    await wait(1500)
    if(phase==='after')for(const page of pages)await page.waitForFunction(n=>window.state().participants.length===n-1,scenario.n,{timeout:20000})
    const diagnosticsBefore=await Promise.all(pages.map(p=>p.evaluate(()=>window.state().diagnostics)))
    const before=await sql(),apiCpu=await cpu('runly-api'),pgCpu=await cpu('supabase-db'),realtimeCpu=await cpu('supabase-realtime'),browserBefore=await Promise.all(pages.map(p=>p.cdp.send('Performance.getMetrics')))
    recording=true
    for(const [i,page]of pages.entries())if(scenario.move)await page.evaluate(pageId=>window.move(pageId),scenario.pages&&i?'page-2':'page-1')
    if(scenario.hidden)await pages[0].evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))})
    const begin=Date.now();let batch=0
    while(Date.now()-begin<seconds*1000){await wait(1000);if(scenario.edit){batch++;await Promise.all(pages.map(p=>p.evaluate(n=>window.edit(n),batch)))}}
    recording=false;await Promise.all(pages.map(p=>p.evaluate(()=>window.pause())));await Promise.all(tasks)
    const after=await sql(),apiCpuAfter=await cpu('runly-api'),pgCpuAfter=await cpu('supabase-db'),realtimeCpuAfter=await cpu('supabase-realtime'),browserAfter=await Promise.all(pages.map(p=>p.cdp.send('Performance.getMetrics')))
    const pointLogs=await Promise.all(pages.map(p=>p.evaluate(()=>({sent:window.sentPoints,received:window.receivedPoints}))))
    metrics.diagnosticsBefore=diagnosticsBefore
    metrics.diagnostics=await Promise.all(pages.map(p=>p.evaluate(()=>window.state().diagnostics)))
    const sentPoints=new Map(),pointKey=p=>`${p.userId}:${p.x}:${p.y}`
    for(const p of pointLogs.flatMap(l=>l.sent??[])){const key=pointKey(p),list=sentPoints.get(key)??[];list.push(p.at);sentPoints.set(key,list)}
    for(const point of pointLogs.flatMap(l=>l.received??[])){const list=sentPoints.get(pointKey(point))??[];let at=-1;for(let i=list.length-1;i>=0;i--)if(list[i]<=point.at){at=list[i];break}if(at>=0)metrics.cursorLatencies.push(point.at-at)}
    const browserMetrics=browserAfter.map((m,i)=>{const get=(a,n)=>a.metrics.find(v=>v.name===n)?.value??0;return{taskSeconds:get(m,'TaskDuration')-get(browserBefore[i],'TaskDuration'),heapBytes:get(m,'JSHeapUsedSize')}})
    const result={scenario:scenario.name,users:scenario.n,seconds,visibility:await pages[0].evaluate(()=>document.visibilityState),syntheticVisibility:Boolean(scenario.hidden),livePerMinute:metrics.live*60/seconds,...metrics,p50:percentile(metrics.latencies,.5),p95:percentile(metrics.latencies,.95),cursorP50:percentile(metrics.cursorLatencies,.5),cursorP95:percentile(metrics.cursorLatencies,.95),apiCpuSeconds:apiCpuAfter-apiCpu,postgresCpuSeconds:pgCpuAfter-pgCpu,realtimeCpuSeconds:realtimeCpuAfter-realtimeCpu,sql:sqlDelta(before,after),browser:browserMetrics}
    delete result.latencies;delete result.cursorLatencies;results.push(result)
    console.log(JSON.stringify({scenario:result.scenario,livePerMinute:result.livePerMinute,p95:result.p95,writes:result.sql.table.n_tup_ins+result.sql.table.n_tup_upd,wsSent:result.wsSent}))
    for(const page of pages)await page.evaluate(()=>window.stop());for(const context of contexts)await context.close();await wait(1000)
    await writeFile(join(output,`${arg('result')??phase}.json`),JSON.stringify({phase,seconds,source:sourceRef??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),apiImage,capacity:{eventsPerSecond:Number(arg('events-per-second')??2000),bytesPerSecond:Number(arg('bytes-per-second')??2000000)},results},null,2))
  }
} finally {await browser?.close();if(server)await new Promise(r=>server.close(r));await stack.close()}
