import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createWebsiteReleaseService,websiteReleasePath} from '../website-release-service.js'
import {createWebsiteReleaseStorage} from '../website-release-storage.js'
import {accessFor,A,B} from '../../routes/website/__tests__/security-fixtures.js'
for(const name of ['prepare','activate','rollback','unpublish','list','get','publishLegacy'])test(`${name} validates server authority before persistence`,async()=>{
 const service=createWebsiteReleaseService({prisma:{}})
 await assert.rejects(service[name]({companyId:A}),e=>e.status===401)
 await assert.rejects(service[name]({companyId:A,access:{companyId:A,can:()=>true}}),e=>e.status===401)
 await assert.rejects(service[name]({companyId:B,access:accessFor([])}),e=>e.status===404)
 await assert.rejects(service[name]({companyId:A,access:accessFor([])}),e=>e.status===403)
})
test('canonical publication paths reject control, encoded traversal and reserved administrative routes',()=>{
 for(const path of ['/app','/auth/login','/api/company','/mcp','/p/test','/.well-known/secret','/__runly','/a/../b','/%2e%2e','/a//b','/a?token=x','/a#frag','/a\\b'])assert.throws(()=>websiteReleasePath(path))
 assert.equal(websiteReleasePath('/about/team'),'/about/team')
})
test('private storage adapter requires a private bucket and handles both error results and thrown failures',async()=>{
 const bad=createWebsiteReleaseStorage({supabaseAdmin:{storage:{getBucket:async()=>({data:{public:true}})}}})
 await assert.rejects(bad.put('key',Buffer.from('x'),'text/javascript'),e=>e.status===503)
 const error=createWebsiteReleaseStorage({supabaseAdmin:{storage:{getBucket:async()=>({error:{message:'private detail'}})}}})
 await assert.rejects(error.get('key'),e=>e.status===503&&!e.message.includes('detail'))
 const thrown=createWebsiteReleaseStorage({supabaseAdmin:{storage:{getBucket:async()=>{throw new Error('private endpoint')}}}})
 await assert.rejects(thrown.get('key'),e=>e.status===503&&!e.message.includes('endpoint'))
})
test('storage upload is create-only and accepts a concurrent identical object but rejects different bytes',async()=>{
 const objects=new Map();let options
 const client={upload:async(key,bytes,opts)=>{options=opts;if(objects.has(key))return{error:{message:'exists'}};objects.set(key,bytes);return{}},download:async key=>({data:{arrayBuffer:async()=>objects.get(key)},error:objects.has(key)?null:{message:'missing'}})}
 const storage=createWebsiteReleaseStorage({supabaseAdmin:{storage:{getBucket:async()=>({data:{public:false}}),from:()=>client}}})
 await storage.put('key',Buffer.from('same'),'text/javascript');await storage.put('key',Buffer.from('same'),'text/javascript')
 assert.equal(options.upsert,false)
 await assert.rejects(storage.put('key',Buffer.from('different'),'text/javascript'),e=>e.status===503)
})
