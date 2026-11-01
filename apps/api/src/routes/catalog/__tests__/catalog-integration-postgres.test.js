import {before,after,describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {Hono} from 'hono';
import {createCatalogRouter} from '../index.js';
import {createCatalogSyncWriteService} from '../catalog-sync-write-service.js';
import {createRunlyClient} from '../../../../../../packages/sdk/src/index.js';
import {createSyncRouter} from '../../sync.js';

const url=process.env.RUNLY_COMMERCE_TEST_DATABASE_URL;
if(url&&(!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)||new URL(url).pathname!=='/commerce_test'))throw new Error('Usa commerce_test local desechable.');
describe('Catalog integration D31-D36 PostgreSQL/API',{skip:!url},()=>{
  let db,peer,company,actor,product,variant,app,other;
  let sequence=0;
  const key=()=>`catalog-integrity-${Date.now()}-${++sequence}`;
  const uuid=async()=>(await db.$queryRaw`SELECT uuidv7()::text AS id`)[0].id;
  const setup=(prisma)=>{
    const router=new Hono();router.use('*',async(c,next)=>{c.set('companyId',company.id);c.set('userId',actor.id);return next();});
    const authorize=(keys)=>async(c,next)=>{if(!keys.some((k)=>(c.req.header('X-Permissions')??'').split(',').includes(k)))return c.json({error:'Sin permiso'},403);return next();};
    router.route('',createCatalogRouter({prisma,requirePermission:(k)=>authorize([k]),requireAnyPermission:authorize}));return router;
  };
  const headers={'Content-Type':'application/json','X-Permissions':'catalog.products.read,catalog.products.create,catalog.products.update,catalog.inventory.adjust'};
  const call=async(method,path,body,extra={},router=app)=>{
    const res=await router.request(path,{method,headers:{...headers,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:res.status,body:await res.json()};
  };
  const root=()=>`/catalog/products/${product.id}`,path=()=>`${root()}/variants/${variant.id}`;
  const fresh=async()=> (await call('GET',root())).body.data.variants.find((v)=>v.id===variant.id);
  const patch=async(data)=>call('PATCH',path(),{expectedVersion:(await fresh()).revision,...data});
  before(async()=>{
    db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});peer=new PrismaClient({adapter:new PrismaPg({connectionString:url})});
    company=await db.company.create({data:{id:await uuid(),name:'Catalog integration',slug:key()}});
    actor=await db.userProfile.create({data:{id:await uuid(),authUserId:await uuid(),displayName:'Catalog fixture',email:`${key()}@example.test`}});
    await db.posSettings.create({data:{companyId:company.id,currency:'MXN',defaultTaxRate:16,pricesIncludeTax:true}});
    product=await db.catalogProduct.create({data:{id:await uuid(),companyId:company.id,name:'Playera',slug:'playera',productType:'VARIABLE',price:250,currency:'MXN'}});
    variant=await db.catalogProductVariant.create({data:{id:await uuid(),companyId:company.id,productId:product.id,optionValues:{Talla:'Chica',Color:'Rojo'},priceInherited:true,price:0}});
    app=setup(db);other=setup(peer);
  });
  after(async()=>{await db?.$disconnect();await peer?.$disconnect();});
  it('D36 persists SKU-only and barcode-only patches without changing options or inherited price',async()=>{
    assert.equal((await patch({sku:'X'})).status,200);
    assert.equal((await patch({barcode:'0001'})).status,200);
    const row=await db.catalogProductVariant.findUnique({where:{id:variant.id}});
    assert.equal(row.sku,'X');assert.equal(row.barcode,'0001');assert.equal(row.priceInherited,true);assert.equal(Number(row.price),0);
    assert.deepEqual(row.optionValues,{Talla:'Chica',Color:'Rojo'});
    assert.equal(Number((await fresh()).price),250);
  });
  it('D36 changes only explicitly sent fields, preserves zero, switches policy and keeps empty PATCH a no-op',async()=>{
    await patch({option_values:{Talla:'Grande',Color:'Rojo'}});
    let row=await fresh();assert.equal(row.sku,'X');assert.equal(row.barcode,'0001');assert.equal(row.price_inherited,true);
    await patch({price:0});row=await fresh();assert.equal(row.price_inherited,false);assert.equal(Number(row.price),0);
    await patch({price:null});row=await fresh();assert.equal(row.price_inherited,true);assert.equal(Number(row.price),250);
    const before=await db.catalogProductVariant.findUnique({where:{id:variant.id}});
    assert.equal((await call('PATCH',path(),{})).status,200);
    assert.deepEqual(await db.catalogProductVariant.findUnique({where:{id:variant.id}}),before);
    for(const data of [{price:-1},{option_values:null},{stock:2},{sku:3},{unknown:true}])assert.equal((await patch(data)).status,400);
    assert.deepEqual(await db.catalogProductVariant.findUnique({where:{id:variant.id}}),before);
    await patch({option_values:{},sku:null,barcode:null});row=await fresh();assert.deepEqual(row.option_values,{});assert.equal(row.sku,null);assert.equal(row.price_inherited,true);
    const category=await db.catalogCategory.create({data:{id:await uuid(),companyId:company.id,name:'Anterior',slug:'anterior',position:7}});
    assert.equal((await call('PATCH',`/catalog/categories/${category.id}`,{name:'Nueva'},{'X-Permissions':'catalog.categories.update'})).status,200);
    assert.equal((await db.catalogCategory.findUnique({where:{id:category.id}})).position,7);
  });
  it('D33 atomically rejects competing product and variant edits, including the SDK',async()=>{
    for(const [url,row] of [[root(),(await call('GET',root())).body.data],[path(),await fresh()]]){
      const responses=await Promise.all([call('PATCH',url,{sku:'CLIENT-A',expectedVersion:row.revision}),call('PATCH',url,{sku:'CLIENT-B',expectedVersion:row.revision},{},other)]);
      assert.deepEqual(responses.map((r)=>r.status).sort(),[200,409]);assert.equal(responses.find((r)=>r.status===409).body.code,'CATALOG_VERSION_CONFLICT');
    }
    assert.equal((await call('PATCH',root(),{sku:'unsafe'})).status,428);
    const client=createRunlyClient({baseUrl:'https://example.test',getActiveCompanyId:()=>company.id,fetch:async(url,options)=>app.request(new URL(url).pathname,{...options,headers:{...options.headers,...headers}})});
    const revision=(await fresh()).revision;
    await client.catalog.updateVariant(product.id,variant.id,{barcode:'SDK-0001'},'token',{expectedVersion:revision});
    await assert.rejects(client.catalog.updateVariant(product.id,variant.id,{barcode:'SDK-0002'},'token',{expectedVersion:revision}),{code:'CATALOG_VERSION_CONFLICT'});
    assert.equal((await fresh()).barcode,'SDK-0001');
  });
  it('D35 serializes product/variant creates and replay after a lost response without duplicate rows or opening stock',async()=>{
    for(const [endpoint,body] of [['/catalog/products',{name:'Nuevo',slug:'nuevo',stock:3,price:10}], [root()+'/variants',{option_values:{Talla:'Unica'},price:null,stock:2}]]){
      const attempt=key(),extra={'Idempotency-Key':attempt};
      const [a,b]=await Promise.all([call('POST',endpoint,body,extra),call('POST',endpoint,body,extra,other)]);
      assert.equal(a.status,201,JSON.stringify(a));assert.deepEqual(a,b);
      const replay=await call('POST',endpoint,body,extra);assert.deepEqual(replay,a);
      assert.equal(await db.catalogStockMovement.count({where:{sourceType:'OPENING_BALANCE',sourceId:a.body.data.id}}),1);
      assert.equal((await call('POST',endpoint,{...body,price:30},extra)).status,409);
      assert.equal((await call('POST',endpoint,body)).status,428);
    }
  });
  it('D31 allows scoped Catalog reads without any POS permission and rejects foreign outlets',async()=>{
    const outlet=await db.posOutlet.create({data:{companyId:company.id,name:'Centro'}});
    const foreignCompany=await db.company.create({data:{id:await uuid(),name:'Foreign',slug:key()}});
    const foreign=await db.posOutlet.create({data:{companyId:foreignCompany.id,name:'Ajena'}});
    const only={'X-Permissions':'catalog.products.read'};
    assert.deepEqual((await call('GET','/catalog/outlets',undefined,only)).body.data.map((o)=>o.id),[outlet.id]);
    assert.equal((await call('GET','/catalog/commercial-defaults',undefined,only)).body.data.currency,'MXN');
    assert.equal((await call('GET',`/catalog/sellables?outletId=${outlet.id}`,undefined,only)).status,200);
    assert.equal((await call('GET',`/catalog/sellables?outletId=${foreign.id}`,undefined,only)).status,404);
    assert.equal((await call('GET',`/pos/v2/sellables?outletId=${outlet.id}`,undefined,only)).status,403);
  });
  it('sync product writes preserve sparse updates, enforce preconditions and atomically replay creates',async()=>{
    const sync=createCatalogSyncWriteService({prisma:db}),ctx={companyId:company.id,actorId:actor.id};
    const mutation={moduleKey:'atlas.catalog',entityType:'product',operation:'CREATE',recordId:await uuid(),idempotencyKey:key(),payload:{name:'Sync',slug:'sync',currency:'MXN',price:15}};
    const first=await sync.apply(ctx,mutation);assert.deepEqual(await sync.apply(ctx,mutation),first);
    assert.equal(first.id,mutation.recordId);
    const update={moduleKey:'runly.catalog',entityType:'product',operation:'UPDATE',recordId:first.id,idempotencyKey:key(),payload:{sku:'SYNC',expectedVersion:first.revision}};
    const result=await sync.apply(ctx,update);assert.equal(result.sku,'SYNC');assert.equal(Number(result.price),15);
    await assert.rejects(sync.apply(ctx,{...update,idempotencyKey:key(),payload:{sku:'STALE',expectedVersion:first.revision}}),{code:'CATALOG_VERSION_CONFLICT'});
  });
  it('sync HTTP closes concurrent writes and supports monotonic legacy timestamp preconditions',async()=>{
    const router=createSyncRouter({prisma:db,getUserContext:async()=>({profile:actor}),resolveTenantContext:async()=>({ok:true,tenant:{companyId:company.id,isAdmin:false,permissionSet:new Set(['catalog.products.update'])}})});
    const row=await db.catalogProduct.findUnique({where:{id:product.id}});
    const mutation={moduleKey:'atlas.catalog',entityType:'product',operation:'UPDATE',recordId:product.id,clientUpdatedAt:row.updatedAt.toISOString(),payload:{sku:'SYNC-HTTP'}};
    const [a,b]=await Promise.all([call('POST','/sync/push',{mutations:[{...mutation,idempotencyKey:key()}]},{},router),call('POST','/sync/push',{mutations:[{...mutation,idempotencyKey:key()}]},{},router)]);
    assert.deepEqual([a,b].map((r)=>r.body.results[0].status).sort(),['CONFLICT','OK']);
    const conflict=[a,b].find((r)=>r.body.results[0].status==='CONFLICT').body.results[0];assert.equal(conflict.record.companyId,company.id);
    const after=await db.catalogProduct.findUnique({where:{id:product.id}});assert.ok(after.updatedAt>row.updatedAt);assert.ok(after.revision>row.revision);
  });
});
