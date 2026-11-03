import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createWebsiteDomain} from '../../../../../packages/sdk/src/domains/website.js'
import {createCatalogNamespace} from '../../../../../packages/storefront-sdk/src/catalog.js'
import {runlyWebsiteManifest} from '../../manifests/official/feature-modules.js'

test('new Website SDK commands preserve paths, scope, revision and idempotency',async()=>{
 const calls=[],sdk=createWebsiteDomain({request:async(...args)=>{calls.push(args);return{}},withAuthHeaders:token=>({Authorization:'Bearer '+token})})
 await sdk.setSiteCatalogProduct('site/1','product/2',{included:false,expectedRevision:7},'same-intent','token')
 await sdk.applySiteTemplate('site/1','atlas-negocio',{pageIds:['home'],expectedRevision:7},'template-intent','token')
 await sdk.getCatalogProductUsage('site/1','product/2',{limit:10,cursor:'cursor'},'token')
 assert.equal(calls[0][0],'/website/sites/site%2F1/catalog/products/product%2F2')
 assert.equal(calls[0][1].method,'PUT');assert.equal(calls[0][1].headers['Idempotency-Key'],'same-intent')
 assert.equal(JSON.parse(calls[0][1].body).expectedRevision,7)
 assert.equal(calls[1][1].method,'POST');assert.equal(calls[1][1].headers.Authorization,'Bearer token')
 assert.match(calls[2][0],/used-by\?limit=10&cursor=cursor$/)
})

test('public catalog SDK scopes lists, detail and category counts with the typed Website selector',async()=>{
 const calls=[],sdk=createCatalogNamespace({websiteSiteId:'site',request:async(...args)=>{calls.push(args);return {data:{}}}})
 await sdk.products();await sdk.getProduct('product');await sdk.categories()
 assert.ok(calls.every(call=>call[3].headers['X-Runly-Website-Site']==='site'))
 const legacy=createCatalogNamespace({request:async(...args)=>{assert.deepEqual(args[3],{});return{}}});await legacy.products()
})

test('all new routes declare their own permissions instead of inheriting site access',()=>{
 for(const path of ['/sites/:siteId/catalog','/sites/:siteId/advanced','/sites/:siteId/payments','/sites/:siteId/blog/:postId'])assert.ok(runlyWebsiteManifest.routePermissions.some(route=>route.path===path&&route.permissions.includes('website.site.read')))
 assert.ok(runlyWebsiteManifest.routePermissions.find(route=>route.path==='/sites/:siteId/catalog').permissions.includes('catalog.products.read'))
 assert.ok(runlyWebsiteManifest.routePermissions.find(route=>route.path==='/sites/:siteId/payments').permissions.includes('website.site.update'))
})
