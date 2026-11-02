import {request as httpRequest} from 'node:http'
// Real Nginx configs, actual origin guard, own containers/network and Chromium.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {randomBytes} from 'node:crypto'
import {createRequire} from 'node:module'
const {build}=createRequire(new URL('../apps/api/package.json',import.meta.url))('esbuild')
import {chromium} from 'playwright'
const temp=mkdtempSync(join(tmpdir(),'runly-origin-lab-')),prefix='runly-origin-'+randomBytes(6).toString('hex'),network=prefix+'-net',owned=[]
const docker=args=>execFileSync('docker',args,{encoding:'utf8',maxBuffer:1024*1024}).trim()
const http=(url,host)=>new Promise((resolve,reject)=>{const req=httpRequest(url,{headers:{Host:host}},res=>{let body='';res.setEncoding('utf8');res.on('data',s=>body+=s);res.on('end',()=>resolve({status:res.statusCode,text:async()=>body}))});req.on('error',reject);req.end()})
let browser,networkCreated=false
try {
  const source=`import {Hono} from 'hono';import {serve} from '@hono/node-server';import {createWebsiteOriginGuard} from './src/services/website-origin-guard.js';
  const app=new Hono();app.use('*',createWebsiteOriginGuard({gateway:{authority:async c=>new URL(c.req.url).hostname},adminHosts:['erp.localhost']}));
  app.get('/public/website/admin-origin-check',c=>c.body(null,new URL(c.req.url).hostname==='erp.localhost'?204:403));
  app.get('/public/site/published',c=>new URL(c.req.url).hostname==='site.localhost'?c.html('<!doctype html><title>Public</title><p>PUBLIC_DOCUMENT</p>'):c.notFound());
  serve({fetch:app.fetch,hostname:'0.0.0.0',port:4010});`
  await build({stdin:{contents:source,resolveDir:resolve('apps/api'),sourcefile:'origin-fixture.mjs'},bundle:true,platform:'node',format:'esm',outfile:join(temp,'server.mjs')})
  mkdirSync(join(temp,'www'));writeFileSync(join(temp,'www','index.html'),'<!doctype html><title>Admin fixture</title><p>ADMIN_SHELL</p>')
  docker(['network','create','--label','runly.test=website-origin',network]);networkCreated=true
  const api=prefix+'-api';docker(['run','--pull=never','--detach','--rm','--name',api,'--label','runly.test=website-origin','--network',network,'--network-alias','api','--mount',`type=bind,source=${temp},target=/fixture,readonly`,'node:22.22.3-alpine','node','/fixture/server.mjs']);owned.push(api)
  browser=await chromium.launch({headless:true})
  for(const [index,file]of ['infra/nginx/spa.conf','infra/installer/nginx/spa.conf'].entries()) {
    const config=join(temp,`nginx-${index}.conf`);writeFileSync(config,readFileSync(file))
    const web=prefix+'-web-'+index
    docker(['run','--pull=never','--detach','--rm','--name',web,'--label','runly.test=website-origin','--network',network,'-p','127.0.0.1::80','--mount',`type=bind,source=${config},target=/etc/nginx/conf.d/default.conf,readonly`,'--mount',`type=bind,source=${join(temp,'www')},target=/usr/share/nginx/html,readonly`,'nginx:alpine']);owned.push(web)
    docker(['exec',web,'nginx','-t'])
    const binding=docker(['port',web,'80/tcp']);assert.match(binding,/^127\.0\.0\.1:\d+$/)
    const port=binding.split(':')[1],base=`http://127.0.0.1:${port}`
    let ready=false
    for(let attempt=0;attempt<40;attempt++)try{const r=await http(base+'/published?edit=1','site.localhost');if(r.status===200){ready=true;break}await new Promise(r=>setTimeout(r,100))}catch{await new Promise(r=>setTimeout(r,100))}
    if(!ready){console.log(docker(['logs',api]));console.log(docker(['logs',web]));}
    assert.ok(ready,'Own upstream ready')
    for(const host of ['site.localhost','unknown.localhost'])for(const path of ['/missing?edit=1','/app/login','/app/index.html','/app/assets/entry.js','/index.html']){
      const response=await http(base+path,host);assert.ok([403,404].includes(response.status),`${file} ${host} ${path}: ${response.status}`);assert.doesNotMatch(await response.text(),/ADMIN_SHELL/)
    }
    const admin=await http(base+'/app/login','erp.localhost');assert.equal(admin.status,200);assert.match(await admin.text(),/ADMIN_SHELL/)
    const context=await browser.newContext();await context.route('**/*',route=>{const url=new URL(route.request().url());return url.hostname.endsWith('.localhost')&&url.port===port?route.continue():route.abort()})
    const page=await context.newPage()
    for(const path of ['/published?edit=1','/missing?edit=1','/app/login']){
      const response=await page.goto(`http://site.localhost:${port}${path}`);assert.equal(response.status(),path.startsWith('/published')?200:403);assert.doesNotMatch(await page.locator('body').innerText(),/ADMIN_SHELL/)
    }
    await context.close();console.log(`PASS ${file}: nginx -t, 11 HTTP assertions, 3 browser paths`)
  }
}finally {
  await browser?.close()
  for(const name of owned.reverse())if(docker(['inspect','--format','{{index .Config.Labels "runly.test"}}',name])==='website-origin')docker(['stop',name])
  if(networkCreated&&docker(['network','inspect','--format','{{index .Labels "runly.test"}}',network])==='website-origin')docker(['network','rm',network])
  if(resolve(temp).startsWith(resolve(tmpdir())+ '\\runly-origin-lab-')||resolve(temp).startsWith(resolve(tmpdir())+'/runly-origin-lab-'))rmSync(temp,{recursive:true})
}
