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
