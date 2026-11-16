import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {Hono} from 'hono'
import {chromium} from 'playwright'
import {createWebsiteStaticServing} from '../../apps/api/src/services/website-static-serving.js'
import {releaseBytesHash} from '../../apps/api/src/services/website-release-storage.js'
import {createPublicReleaseRoutes} from '../../apps/api/src/routes/website/public-release-routes.js'

test('browser enforces no scripts, embeds or form submission while static HTML/CSS still render',async()=>{
  // Deliberately bypass import validation to check the independent serving defense.
  const objects=new Map([
    ['index.html',Buffer.from('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body onload="window.evil=true"><h1>Plantilla estática</h1><script>window.evil=true;document.cookie="injected=1"</script><script src="/evil.js"></script><iframe src="/capture"></iframe><form method="post" action="/capture"><button>Enviar</button></form></body></html>')],
    ['style.css',Buffer.from('h1 { color: rgb(12, 34, 56); }')],
    ['evil.js',Buffer.from('window.evil=true;fetch("/capture")')],
  ])
  const files=[...objects].map(([path,bytes])=>({path,objectKey:path,hash:releaseBytesHash(bytes),size:bytes.length,mime:path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':'text/javascript'}))
  const manifest={kind:'dist',contentMode:'static',staticPolicyVersion:'html-css-v1',routingMode:'mpa',files}
  const snapshot={hostname:'tenant.sites.example.test',site:{id:'site',companyId:'company'},release:{manifest}}
  const serving=createWebsiteStaticServing({prisma:{},storage:{get:async key=>objects.get(key)},isolation:{publicHost:()=>snapshot.hostname}})
  let captures=0,scriptRequests=0
  const app=new Hono()
  app.route('/public/website',createPublicReleaseRoutes({gateway:{asset:async()=>({...manifest,bytes:objects.get('index.html'),mime:'text/html'})}}))
  app.all('/capture',c=>{captures++;return c.text('Captured')})
  app.get('*',c=>{if(c.req.path==='/evil.js')scriptRequests++;return serving.serve(c,snapshot,c.req.path)})
  const server=createServer(async(req,res)=>{
    try {
      const response=await app.request(`http://127.0.0.1${req.url}`,{method:req.method,headers:req.headers})
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))
    }catch{res.writeHead(500);res.end()}
  })
  server.listen(0,'127.0.0.1');await once(server,'listening')
  let browser
  try {
    browser=await chromium.launch({headless:true})
    const page=await browser.newPage(),origin=`http://127.0.0.1:${server.address().port}`
    for(const path of ['/','/public/website/releases/release/assets/hash']) {
      const response=await page.goto(origin+path)
      assert.equal(response.status(),200)
      assert.match(response.headers()['content-security-policy'],/script-src 'none'/)
      assert.equal(await page.locator('h1').textContent(),'Plantilla estática')
      assert.equal(await page.locator('h1').evaluate(el=>getComputedStyle(el).color),'rgb(12, 34, 56)')
      await page.getByRole('button',{name:'Enviar'}).click()
      await page.waitForTimeout(100)
      assert.equal(await page.evaluate(()=>window.evil),undefined)
      assert.equal((await page.context().cookies()).some(cookie=>cookie.name==='injected'),false)
      assert.equal(captures,0)
      assert.equal(scriptRequests,0)
    }
  }finally{
    await browser?.close()
    await new Promise(resolve=>server.close(resolve))
  }
})

test('sandboxed modules and interaction work on the same site without cookies, storage or API access',async()=>{
  const source=new Map([
    ['index.html','<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><h1>Sandbox</h1><button onclick="this.textContent=\'Abierto\'">Menú</button><p id="module">Cargando</p><a href="/next.html">Siguiente</a><form action="/capture" method="post"><button>Enviar</button></form><script>window.checks={};try{document.cookie="injected=1;Domain=sandbox.test";window.checks.cookies=true}catch{window.checks.cookies=false}try{localStorage.setItem("secret","evil");window.checks.storage=true}catch{window.checks.storage=false}fetch("/capture",{credentials:"include"}).catch(()=>window.checks.fetchBlocked=true);fetch(location.href.replace("tenant.sites.","erp.")+"capture",{credentials:"include"}).catch(()=>window.checks.erpBlocked=true);</script><script type="module" src="/entry.js"></script>'],
    ['next.html','<!doctype html><meta charset="utf-8"><h1>Siguiente página</h1>'],
    ['style.css','h1{color:rgb(12,34,56)}'],
    ['entry.js','import {label} from "./part.js";document.querySelector("#module").textContent=label;'],
    ['part.js','export const label="Módulo listo";'],
    ['manual.pdf','%PDF-1.7'],
  ])
  source.set('index.html',source.get('index.html').replace('<form ','<a href="/manual.pdf" download>Manual</a><form '))
  const objects=new Map([...source].map(([path,text])=>[path,Buffer.from(text)]))
  const files=[...objects].map(([path,bytes])=>({path,objectKey:path,hash:releaseBytesHash(bytes),size:bytes.length,mime:path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':path.endsWith('.pdf')?'application/pdf':'text/javascript'}))
  const manifest={kind:'dist',contentMode:'sandboxed',sandboxPolicyVersion:'browser-sandbox-v1',routingMode:'mpa',files}
  const snapshot={hostname:'tenant.sites.sandbox.test',site:{id:'site',companyId:'company'},release:{manifest}}
  const serving=createWebsiteStaticServing({prisma:{},storage:{get:async key=>objects.get(key)},isolation:{publicHost:()=>snapshot.hostname}})
  let captures=0
  const app=new Hono();app.all('/capture',c=>{captures++;return c.text('Secret')})
  app.route('/public/website',createPublicReleaseRoutes({gateway:{asset:async()=>({...manifest,bytes:objects.get('index.html'),mime:'text/html'})}}))
  app.get('*',c=>serving.serve(c,snapshot,c.req.path))
  const server=createServer(async(req,res)=>{
    if(req.headers.host.startsWith('erp.')){if(req.url.includes('capture'))captures++;res.end('ERP');return}
    try {
      const response=await app.request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers})
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))
    }catch{res.writeHead(500);res.end()}
  })
  server.listen(0,'127.0.0.1');await once(server,'listening')
  let browser
  try {
    browser=await chromium.launch({headless:true,args:['--no-proxy-server','--host-resolver-rules=MAP *.sandbox.test 127.0.0.1']})
    const context=await browser.newContext(),port=server.address().port,site=`http://tenant.sites.sandbox.test:${port}`,erp=`http://erp.sandbox.test:${port}`
    await context.addCookies([{name:'erp_session',value:'fixture',domain:'.sandbox.test',path:'/',httpOnly:true,sameSite:'Lax'}])
    const admin=await context.newPage();await admin.goto(erp);await admin.evaluate(()=>localStorage.setItem('erp_secret','fixture'))
    const page=await context.newPage()
    for(const path of ['/','/public/website/releases/release/assets/hash']) {
      const response=await page.goto(site+path)
      assert.equal(response.status(),200)
      await page.getByText('Módulo listo',{exact:true}).waitFor()
      assert.equal(await page.locator('h1').evaluate(el=>getComputedStyle(el).color),'rgb(12, 34, 56)')
      await page.getByRole('button',{name:'Menú',exact:true}).click();await page.getByRole('button',{name:'Abierto',exact:true}).waitFor()
      await page.getByRole('button',{name:'Enviar',exact:true}).click()
      await page.waitForFunction(()=>window.checks?.erpBlocked&&window.checks?.fetchBlocked)
      assert.equal(await page.evaluate(()=>window.origin),'null')
      assert.deepEqual(await page.evaluate(()=>[window.checks.cookies,window.checks.storage]),[false,false])
      assert.equal(captures,0)
      assert.equal((await context.cookies()).some(cookie=>cookie.name==='injected'),false)
      assert.equal(await admin.evaluate(()=>localStorage.getItem('erp_secret')),'fixture')
      assert.ok(!response.headers()['content-security-policy'].includes('allow-same-origin'))
    }
    const download=page.waitForEvent('download')
    await page.getByRole('link',{name:'Manual',exact:true}).click()
    assert.equal((await download).suggestedFilename(),'manual.pdf')
    await page.getByRole('link',{name:'Siguiente',exact:true}).click();await page.getByRole('heading',{name:'Siguiente página'}).waitFor()
  }finally{
    await browser?.close();await new Promise(resolve=>server.close(resolve))
  }
})
