import {before,after,describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {Hono} from 'hono';
import {createPosRecoveryService} from '../../pos/pos-recovery-service.js';
import {createPosRefundQuoteService} from '../../pos/pos-refund-quote-service.js';
import {createCatalogCommerceStock} from '../catalog-commerce-stock.js';
import {createCatalogSellablesService} from '../catalog-sellables-service.js';
import {createCatalogCommerceAdmin} from '../catalog-commerce-admin.js';
import {createCatalogProductService} from '../catalog-product-service.js';
import {createCatalogVariantService} from '../catalog-variant-service.js';
import {createCatalogPublicService} from '../catalog-public-service.js';
import {createCatalogRouter} from '../index.js';
import {createPosRouter} from '../../pos/pos-routes.js';

const url=process.env.RUNLY_COMMERCE_TEST_DATABASE_URL;
if(url&&(!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)||new URL(url).pathname!=='/commerce_test'))throw new Error('Usa commerce_test local desechable.');
describe('Commerce phase 2 - real branch ledger and sellables',{skip:!url},()=>{
  let db,peer,svc,other,stock,sellables,admin;
  const batch=Date.now();let sequence=0;
  const key=()=>`phase2-${batch}-${++sequence}`;
  const code=(expected)=>(e)=>e.code===expected;
  const uuid=async()=>(await db.$queryRaw`SELECT uuidv7()::text AS id`)[0].id;
  before(()=>{db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});peer=new PrismaClient({adapter:new PrismaPg({connectionString:url})});
    svc=createPosRecoveryService({prisma:db});other=createPosRecoveryService({prisma:peer});stock=createCatalogCommerceStock({prisma:db});sellables=createCatalogSellablesService({prisma:db});admin=createCatalogCommerceAdmin({prisma:db});});
  after(async()=>{await db?.$disconnect();await peer?.$disconnect();});
  async function fixture({tracked=true,initial=5,variable=false}={}){
    const suffix=key();
    const company=await db.company.create({data:{id:await uuid(),name:'Commerce phase2',slug:suffix}});
    const actor=await db.userProfile.create({data:{id:await uuid(),authUserId:await uuid(),displayName:'Operador prueba',email:`${suffix}@example.test`}});
    const ctx={companyId:company.id,actorId:actor.id};
    await db.posSettings.create({data:{companyId:company.id,currency:'MXN',defaultTaxRate:0,pricesIncludeTax:false}});
    const outlet=await db.posOutlet.create({data:{companyId:company.id,name:'Centro',mode:'RETAIL'}});
    const outletB=await db.posOutlet.create({data:{companyId:company.id,name:'Norte',mode:'RETAIL'}});
    const terminal=await db.posTerminal.create({data:{companyId:company.id,outletId:outlet.id,name:'Caja 1'}});
    const terminalB=await db.posTerminal.create({data:{companyId:company.id,outletId:outletB.id,name:'Caja 2'}});
    const category=await db.catalogCategory.create({data:{id:await uuid(),companyId:company.id,name:'Bebidas',slug:'drinks',position:3}});
    const product=await db.catalogProduct.create({data:{id:await uuid(),companyId:company.id,name:'Cafe',slug:'coffee',sku:'CAFE',barcode:'000123',categoryId:category.id,
      currency:'MXN',price:100,productType:variable?'VARIABLE':'SIMPLE',stock:variable?0:initial,trackStock:tracked,published:false}});
    const cash=await db.posPaymentMethod.create({data:{companyId:company.id,name:'Efectivo',code:'cash',kind:'CASH'}});
    const run=(action,data,params={},attempt=key(),engine=svc)=>engine.execute(action,ctx,data,params,attempt);
    const session=await run('openSession',{outletId:outlet.id,terminalId:terminal.id,openingCashAmount:'0.00'});
    const sessionB=await run('openSession',{outletId:outletB.id,terminalId:terminalB.id,openingCashAmount:'0.00'});
    return{ctx,company,actor,outlet,outletB,terminal,terminalB,category,product,cash,session,sessionB,run};
  }
  const allocate=(f,quantity,variantId,outletId=f.outlet.id,attempt=key())=>stock.write(f.ctx,f.product.id,{variantId,outletId,quantity,reason:'Asignacion comprobada'},attempt,true);
  async function order(f,{quantity='1',variantId,second=false,session=f.session,terminal=f.terminal}={}){
    const outlet=second?f.outletB:f.outlet;
    if(second){session=f.sessionB;terminal=f.terminalB;}
    let value=await f.run('createOrder',{outletId:outlet.id,terminalId:terminal.id,sessionId:session.id,experience:'RETAIL',fulfillmentType:'TAKEAWAY'});
    return f.run('addLine',{expectedVersion:value.version,productId:f.product.id,variantId,quantity},{orderId:value.id});
  }
  const pay=(f,o,amount=o.remainingAmount,attempt=key(),engine=svc,session=f.session)=>f.run('payment',{expectedVersion:o.version,paymentMethodId:f.cash.id,sessionId:session.id,amount,tenderedAmount:amount},{orderId:o.id},attempt,engine);
  const available=(f,extra={})=>sellables.list(f.company.id,{outletId:f.outlet.id,page:1,pageSize:100,...extra});

  it('keeps historic units unallocated and atomically assigns them without increasing aggregate',async()=>{
    const f=await fixture();const rows=await stock.balances(f.company.id,f.product.id);
    assert.equal(rows[0].outletName,'Sin asignar');assert.equal(rows[0].quantity,5);
    const attempt=key();const a=await allocate(f,3,undefined,undefined,attempt),b=await allocate(f,3,undefined,undefined,attempt);
    assert.deepEqual(a,b);assert.equal((await db.catalogProduct.findUnique({where:{id:f.product.id}})).stock,5);
    const balances=await stock.balances(f.company.id,f.product.id);assert.equal(balances.reduce((s,b)=>s+b.quantity,0),5);
    assert.equal(balances.find((b)=>b.outletId===null).quantity,2);
    await assert.rejects(allocate(f,3),code('INSUFFICIENT_STOCK'));
    assert.equal((await db.catalogProduct.findUnique({where:{id:f.product.id}})).stock,5);
  });
  it('sells a controlled simple product only on final capture, including retry after partial payments',async()=>{
    const f=await fixture();await allocate(f,3);const o=await order(f);
    const partial=await pay(f,o,'20.00');assert.equal(await db.catalogStockMovement.count({where:{sourceType:'POS_SALE',sourceId:o.id}}),0);
    const attempt=key();const a=await pay(f,partial.order,'80.00',attempt),b=await pay(f,partial.order,'80.00',attempt,other);
    assert.deepEqual(a,b);assert.equal((await db.catalogProduct.findUnique({where:{id:f.product.id}})).stock,4);
    assert.equal(await db.catalogStockMovement.count({where:{sourceType:'POS_SALE',sourceId:o.id}}),1);
    assert.equal((await db.catalogStockBalance.findFirst({where:{productId:f.product.id,outletId:f.outlet.id}})).quantity,2);
  });
  it('sells a specific variant, inherits price only when requested and never touches another variant',async()=>{
    const f=await fixture({variable:true});
    const service=createCatalogVariantService({prisma:db});
    const a=await service.createVariant({companyId:f.company.id,productId:f.product.id,data:{sku:'CAFE-S',barcode:'00111',price:50,stock:2,option_values:{size:'Chico'}}});
    const b=await service.createVariant({companyId:f.company.id,productId:f.product.id,data:{sku:'CAFE-L',barcode:'00222',price:null,stock:3,option_values:{size:'Grande'}}});
    await allocate(f,2,a.id);await allocate(f,1,b.id);
    const variants=await sellables.variants(f.company.id,f.product.id,f.outlet.id);
    assert.equal(variants.find((v)=>v.id===b.id).price,'100.00');assert.equal(variants.find((v)=>v.id===b.id).priceInherited,true);
    assert.equal(Number(b.price),100);
    assert.equal(Number((await service.listVariants({companyId:f.company.id,productId:f.product.id})).find((v)=>v.id===b.id).price),100);
    await db.catalogProduct.update({where:{id:f.product.id},data:{published:true}});
    const web=await createCatalogPublicService({prisma:db}).getPublicProductBySlug({companyId:f.company.id,slug:f.product.slug});
    assert.equal(Number(web.variants.find((v)=>v.id===b.id).price),100);
    assert.equal(Number((await createCatalogProductService({prisma:db}).getFullProductById({companyId:f.company.id,id:f.product.id})).variants.find((v)=>v.id===b.id).price),100);
    const o=await order(f,{variantId:a.id});assert.equal(o.lines[0].unitPrice,'50.00');await pay(f,o);
    assert.equal((await db.catalogProductVariant.findUnique({where:{id:a.id}})).stock,1);
    assert.equal((await db.catalogProductVariant.findUnique({where:{id:b.id}})).stock,3);
    assert.equal((await db.catalogProduct.findUnique({where:{id:f.product.id}})).stock,0);
    const match=(await sellables.scan(f.company.id,{outletId:f.outlet.id,code:'00111'})).matches[0];
    assert.equal(match.variantId,a.id);assert.equal(match.sku,'CAFE-S');assert.equal(match.variantLabel,'Chico');assert.equal(match.categoryName,'Bebidas');
  });
  it('implements exact barcode before case-insensitive SKU and structured non-sellable/ambiguous scan',async()=>{
    const f=await fixture();
    const empty=await sellables.scan(f.company.id,{outletId:f.outlet.id,code:'000123'});
    assert.equal(empty.matches[0].unavailableReason,'OUT_OF_STOCK_AT_OUTLET');assert.match(empty.matches[0].unavailableMessage,/Sin asignar/);
    await allocate(f,1);assert.equal((await sellables.scan(f.company.id,{outletId:f.outlet.id,code:'cafe'})).matches[0].available,true);
    const duplicate=await db.catalogProduct.create({data:{id:await uuid(),companyId:f.company.id,name:'Otro',slug:'other',sku:'000123',barcode:'000123',price:20,currency:'MXN'}});
    const result=await sellables.scan(f.company.id,{outletId:f.outlet.id,code:'000123'});assert.equal(result.ambiguous,true);assert.equal(result.matches.length,2);
    await db.catalogProduct.update({where:{id:duplicate.id},data:{enabled:false}});
    assert.equal((await sellables.scan(f.company.id,{outletId:f.outlet.id,code:'000123'})).matches.find((m)=>m.productId===duplicate.id).unavailableReason,'DISABLED');
    assert.equal((await sellables.scan(f.company.id,{outletId:f.outlet.id,code:'123'})).matches.length,0);
  });
  it('reports currency and missing-variant blocks and respects configured category order',async()=>{
    const f=await fixture({tracked:false,variable:true});
    assert.equal((await available(f)).data[0].unavailableReason,'NO_ACTIVE_VARIANT');
    await assert.rejects(order(f),code('VARIANT_REQUIRED'));
    const variant=await createCatalogVariantService({prisma:db}).createVariant({companyId:f.company.id,productId:f.product.id,data:{price:null,sku:'FOREIGN-MONEY'}});
    await db.catalogProduct.update({where:{id:f.product.id},data:{currency:'USD'}});
    assert.equal((await sellables.scan(f.company.id,{outletId:f.outlet.id,code:'FOREIGN-MONEY'})).matches[0].unavailableReason,'CURRENCY_MISMATCH');
    await assert.rejects(order(f,{variantId:variant.id}),code('CURRENCY_MISMATCH'));
    const first=await db.catalogCategory.create({data:{id:await uuid(),companyId:f.company.id,name:'Primera',slug:'first',position:0}});
    assert.deepEqual((await sellables.categories(f.company.id,f.outlet.id)).map((c)=>c.id),[first.id,f.category.id]);
  });
  it('paginates 501 products by category and searches parent/variant SKU, name and barcode',async()=>{
    const f=await fixture({tracked:false});
    await db.$executeRaw`INSERT INTO catalog_product(company_id,category_id,name,slug,sku,barcode,price,currency)
      SELECT ${f.company.id}::uuid,${f.category.id}::uuid,'Product '||lpad(i::text,4,'0'),'bulk-'||i,'SKU-'||lpad(i::text,4,'0'),'BC'||i,10,'MXN' FROM generate_series(1,501) i`;
    const first=await available(f,{search:'Product',categoryId:f.category.id,pageSize:100});assert.equal(first.data.length,100);assert.equal(first.pagination.total,501);
    const last=await available(f,{search:'Product',categoryId:f.category.id,pageSize:100,page:6});assert.equal(last.data.length,1);assert.equal(last.pagination.hasMore,false);
    assert.equal((await available(f,{search:'SKU-0501'})).data[0].name,'Product 0501');
    assert.equal((await available(f,{search:'BC501'})).data[0].sku,'SKU-0501');
    const generic=createCatalogProductService({prisma:db});assert.equal((await generic.listProducts({companyId:f.company.id,search:'SKU-0501',categoryId:f.category.id})).total,1);
  });
  it('separates web publishing, branch policy and inherited availability',async()=>{
    const f=await fixture();await allocate(f,1);await allocate(f,1,null,f.outletB.id);
    await db.catalogProduct.update({where:{id:f.product.id},data:{published:true}});
    await admin.write(f.ctx,f.product.id,{outletId:f.outlet.id,enabled:false},key());
    assert.equal((await available(f)).data[0].unavailableReason,'NOT_AVAILABLE_AT_OUTLET');
    assert.equal((await available(f,{outletId:f.outletB.id})).data[0].available,true);
    await assert.rejects(order(f),code('NOT_AVAILABLE_AT_OUTLET'));
    const o=await order(f,{second:true});await pay(f,o,o.remainingAmount,key(),svc,f.sessionB);
    const general=await admin.availability(f.company.id,f.product.id);assert.equal(general.outlets.length,2);
    assert.equal(general.outlets.find((o)=>o.outletId===f.outlet.id).inherited,false);
    await admin.write(f.ctx,f.product.id,{outletId:f.outlet.id,enabled:null},key());
    assert.equal((await admin.availability(f.company.id,f.product.id)).outlets.find((o)=>o.outletId===f.outlet.id).inherited,true);
    assert.equal((await db.catalogProduct.findUnique({where:{id:f.product.id}})).published,true);
  });
  it('rejects grouped quantities beyond stock and competing sales against the last unit',async()=>{
    const f=await fixture({initial:1});await allocate(f,1);
    const a=await order(f),terminal=await db.posTerminal.create({data:{companyId:f.company.id,outletId:f.outlet.id,name:'Extra'}});
    const session=await f.run('openSession',{outletId:f.outlet.id,terminalId:terminal.id,openingCashAmount:'0.00'});
    const b=await order(f,{terminal,session});
    const races=await Promise.allSettled([pay(f,a),pay(f,b,b.remainingAmount,key(),other,session)]);
    assert.equal(races.filter((r)=>r.status==='fulfilled').length,1);assert.equal(races.find((r)=>r.status==='rejected').reason.code,'INSUFFICIENT_STOCK');
    assert.equal((await db.catalogProduct.findUnique({where:{id:f.product.id}})).stock,0);
    assert.equal(await db.posPayment.count({where:{companyId:f.company.id}}),1);
    const g=await fixture({initial:1});await allocate(g,1);let o=await order(g);
    o=await g.run('addLine',{expectedVersion:o.version,productId:g.product.id,quantity:'1'},{orderId:o.id});
    await assert.rejects(pay(g,o),code('INSUFFICIENT_STOCK'));
    assert.equal(await db.posPayment.count({where:{companyId:g.company.id}}),0);
  });
  it('quotes a partial refund without side effects then atomically restores only the sold quantity once',async()=>{
    const f=await fixture({initial:2});await allocate(f,2);const o=await order(f,{quantity:'2'});const paid=await pay(f,o);
    const before=await db.posCommand.count({where:{companyId:f.company.id}});
    const input={expectedVersion:paid.order.version,lines:[{orderLineId:o.lines[0].id,quantity:'1',restock:true}]};
    const quote=await createPosRefundQuoteService({prisma:db}).preview(f.company.id,o.id,input);
    assert.equal(quote.totalAmount,'100.00');assert.equal(quote.payments[0].maxRefundable,'200.00');assert.equal(quote.lines[0].stockRestorable,true);
    await assert.rejects(createPosRefundQuoteService({prisma:db}).preview(f.company.id,o.id,{...input,lines:[{...input.lines[0],quantity:'0.5',restock:false}]}),code('VALIDATION_ERROR'));
    assert.equal(await db.posCommand.count({where:{companyId:f.company.id}}),before);assert.equal(await db.posRefund.count({where:{orderId:o.id}}),0);
    const request={...input,reason:'Regreso comprobado',sessionId:f.session.id,payments:quote.payments.filter((p)=>Number(p.amount)>0).map(({paymentId,amount})=>({paymentId,amount}))},attempt=key();
    const [a,b]=await Promise.all([f.run('refund',request,{orderId:o.id},attempt),f.run('refund',request,{orderId:o.id},attempt,other)]);
    assert.deepEqual(a,b);assert.equal(a.refund.lines[0].stockRestored,true);
    assert.equal((await db.catalogProduct.findUnique({where:{id:f.product.id}})).stock,1);
    const original=await db.catalogStockMovement.findFirst({where:{sourceId:o.id,sourceType:'POS_SALE'}});
    assert.equal(await db.catalogStockMovement.count({where:{reversalOfId:original.id}}),1);
    const movement=(await admin.movements(f.company.id,f.product.id)).data.find((m)=>m.sourceType==='POS_REFUND');
    assert.equal(movement.orderId,o.id);assert.equal(movement.orderNumber,o.orderNumber);assert.equal(movement.actorName,f.actor.displayName);
    await assert.rejects(createPosRefundQuoteService({prisma:db}).preview(f.company.id,o.id,input),code('ORDER_VERSION_CONFLICT'));
  });
  it('reconciles negative legacy balances explicitly and audits manual branch stock with stable retries',async()=>{
    const f=await fixture({initial:-3});
    assert.equal((await stock.balances(f.company.id,f.product.id))[0].quantity,-3);
    await stock.write(f.ctx,f.product.id,{outletId:null,quantityDelta:3,reason:'Conteo del saldo anterior'},key());
    assert.equal((await db.catalogProduct.findUnique({where:{id:f.product.id}})).stock,0);
    const input={outletId:f.outlet.id,quantityDelta:2,reason:'Compra comprobada'},attempt=key();
    const [a,b]=await Promise.all([stock.write(f.ctx,f.product.id,input,attempt),stock.write(f.ctx,f.product.id,input,attempt)]);
    assert.deepEqual(a,b);assert.equal((await db.catalogProduct.findUnique({where:{id:f.product.id}})).stock,2);
    await assert.rejects(stock.write(f.ctx,f.product.id,{...input,quantityDelta:-3},key()),code('INSUFFICIENT_STOCK'));
    assert.equal((await db.catalogProduct.findUnique({where:{id:f.product.id}})).stock,2);
    assert.equal(await db.auditLog.count({where:{companyId:f.company.id,action:'catalog.stock.adjust'}}),2);
  });
  it('rolls back stock, aggregate, payment, receipt, audit and attempt response together',async()=>{
    const f=await fixture({initial:1});await allocate(f,1);const o=await order(f),attempt=key();
    const failing=db.$extends({query:{auditLog:{async create(){throw new Error('stock-audit-failure');}}}});
    await assert.rejects(pay(f,o,o.remainingAmount,attempt,createPosRecoveryService({prisma:failing})),/stock-audit-failure/);
    assert.equal((await db.catalogProduct.findUnique({where:{id:f.product.id}})).stock,1);assert.equal(await db.posPayment.count({where:{orderId:o.id}}),0);
    assert.equal(await db.catalogStockMovement.count({where:{sourceId:o.id}}),0);assert.equal(await db.posCommand.count({where:{companyId:f.company.id,key:attempt}}),0);
    await pay(f,o,o.remainingAmount,attempt);
  });
  it('keeps server pricing, inherited taxes, historical totals and payment/refund previews consistent',async()=>{
    const f=await fixture({tracked:false});await db.catalogProduct.update({where:{id:f.product.id},data:{price:116}});
    await admin.write(f.ctx,f.product.id,{rate:'16.0000',included:true},key(),true);
    const o=await order(f);assert.equal(o.taxAmount,'16.00');assert.equal(o.subtotalAmount,'100.00');
    const paid=await pay(f,o);await db.catalogProduct.update({where:{id:f.product.id},data:{price:200}});
    const quote=await createPosRefundQuoteService({prisma:db}).preview(f.company.id,o.id,{expectedVersion:paid.order.version,lines:[{orderLineId:o.lines[0].id,quantity:'0.5',restock:false}]});
    assert.equal(quote.totalAmount,'58.00');assert.equal(quote.taxAmount,'8.00');assert.equal((await svc.getOrder(f.company.id,o.id)).totalAmount,'116.00');
    assert.equal((await available(f)).data[0].price,'200.00');
  });
  it('enforces tenant/branch/product-variant scope, stock ledger writes and actual route permissions',async()=>{
    const f=await fixture(),g=await fixture({variable:true});
    await assert.rejects(stock.write(f.ctx,f.product.id,{outletId:g.outlet.id,quantity:1,reason:'No'},key(),true),code('NOT_FOUND'));
    await assert.rejects(sellables.scan(f.company.id,{outletId:g.outlet.id,code:'000123'}),code('NOT_FOUND'));
    const v=await db.catalogProductVariant.create({data:{id:await uuid(),companyId:g.company.id,productId:g.product.id,price:1}});
    const variants=createCatalogVariantService({prisma:db});
    await assert.rejects(variants.updateVariant({companyId:f.company.id,productId:f.product.id,variantId:v.id,data:{price:1}}),code('NOT_FOUND'));
    await assert.rejects(db.catalogProduct.update({where:{id:f.product.id},data:{stock:999}}));
    const authorize=(keys)=>async(c,next)=>{const permissions=new Set((c.req.header('X-Test-Permissions')??'').split(','));c.set('companyId',f.company.id);c.set('userId',f.actor.id);c.set('userContext',{permissionSet:permissions,isAdmin:false});if(!keys.some((k)=>permissions.has(k)))return c.json({error:'Sin permiso'},403);return next();};
    const deps={prisma:db,requirePermission:(k)=>authorize([k]),requireAnyPermission:authorize};const app=new Hono();app.route('',createCatalogRouter(deps));app.route('',createPosRouter(deps));
    const headers={'X-Test-Permissions':'pos.caja.read','Content-Type':'application/json'};
    assert.equal((await app.request(`/pos/v2/sellables?outletId=${f.outlet.id}`,{headers})).status,200);
    const denied=await app.request(`/catalog/products/${f.product.id}/stock-balances`,{headers});
    assert.equal(denied.status,403);assert.equal((await denied.json()).error.code,'FORBIDDEN');
    const operator={'X-Test-Permissions':'catalog.products.read,catalog.inventory.adjust','Content-Type':'application/json','Idempotency-Key':key()};
    const response=await app.request(`/catalog/products/${f.product.id}/stock-allocations`,{method:'POST',headers:operator,body:JSON.stringify({outletId:f.outlet.id,quantity:1,reason:'Asignar'})});
    assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
    const adminHeaders={...operator,'X-Test-Permissions':'catalog.products.read,catalog.products.update'};
    assert.equal((await app.request(`/catalog/products/${f.product.id}`,{method:'PATCH',headers:adminHeaders,body:JSON.stringify({stock:9})})).status,400);
    const filtered=await app.request(`/catalog/products?category_id=${f.category.id}&search=CAFE`,{headers:adminHeaders});
    assert.equal(filtered.status,200);assert.equal((await filtered.json()).pagination.total,1);
    const listing=await app.request(`/catalog/products?outletId=${f.outlet.id}&posAvailable=true`,{headers:adminHeaders});assert.equal(listing.status,200,JSON.stringify(await listing.clone().json()));
    const variable=await db.catalogProduct.create({data:{id:await uuid(),companyId:f.company.id,name:'Variant HTTP',slug:'variant-http',price:20,productType:'VARIABLE'}});
    const created=await app.request(`/catalog/products/${variable.id}/variants`,{method:'POST',headers:adminHeaders,body:JSON.stringify({option_values:{size:'Grande'},price:null,sku:'HTTP-V'})});
    assert.equal(created.status,201,JSON.stringify(await created.clone().json()));assert.equal(Number((await created.json()).data.price),20);
    const noKey=await app.request(`/catalog/products/${f.product.id}/stock-movements`,{method:'POST',headers:{'X-Test-Permissions':'catalog.inventory.adjust','Content-Type':'application/json'},body:JSON.stringify({outletId:f.outlet.id,quantityDelta:1,reason:'Ajuste'})});
    assert.equal(noKey.status,428);assert.equal((await noKey.json()).error.code,'IDEMPOTENCY_REQUIRED');
    const paid=await pay(f,await order(f));
    const quoteResponse=await app.request(`/pos/v2/orders/${paid.order.id}/refunds/preview`,{method:'POST',headers:{...headers,'X-Test-Permissions':'pos.refunds.create'},body:JSON.stringify({expectedVersion:paid.order.version,lines:[{orderLineId:paid.order.lines[0].id,quantity:'1',restock:true}]})});
    assert.equal(quoteResponse.status,200,JSON.stringify(await quoteResponse.clone().json()));assert.equal((await quoteResponse.json()).data.totalAmount,'100.00');
  });
});
