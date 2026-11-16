import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Hono} from 'hono'
import {validateWebsiteStaticContent,isStaticWebsiteContent,STATIC_CONTENT_POLICY,isSandboxedWebsiteContent,SANDBOX_CONTENT_POLICY} from '../website-static-policy.js'
import {validateWebsiteZipReferences} from '../website-zip-references.js'
import {createWebsiteContentIsolation} from '../website-content-isolation.js'
import {websiteIsolatedHeaders} from '../website-static-serving.js'

const manifest={contentMode:'static',staticPolicyVersion:STATIC_CONTENT_POLICY}
const files=[{path:'index.html',mime:'text/html'},{path:'style.css',mime:'text/css'},{path:'logo.svg',mime:'image/svg+xml'}]
const texts=new Map([
  ['index.html','<!doctype html><html lang="es"><meta charset="utf-8"><link rel="stylesheet" href="style.css"><h1>Plantilla</h1><img src="logo.svg"><a href="https://example.com">Contacto</a>'],
  ['style.css','body { color: #123456; }'],
  ['logo.svg','<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L1 1" /></svg>'],
])

test('HTML/CSS and passive SVG validate in the budgeted worker without rewriting bytes',async()=>{
  await validateWebsiteZipReferences(files,texts,{contentMode:'static'})
  assert.match(texts.get('index.html'),/<h1>Plantilla<\/h1>/)
  validateWebsiteStaticContent([{path:'font.woff2',mime:'font/woff2'}],new Map())
})

for(const html of [
  '<script>alert(1)</script>',
  '<script type="application/json">{}</script>',
  '<img src=x oNeRrOr=alert(1)>',
  '<a href="java&#x73;cript&#58;alert(1)">click</a>',
  '<a href="java&#10;script:alert(1)">click</a>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<object data="payload.svg"></object>',
  '<embed src="payload.svg">',
  '<meta http-equiv="refresh" content="0;url=https://example.com">',
  '<base href="/">',
  '<template><script>alert(1)</script></template>',
  '<noscript><img src=x onerror=alert(1)></noscript>',
  '<svg><a xlink:href="javascript:alert(1)">click</a></svg>',
  '<svg><set attributeName="href" to="javascript:alert(1)" /></svg>',
  '<svg><foreignObject><div>embedded</div></foreignObject></svg>',
  '<a href="data:text/html;base64,PHNjcmlwdD4=">click</a>',
  '<a ping="https://example.com">click</a>',
  '<link rel="modulepreload" href="app.js">',
])test(`static mode rejects executable markup: ${html}`,()=>{
  assert.throws(()=>validateWebsiteStaticContent([files[0]],new Map([['index.html',html]])),e=>e.code==='static_content_required')
})

test('scripts, WASM and active SVG cannot be labelled as static',async()=>{
  for(const mime of ['text/javascript','application/wasm']) {
    assert.throws(()=>validateWebsiteStaticContent([{path:'payload',mime}],new Map()),e=>e.code==='static_content_required')
  }
  for(const source of ['<svg onload="alert(1)"/>','<?xml-stylesheet href="evil.xsl"?><svg/>','<!DOCTYPE svg><svg/>','<s:svg xmlns:s="http://www.w3.org/2000/svg"><s:script>alert(1)</s:script></s:svg>']) {
    assert.throws(()=>validateWebsiteStaticContent([files[2]],new Map([['logo.svg',source]])),e=>e.code==='static_content_required')
  }
  await assert.rejects(validateWebsiteZipReferences([files[0]],new Map([['index.html','<script>alert(1)</script>']]),{contentMode:'static'}),e=>e.code==='static_content_required')
  // Existing API clients keep the isolated mode; they are never silently downgraded.
  await validateWebsiteZipReferences([files[0]],new Map([['index.html','<script>console.log(1)</script>']]))
})

test('sandbox accreditation is versioned and permits brand hosts without giving scripts same-origin privileges',async()=>{
 const sandbox={contentMode:'sandboxed',sandboxPolicyVersion:SANDBOX_CONTENT_POLICY}
 const isolation=createWebsiteContentIsolation({adminOrigin:'https://erp.example.test',namespaceRoot:'sites.example.test'})
 assert.equal(isolation.publicHost('tenant.sites.example.test',sandbox),'tenant.sites.example.test')
 for(const m of [{contentMode:'sandboxed'},{...sandbox,sandboxPolicyVersion:'unknown'},{}]){
  assert.equal(isSandboxedWebsiteContent(m),false)
  assert.throws(()=>isolation.publicHost('tenant.sites.example.test',m))
 }
 const app=new Hono()
 for(const mode of [manifest,sandbox])for(const mime of ['application/xml','application/pdf'])app.get(`/${mode.contentMode}/${mime.split('/')[1]}`,c=>{websiteIsolatedHeaders(c,{manifest:mode,mime});return c.body('download')})
 app.get('/sandbox',c=>{c.header('Access-Control-Allow-Credentials','true');websiteIsolatedHeaders(c,{manifest:sandbox});return c.body('sandbox')})
 const response=await app.request('/sandbox'),csp=response.headers.get('content-security-policy')
 assert.match(csp,/sandbox allow-scripts/);assert.ok(!csp.includes('allow-same-origin'));assert.match(csp,/connect-src 'none'/)
 assert.equal(response.headers.get('access-control-allow-origin'),'*');assert.equal(response.headers.get('access-control-allow-credentials'),null)
 for(const mode of [manifest,sandbox])for(const type of ['xml','pdf'])assert.equal((await app.request(`/${mode.contentMode}/${type}`)).headers.get('content-disposition'),'attachment')
})

test('worker validation preserves the offending HTML file and attribute in the error',async()=>{
 await assert.rejects(validateWebsiteZipReferences([{path:'pages/contact.html',mime:'text/html'}],new Map([['pages/contact.html','<button onclick="alert(1)">Send</button>']]),{contentMode:'static'}),error=>{
  assert.equal(error.code,'static_content_required')
  assert.equal(error.fields.archivo,'pages/contact.html')
  assert.match(error.fields.motivo,/onclick/)
  return true
 })
})

test('only validated policy versions may use the configured brand namespace',()=>{
  const isolation=createWebsiteContentIsolation({adminOrigin:'https://erp.runly.test',namespaceRoot:'sites.runly.test'})
  assert.equal(isolation.publicHost('tenant.sites.runly.test',manifest),'tenant.sites.runly.test')
  assert.equal(isolation.assertStaticRoot(),'sites.runly.test')
  for(const candidate of [undefined,{}, {contentMode:'static'}, {...manifest,staticPolicyVersion:'unknown'}]) {
    assert.equal(isStaticWebsiteContent(candidate),false)
    assert.throws(()=>isolation.publicHost('tenant.sites.runly.test',candidate),e=>e.code==='isolation_required')
  }
  for(const host of ['erp.runly.test','sites.runly.test','tenant.sites.runly.test.example.com','unrelated.example.com']) {
    assert.throws(()=>isolation.publicHost(host,manifest),e=>e.code==='isolation_required')
  }
  for(const namespaceRoot of ['erp.runly.test','runly.test']) {
    assert.throws(()=>createWebsiteContentIsolation({adminOrigin:'https://erp.runly.test',namespaceRoot}).assertStaticRoot())
  }
  assert.throws(()=>createWebsiteContentIsolation({adminOrigin:'http://app.example.com',namespaceRoot:'sites.example.com'}).assertStaticRoot())
})

test('static documents and assets carry enforceable no-script/no-form headers',async()=>{
  const app=new Hono()
  app.get('/static',c=>{websiteIsolatedHeaders(c,{manifest});return c.html('<h1>Static</h1>')})
  app.get('/isolated',c=>{websiteIsolatedHeaders(c);return c.html('<h1>Isolated</h1>')})
  const response=await app.request('/static'),csp=response.headers.get('content-security-policy')
  for(const directive of ["script-src 'none'","connect-src 'none'","form-action 'none'","object-src 'none'","worker-src 'none'",'sandbox allow-same-origin'])assert.ok(csp.includes(directive),directive)
  assert.ok(!csp.includes('allow-scripts'))
  assert.equal(response.headers.get('x-content-type-options'),'nosniff')
  assert.equal(response.headers.get('cross-origin-opener-policy'),'same-origin')
  assert.match((await app.request('/isolated')).headers.get('content-security-policy'),/sandbox allow-scripts allow-same-origin/)
})
