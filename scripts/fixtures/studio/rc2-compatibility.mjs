import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {chromium} from 'playwright'
import {command,unusedPort} from './supabase-stack.mjs'
import {blankDocument,appendObject} from '../../../apps/shared/studio/document.js'
import {selectLayer,insertText} from './editor-controls.mjs'
const pause=ms=>new Promise(r=>setTimeout(r,ms))
async function ready(url){for(let n=0;n<180;n++){try{if((await fetch(url+'/public/website/desktop/config')).ok)return}catch{}await pause(500)}throw Error('Compatibility API did not start')}
export async function verifyRc2Compatibility(stack,{users,companies},{apiImage,webImage}){
  const owner=users[0],company=companies[0],checks=[]
  const login=await fetch(stack.urls.api+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:owner.email,password:owner.password})}),token=(await login.json()).data.access_token
  const headers={Authorization:`Bearer ${token}`,'X-Runly-Company-Id':company.id,'Content-Type':'application/json','X-Runly-Studio-Protocol':'2'}
  const make=async doc=>{const r=await fetch(stack.urls.api+'/studio/designs',{method:'POST',headers,body:JSON.stringify({name:'RC2 compatibility',document:doc})});assert.equal(r.status,201);return(await r.json()).data}
  const record=await make(appendObject(blankDocument(),'rectangle',{fillPaint:{type:'gradient',gradientType:'linear',angle:45,stops:[{offset:0,color:'#d946ef',opacity:1},{offset:1,color:'#7945f5',opacity:1}]}}))
  const path=`/studio/designs/${record.id}`,oldApiPort=await unusedPort(),oldWebPort=await unusedPort(),oldUrl=`http://127.0.0.1:${oldApiPort}`,oldWeb=`http://127.0.0.1:${oldWebPort}`
  let config=JSON.parse(await readFile(stack.composeFile,'utf8'))
  config.services['previous-api']={...config.services['runly-api'],image:'runly-studio-rc1:32fe936c-api',entrypoint:['node','apps/api/src/index.js'],environment:{...config.services['runly-api'].environment,RUNLY_SKIP_DB_INIT:'1'},ports:[{target:4010,published:String(oldApiPort),host_ip:'127.0.0.1'}],networks:{default:null}}
  config.services['previous-web']={...config.services['runly-web'],image:'runly-studio-rc1:32fe936c-web',environment:{...config.services['runly-web'].environment,RUNLY_API_URL:oldUrl},ports:[{target:80,published:String(oldWebPort),host_ip:'127.0.0.1'}]}
  await writeFile(stack.composeFile,JSON.stringify(config,null,2));await stack.compose(['up','-d','previous-api','previous-web'],{log:join(stack.directory,'compatibility-old-start.log')});await ready(oldUrl)
  const downlevel={...record.document,schemaVersion:5,objects:record.document.objects.map(({fillPaint,...o})=>o)}
  const oldWrite=await fetch(oldUrl+path,{method:'PUT',headers,body:JSON.stringify({name:record.name,revision:record.revision,document:downlevel})});assert.ok(!oldWrite.ok)
  const fresh=async()=> (await(await fetch(stack.urls.api+path,{headers})).json()).data
  assert.deepEqual((await fresh()).document,record.document);assert.equal((await fresh()).revision,record.revision)
  const noHandshake=await fetch(stack.urls.api+path,{method:'PUT',headers:{Authorization:headers.Authorization,'X-Runly-Company-Id':company.id,'Content-Type':'application/json'},body:JSON.stringify({name:record.name,revision:record.revision,document:downlevel})});assert.equal(noHandshake.status,426)
  const downgraded=await fetch(stack.urls.api+path,{method:'PUT',headers,body:JSON.stringify({name:record.name,revision:record.revision,document:downlevel})});assert.equal(downgraded.status,409)
  const legacyOps=await fetch(stack.urls.api+path+'/changes',{method:'POST',headers,body:JSON.stringify({clientId:'rc2-old-ops',batchId:1,ops:[{type:'upsert',object:{...record.document.objects[0],x:123}}]})});assert.equal(legacyOps.status,200)
  checks.push('Actual RC1 API cannot overwrite v6 on the migrated database; old/no-handshake writers reject; explicit v5 downgrade rejects; legacy upsert remains supported with protocol 2')
  const legacyDoc={...appendObject(blankDocument(),'text',{text:'Legacy original'}),schemaVersion:5}
  const legacy=(await stack.pool.query('INSERT INTO studio_design(company_id,owner_id,name,document) VALUES($1,$2,$3,$4) RETURNING id',[company.id,owner.id,'RC2 cached tab',legacyDoc])).rows[0]
  const browser=await chromium.launch({channel:'chrome',headless:true})
  async function open(url){const page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('dialog',d=>d.accept());await page.goto(url+'/app/login');await page.locator('#identifier').fill(owner.email);await page.locator('#password').fill(owner.password);await page.getByRole('button',{name:'Acceder al sistema',exact:true}).click();await page.waitForURL(u=>!u.pathname.includes('/login'));await page.goto(url+`/app/m/runly.studio/?design=${legacy.id}`);return page}
  try{
    config.services['runly-web'].environment.RUNLY_API_URL=oldUrl;await writeFile(stack.composeFile,JSON.stringify(config,null,2));await stack.compose(['up','-d','--force-recreate','runly-web'])
    const newAgainstOld=await open(stack.urls.web),posts=[];newAgainstOld.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/changes'))posts.push(r.url())})
    await newAgainstOld.getByText(/La API y Studio no son compatibles/).first().waitFor();await insertText(newAgainstOld)
    await newAgainstOld.waitForFunction(()=>Object.keys(sessionStorage).some(k=>k.startsWith('runly:studio:queue:')));assert.equal(posts.length,0)
    await newAgainstOld.screenshot({path:join(stack.directory,'new-web-old-api.png')});await newAgainstOld.close()
    config.services['runly-web'].environment.RUNLY_API_URL=stack.urls.api;await writeFile(stack.composeFile,JSON.stringify(config,null,2));await stack.compose(['up','-d','--force-recreate','runly-web'])
    checks.push('Actual new Web + old API detects absent protocol before writes and preserves a local pending queue')
    const cached=await open(oldWeb);await cached.locator('.upper-canvas').waitFor();await selectLayer(cached,1);await cached.getByLabel('Texto del elemento',{exact:true}).fill('Legacy pending must survive')
    await cached.waitForFunction(()=>Object.entries(localStorage).some(([k,v])=>k.startsWith('runly:studio:draft:')&&v.includes('Legacy pending must survive')))
    // Explicit notification-loss fault: an old tab must remain safe even when
    // background GETs cannot discover the newer revision before its next PUT.
    const legacyUrl=oldUrl+`/studio/designs/${legacy.id}`
    await cached.route(legacyUrl,route=>route.request().method()==='GET'?route.abort('internetdisconnected'):route.continue())
    const upgraded=await fetch(stack.urls.api+`/studio/designs/${legacy.id}`,{method:'PUT',headers,body:JSON.stringify({name:'RC2 cached tab',revision:1,document:appendObject(blankDocument(),'text',{text:'Server v6 protected'})})});assert.equal(upgraded.status,200)
    config.services['previous-api'].image=apiImage;await writeFile(stack.composeFile,JSON.stringify(config,null,2));await stack.compose(['up','-d','--force-recreate','previous-api']);await ready(oldUrl)
    await cached.getByRole('button',{name:'Guardar',exact:true}).click();await cached.getByText(/Actualiza Studio antes de guardar/).first().waitFor()
    assert.ok(await cached.evaluate(()=>Object.entries(localStorage).some(([k,v])=>k.startsWith('runly:studio:draft:')&&v.includes('Legacy pending must survive'))))
    await cached.unroute(legacyUrl)
    config.services['previous-web'].image=webImage;await writeFile(stack.composeFile,JSON.stringify(config,null,2));await stack.compose(['up','-d','--force-recreate','previous-web']);await cached.reload()
    await cached.getByText(/copia local|cambios de este navegador/i).first().waitFor()
    assert.ok(await cached.evaluate(()=>Object.entries(localStorage).some(([k,v])=>k.startsWith('runly:studio:draft:')&&v.includes('Legacy pending must survive'))))
    await cached.screenshot({path:join(stack.directory,'old-tab-safe-reload.png')})
    checks.push('Actual old Web tab during API upgrade receives 426 without overwriting v6; pending draft survives coordinated Web reload on the same origin')
    return {checks,oldApiWriteStatus:oldWrite.status,noHandshakeStatus:noHandshake.status,downgradeStatus:downgraded.status}
  }finally{await browser.close();config.services['runly-web'].environment.RUNLY_API_URL=stack.urls.api;await writeFile(stack.composeFile,JSON.stringify(config,null,2));await stack.compose(['up','-d','--force-recreate','runly-web'])}
}
