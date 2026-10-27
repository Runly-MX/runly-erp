// Local-only transport benchmark. Does not claim full editor/UI validation.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import { createStudioStack } from './fixtures/studio/supabase-stack.mjs'
import { seedStudioScenario } from './fixtures/studio/supabase-data.mjs'

const require = createRequire(resolve('apps/api/package.json'))
const { build } = require('esbuild'), { createClient } = require('@supabase/supabase-js')
const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const phase = arg('phase') ?? 'before', seconds = Number(arg('seconds') ?? 60)
const counts = (arg('users') ?? '1,5,10').split(',').map(Number)
const modules = (arg('modules') ?? 'canvas,notes,chat').split(',')
const activities = (arg('activity') ?? 'idle,active').split(',')
assert.ok(['before', 'after'].includes(phase)); assert.ok(seconds >= 5 && seconds <= 1800)
assert.ok(counts.every(n => Number.isInteger(n) && n >= 1 && n <= 20))
assert.ok(modules.every(name => ['canvas', 'notes', 'chat'].includes(name)))
assert.ok(activities.every(name => ['idle', 'active'].includes(name)))
const image = arg('api-image')
assert.match(image ?? '', /^runly-realtime2:[a-zA-Z0-9_-]+$/)
const sourceRef = arg('source-ref')
if (sourceRef) assert.match(sourceRef, /^[a-f0-9]{7,40}$/)
const source = sourceRef ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const output = resolve('.artifacts/realtime-2', `${phase}-${Date.now()}`)
await mkdir(output, { recursive: true })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const stack = await createStudioStack({ apiImage: image })
let browser, server
const results = []
const percentile = (values, p) => values.length ? [...values].sort((a,b) => a-b)[Math.min(values.length-1, Math.floor(values.length*p))] : null
async function snapshot() {
  const containers = {}
  for (const service of ['runly-api', 'supabase-db', 'supabase-realtime']) {
    const id = await stack.compose(['ps', '-q', service])
    const stat = execFileSync('docker', ['exec', id, 'cat', '/sys/fs/cgroup/cpu.stat'], { encoding: 'utf8' })
    const memory = execFileSync('docker', ['exec', id, 'cat', '/sys/fs/cgroup/memory.current'], { encoding: 'utf8' })
    containers[service] = { cpuSeconds: Number(stat.match(/usage_usec (\d+)/)[1]) / 1e6, cgroupMemoryBytes: Number(memory) }
  }
  await stack.pool.query('SELECT pg_stat_clear_snapshot()')
  const tables = (await stack.pool.query("SELECT relname,n_tup_ins,n_tup_upd,n_tup_del FROM pg_stat_user_tables WHERE relname IN ('realtime_user_presence','notes','note_ydoc_state','canvas_object','chat_messages')")).rows
  const queries = (await stack.pool.query("SELECT queryid::text,query,calls::float8,total_exec_time FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND query NOT LIKE '%pg_stat_%'")).rows
  return { containers, tables, queries }
}
function difference(before, after) {
  return {
    cpuSeconds: Object.fromEntries(Object.entries(after.containers).map(([key, value]) => [key, value.cpuSeconds-before.containers[key].cpuSeconds])),
    cgroupMemoryBytes: Object.fromEntries(Object.entries(after.containers).map(([key,value]) => [key, { before: before.containers[key].cgroupMemoryBytes, after: value.cgroupMemoryBytes }])),
    tables: after.tables.map(row => ({ table: row.relname, ...Object.fromEntries(['n_tup_ins','n_tup_upd','n_tup_del'].map(key => [key, Number(row[key])-Number(before.tables.find(old=>old.relname===row.relname)?.[key]??0)])) })),
    // Keep normalized SQL only in ignored local artifacts, no parameter values.
    queries: after.queries.map(row => { const old=before.queries.find(value=>value.queryid===row.queryid);return { query: row.query, calls: row.calls-(old?.calls??0), ms: row.total_exec_time-(old?.total_exec_time??0), category: /realtime.*messages|runly_.*access|realtime_authorization_revision/.test(row.query)?'authorization': /^(INSERT|UPDATE|DELETE)/i.test(row.query)?'write': /^SELECT/i.test(row.query)?'read':'other' } }).filter(row=>row.calls>0),
  }
}
try {
  // Quiet WS joins must survive the 60 s benchmark. Production remains unchanged.
  const kongPath = join(stack.directory,'kong.yml')
  await writeFile(kongPath, (await readFile(kongPath,'utf8')).replace(/(  - name: realtime-v1-ws[\s\S]*?read_timeout:) 3000/, '$1 60000'))
  await stack.compose(['up','-d','--wait','--wait-timeout','120','supabase-db','supabase-auth','supabase-rest','supabase-realtime','supabase-storage','supabase-kong'], { log: join(output,'startup.log') })
  await stack.verifyTarget(); await stack.initialize()
  await stack.pool.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements')
  const data = await seedStudioScenario(stack), { users, companies } = data, company = companies[0]
  const actors = [users[0], users[2]]
  for (let i=2;i<Math.max(...counts);i++) {
    const email = `peer-${i}@realtime.example.test`
    const { data: auth, error } = await data.admin.auth.admin.createUser({ email, password: users[0].password, email_confirm: true })
    if(error) throw error
    const profile = (await stack.pool.query('INSERT INTO user_profile(id,auth_user_id,display_name,email,updated_at) VALUES(uuidv7(),$1,$2,$3,now()) RETURNING id', [auth.user.id, `Peer ${i}`, email])).rows[0]
    await stack.pool.query('INSERT INTO membership(id,company_id,user_id,role_id,updated_at) VALUES(uuidv7(),$1,$2,$3,now())',[company.id,profile.id,company.roleId])
    actors.push({ ...profile, email, password: users[0].password })
  }
  await stack.pool.query("INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key LIKE 'canvas.%' OR key LIKE 'notes.%' OR key LIKE 'chat.%' ON CONFLICT DO NOTHING",[company.roleId])
  await stack.pool.query("UPDATE runly_module SET enabled=true,status='INSTALLED' WHERE key IN ('runly.canvas','runly.notes','runly.chat')")
  const board = (await stack.pool.query("INSERT INTO canvas_board(company_id,owner_id,created_by_id,updated_by_id,name) VALUES($1,$2,$2,$2,'Benchmark') RETURNING id",[company.id,actors[0].id])).rows[0]
  const page = (await stack.pool.query("INSERT INTO canvas_page(board_id,name,position) VALUES($1,'Page',0) RETURNING id",[board.id])).rows[0]
  const note = (await stack.pool.query("INSERT INTO notes(company_id,owner_user_id,title) VALUES($1,$2,'Benchmark') RETURNING id",[company.id,actors[0].id])).rows[0]
  const conversation = (await stack.pool.query("INSERT INTO chat_conversations(company_id,created_by_user_id,type,title) VALUES($1,$2,'group','Benchmark') RETURNING id",[company.id,actors[0].id])).rows[0]
  for(const actor of actors) {
    if(actor!==actors[0]) {
      await stack.pool.query("INSERT INTO canvas_collaborator(board_id,user_id,role,created_by) VALUES($1,$2,'EDITOR',$3)",[board.id,actor.id,actors[0].id])
      await stack.pool.query("INSERT INTO note_shares(note_id,shared_with_user_id,shared_by_user_id,permission) VALUES($1,$2,$3,'edit')",[note.id,actor.id,actors[0].id])
    }
    await stack.pool.query("INSERT INTO chat_conversation_members(conversation_id,user_id) VALUES($1,$2)",[conversation.id,actor.id])
    const client=createClient(stack.urls.kong,stack.secret.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
    const {data:session,error}=await client.auth.signInWithPassword(actor); if(error)throw error
    actor.session=session.session
  }
  await stack.compose(['up','-d','runly-api'], { log: join(output,'api-start.log') })
  for(let attempt=0;;attempt++) { if(await fetch(stack.urls.api+'/public/website/desktop/config').then(r=>r.ok).catch(()=>false))break;if(attempt>=120)throw Error('API_NOT_READY');await wait(500) }
  const boundary=join(output,'boundary.js')
  await writeFile(boundary, `import{createClient}from'@supabase/supabase-js';import{createRunlyClient}from'${resolve('packages/sdk/src/index.js').replaceAll('\\','/')}';import{authorizeRealtimeClient}from'${resolve('apps/desktop/src/lib/authorizedRealtime.js').replaceAll('\\','/')}';let config,client;export let runly;export const useAuth=()=>({userProfile:{id:config.actorId,displayName:'Peer'},session:config.session});export const getApiUrl=()=>config.api;export const getSupabaseClient=()=>client;export async function configure(c){config=c;client=createClient(c.url,c.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});await client.auth.setSession(c.session);authorizeRealtimeClient(client);runly=createRunlyClient({baseUrl:c.api,getActiveCompanyId:()=>c.companyId})}`)
  const bundle=await build({entryPoints:['scripts/fixtures/realtime-2/browser.jsx'],bundle:true,write:false,platform:'browser',format:'esm',jsx:'automatic',nodePaths:[resolve('apps/desktop/node_modules')],plugins:[{name:'configuration',setup(b){
    b.onResolve({filter:/^realtime-2-boundary$|\/auth\/AuthProvider(?:\.jsx)?$|\/lib\/supabase\.js$|\/runtimeConfig\.js$/},()=>({path:boundary}))
    if(sourceRef)b.onLoad({filter:/apps[\\/]desktop[\\/]src[\\/].*\.(js|jsx)$/},({path})=>({contents:execFileSync('git',['show',`${sourceRef}:${path.slice(resolve('.').length+1).replaceAll('\\','/')}`],{encoding:'utf8'}),loader:path.endsWith('.jsx')?'jsx':'js'}))
  }}]})
  server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle.outputFiles[0].contents:'<!doctype html><div id="root"></div><script type="module" src="/fixture.js"></script>')})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  browser=await chromium.launch({channel:'chrome',headless:true})
  for(const module of modules) for(const n of counts) for(const activity of activities) {
    const active = activity === 'active'
    const contexts=[],pages=[],pending=[],metrics={http:{},wsSent:0,wsReceived:0,wsBytesSent:0,wsBytesReceived:0,httpBodyBytes:0,httpTransferBytes:0,httpErrors:0,latencies:[]}
    let recording=false
    for(let i=0;i<n;i++) {
      const context=await browser.newContext(),p=await context.newPage();contexts.push(context);pages.push(p)
      p.on('pageerror',error=>{throw error})
      const cdp=await context.newCDPSession(p);await cdp.send('Network.enable')
      for(const [event,direction]of [['Network.webSocketFrameSent','Sent'],['Network.webSocketFrameReceived','Received']])cdp.on(event,e=>{if(recording){metrics[`ws${direction}`]++;metrics[`wsBytes${direction}`]+=Buffer.byteLength(e.response.payloadData,e.response.opcode===2?'base64':'utf8')}})
      p.on('requestfinished',request=>{if(!recording||!request.url().startsWith(stack.urls.api))return;const key=request.method()+' '+new URL(request.url()).pathname;metrics.http[key]=(metrics.http[key]??0)+1;metrics.latencies.push(request.timing().responseEnd);pending.push((async()=>{const response=await request.response();if(!response.ok())metrics.httpErrors++;metrics.httpBodyBytes+=Buffer.byteLength(request.postData()??'')+(await response.body()).length;const s=await request.sizes();metrics.httpTransferBytes+=s.requestBodySize+s.requestHeadersSize+s.responseBodySize+s.responseHeadersSize})().catch(()=>{}))})
      await p.goto(`http://127.0.0.1:${server.address().port}`);await p.waitForFunction(()=>!!window.start)
      await p.evaluate(input=>window.start(input),{module,api:stack.urls.api,url:stack.urls.kong,key:stack.secret.SUPABASE_ANON_KEY,session:actors[i].session,token:actors[i].session.access_token,actorId:actors[i].id,companyId:company.id,boardId:board.id,pageId:page.id,noteId:note.id,conversationId:conversation.id})
      await p.waitForFunction(()=>window.state().ready,null,{timeout:25000})
    }
    if(module !== 'notes') for(const p of pages) await p.waitForFunction(({n,module})=>window.state().peers >= (module==='canvas'?n-1:n),{n,module},{timeout:20000})
    await wait(1200)
    const stateBefore=await Promise.all(pages.map(p=>p.evaluate(()=>window.state())))
    const before=await snapshot(),begin=Date.now(); recording=true
    if(active)await Promise.all(pages.map(p=>p.evaluate(()=>window.active())))
    await wait(seconds*1000)
    await Promise.all(pages.map(p=>p.evaluate(()=>window.pause())));await wait(500);recording=false;await Promise.all(pending)
    const elapsedSeconds=(Date.now()-begin)/1000,after=await snapshot(),stateAfter=await Promise.all(pages.map(p=>p.evaluate(()=>window.state())))
    const deliveryLatencies=module==='canvas'?(await Promise.all(pages.map(p=>p.evaluate(()=>window.latencies())))).flat():[]
    const converged=module==='notes'?stateAfter.every(s=>s.text===stateAfter[0].text):null
    const result={module,users:n,active,requestedSeconds:seconds,elapsedSeconds,converged,metrics:{...metrics,p50:percentile(metrics.latencies,.5),p95:percentile(metrics.latencies,.95),deliveryP50:percentile(deliveryLatencies,.5),deliveryP95:percentile(deliveryLatencies,.95)},resources:difference(before,after),stateBefore,stateAfter}
    delete result.metrics.latencies
    results.push(result)
    await writeFile(join(output,'results.json'),JSON.stringify({phase,source,image,stack:stack.name,scope:'production transports; not full editors',results},null,2))
    console.log(JSON.stringify({module,users:n,active,http:metrics.http,cpu:result.resources.cpuSeconds,httpErrors:metrics.httpErrors}))
    for(const p of pages)await p.evaluate(()=>window.stop())
    for(const context of contexts)await context.close()
    await wait(1000)
  }
} catch(error) {
  await writeFile(join(output,'failure.json'),JSON.stringify({message:error.message,source,phase},null,2))
  throw error
} finally {
  await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await stack.close()
}
