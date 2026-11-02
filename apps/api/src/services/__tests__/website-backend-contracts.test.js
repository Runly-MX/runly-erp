import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Hono} from 'hono'
import {createWebsiteOriginGuard} from '../website-origin-guard.js'
import {createFormsNamespace} from '../../../../../packages/storefront-sdk/src/forms.js'
import {createRequestCore} from '../../../../../packages/storefront-sdk/src/core/request.js'
import {createAnalyticsNamespace} from '../../../../../packages/storefront-sdk/src/analytics.js'
import {createStorefrontCaptureRoutes} from '../../routes/storefront/storefront-capture-routes.js'

test('origin routing preserves configured administrative/API hosts and public Catalog while rejecting public administration',async()=>{
 const app=new Hono();app.use('*',createWebsiteOriginGuard({gateway:{authority:async c=>new URL(c.req.url).hostname},adminHosts:['erp.example.test','api.example.test']}))
 for(const path of ['/website/private','/catalog/private','/commerce/private','/public/catalog/products','/public/storefront/v1/config'])app.get(path,c=>c.text('handler'))
 for(const host of ['erp.example.test','api.example.test'])for(const path of ['/website/private','/catalog/private','/commerce/private'])assert.equal((await app.request('https://'+host+path)).status,200)
 for(const host of ['site.example.test','unknown.example.test']){
  for(const path of ['/website/private','/catalog/private','/commerce/private'])assert.equal((await app.request('https://'+host+path)).status,404)
  for(const path of ['/public/catalog/products','/public/storefront/v1/config'])assert.equal((await app.request('https://'+host+path)).status,200)
 }
})
test('forms SDK uses an explicit owner selector and sends the fetched definition revision',async()=>{
 const calls=[],forms=createFormsNamespace({siteId:'legacy',websiteSiteId:'website',pageId:'page',request:async(...args)=>{calls.push(args);return {data:{id:'form',definitionRevision:7}}}})
 await forms.get('form');await forms.submit('form',{email:'visitor@example.test'},{idempotencyKey:'same-attempt'})
 assert.deepEqual(calls[0][3].headers,{'X-Runly-Website-Site':'website','X-Runly-Page':'page'})
 assert.equal(calls[1][2].expectedDefinitionRevision,7);assert.equal(calls[1][3].headers['Idempotency-Key'],'same-attempt')
 assert.throws(()=>createFormsNamespace({websiteSiteId:'site',propertyId:'property'}),/scope_conflict/)
})
test('SDK preserves legacy error classes and exposes the stable backend code separately',async()=>{
 const request=createRequestCore({baseUrl:'https://api.example.test',company:'fixture',getSession:()=>null,fetchFn:async()=>new Response(JSON.stringify({error:'Recarga el formulario.',code:'form_definition_changed'}),{status:409,headers:{'Content-Type':'application/json'}})})
 await assert.rejects(request('POST','/forms',{}),e=>e.status===409&&e.serverCode==='form_definition_changed')
})
test('explicit analytics owner survives config returning a different legacy analytics ID',async()=>{
 const calls=[],analytics=createAnalyticsNamespace({baseUrl:'https://api.example.test',company:'fixture',siteId:'web',websiteSiteId:'web',request:async(...args)=>{calls.push(args);return {data:{siteId:'analytics-property',analyticsMode:'off'}}},environment:{setInterval:()=>0,clearInterval:()=>{}}})
 await analytics.start()
 assert.equal(calls[0][3].headers['X-Runly-Website-Site'],'web');assert.ok(!('X-Runly-Site' in calls[0][3].headers))
})
test('beacon transport accepts typed selectors and rejects contradictory selectors',async()=>{
 const calls=[],app=createStorefrontCaptureRoutes({captureService:{captureEvents:async input=>{calls.push(input);return {accepted:0}}}})
 const response=await app.request('https://site.example.test/events/batch?company=fixture&websiteSiteId=web',{method:'POST',body:'{}'})
 assert.equal(response.status,202);assert.equal(calls[0].websiteSiteId,'web')
 const conflict=await app.request('https://site.example.test/events/batch?company=fixture&websiteSiteId=web&propertyId=property',{method:'POST',body:'{}'})
 assert.equal(conflict.status,400);assert.equal((await conflict.json()).error.code,'scope_conflict');assert.equal(calls.length,1)
})
