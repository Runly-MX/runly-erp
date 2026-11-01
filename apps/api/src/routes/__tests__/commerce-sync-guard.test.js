import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncRouter } from '../sync.js';

test('catalog price writes through sync require explicit CRUD permission for both aliases', async () => {
  for (const moduleKey of ['runly.catalog','atlas.catalog']) {
    let writes=0;
    const app=createSyncRouter({
      catalogWriteService:{apply:async(_ctx,mutation)=>{writes++;return{id:'product',companyId:'company',...mutation.payload}}},
      prisma:{userProfile:{findUnique:async()=>({id:'actor'})},syncMutationLog:{findUnique:async()=>null,create:async()=>({})},
        catalogProduct:{findUnique:async()=>({id:'product',companyId:'company'}),update:async({data})=>{writes++;return{id:'product',companyId:'company',...data}}}},
      getUserContext:async()=>({profile:{id:'actor'}}),
      resolveTenantContext:async(c)=>({ok:true,tenant:{companyId:'company',isAdmin:false,permissionSet:new Set((c.req.header('X-Test-Permissions')??'').split(','))}}),
    });
    const body={mutations:[{idempotencyKey:'test-sync-price-01',moduleKey,entityType:'product',operation:'UPDATE',recordId:'product',payload:{price:1}}]};
    const post=(permissions,payload=body)=>app.request('/sync/push',{method:'POST',headers:{'Content-Type':'application/json','X-Test-Permissions':permissions},body:JSON.stringify(payload)});
    const denied=await post('pos.caja.operate');
    assert.equal((await denied.json()).results[0].status,'PERMISSION_DENIED');assert.equal(writes,0);
    const allowed=await post('catalog.products.update');
    assert.equal((await allowed.json()).results[0].status,'OK');assert.equal(writes,1);
    body.mutations[0].payload.companyId='other-company';
    assert.equal((await (await post('catalog.products.update')).json()).results[0].status,'PERMISSION_DENIED');assert.equal(writes,1);
  }
});
