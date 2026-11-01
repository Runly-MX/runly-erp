import {before,after,describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {Hono} from 'hono';
import {createPosRouter} from '../pos-routes.js';
import {createCatalogRouter} from '../../catalog/index.js';
import {createRunlyClient} from '../../../../../../packages/sdk/src/index.js';
import {createPosReceiptService} from '../pos-receipt-service.js';

const url=process.env.RUNLY_COMMERCE_TEST_DATABASE_URL;
if(url&&(!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)||new URL(url).pathname!=='/commerce_test'))throw new Error('Usa commerce_test local desechable.');
describe('Retail phase 3: real API, SDK, receipts and print attempts',{skip:!url},()=>{
  let db,peer;let sequence=0;
  const key=()=>`retail-phase3-${Date.now()}-${++sequence}`;
  const uuid=async()=>(await db.$queryRaw`SELECT uuidv7()::text AS id`)[0].id;
  const grants='pos.caja.operate,pos.caja.close,pos.orders.cancel,pos.refunds.create';
  before(()=>{db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});peer=new PrismaClient({adapter:new PrismaPg({connectionString:url})});});
  after(async()=>{await db?.$disconnect();await peer?.$disconnect();});
  function router(f,prisma=db){
    const app=new Hono();app.use('*',async(c,next)=>{
      const set=new Set((c.req.header('X-Test-Permissions')??grants).split(','));
      c.set('companyId',c.req.header('X-Test-Company')??f.company.id);c.set('userId',c.req.header('X-Test-Actor')??f.actor.id);c.set('userContext',{isAdmin:false,permissionSet:set});return next();
    });
    const any=(keys)=>async(c,next)=>{if(!keys.some((k)=>c.get('userContext').permissionSet.has(k)))return c.json({error:'Sin permiso'},403);return next();};
    const deps={prisma,requirePermission:(k)=>any([k]),requireAnyPermission:any};
    app.route('',createCatalogRouter(deps));app.route('',createPosRouter(deps));return app;
  }
  function client(f,app=router(f),extra={},drop){
    return createRunlyClient({baseUrl:'https://example.test',getActiveCompanyId:()=>f.company.id,fetch:async(url,options)=>{
      const response=await app.request(new URL(url).pathname+new URL(url).search,{...options,headers:{...options.headers,...extra}});
      if(drop?.(new URL(url).pathname,options,response))throw new TypeError('Response lost after commit');
      return response;
    }});
  }
  async function fixture({initial=2,variable=false}={}){
    const company=await db.company.create({data:{id:await uuid(),name:'Retail test',slug:key()}});
    const actor=await db.userProfile.create({data:{id:await uuid(),authUserId:await uuid(),displayName:'Caja test',email:`${key()}@example.test`}});
    await db.posSettings.create({data:{companyId:company.id,currency:'MXN',defaultTaxRate:0,pricesIncludeTax:false}});
    const outlet=await db.posOutlet.create({data:{companyId:company.id,name:'Centro',mode:'RETAIL'}});
    const terminal=await db.posTerminal.create({data:{companyId:company.id,outletId:outlet.id,name:'Caja 1'}});
    const cash=await db.posPaymentMethod.create({data:{companyId:company.id,name:'Efectivo',code:'cash',kind:'CASH'}});
    const product=await db.catalogProduct.create({data:{id:await uuid(),companyId:company.id,name:'Articulo <script>alert(1)</script>\u001b',slug:'articulo',price:100,currency:'MXN',barcode:'000101',trackStock:true,stock:variable?0:initial,productType:variable?'VARIABLE':'SIMPLE'}});
    const f={company,actor,outlet,terminal,cash,product};f.app=router(f);f.client=client(f,f.app);
    const current=await f.client.commerce.currentSession({outletId:outlet.id,terminalId:terminal.id},'token');assert.equal(current.data,null);
    f.session=(await f.client.commerce.openSession({outletId:outlet.id,terminalId:terminal.id,openingCashAmount:'0.00'},'token',{idempotencyKey:key()})).data;
    if(!variable&&initial>0)await f.app.request(`/catalog/products/${product.id}/stock-allocations`,{method:'POST',headers:{'Content-Type':'application/json','X-Test-Permissions':'catalog.inventory.adjust','Idempotency-Key':key()},body:JSON.stringify({outletId:outlet.id,quantity:initial,reason:'Asignación fixture'})}).then(async(r)=>assert.equal(r.status,200,JSON.stringify(await r.json())));
    return f;
  }
  const options=()=>({idempotencyKey:key()});
  async function order(f,{quantity='1',variantId,terminal=f.terminal,session=f.session,api=f.client}={}){
    let o=(await api.commerce.createOrder({outletId:f.outlet.id,terminalId:terminal.id,sessionId:session.id,experience:'RETAIL',fulfillmentType:'TAKEAWAY'},'token',options())).data;
    return (await api.commerce.addLine(o.id,{expectedVersion:o.version,productId:f.product.id,variantId,quantity},'token',options())).data;
  }
  const pay=(f,o,api=f.client,attempt=options(),extra={})=>api.commerce.addPayment(o.id,{expectedVersion:o.version,paymentMethodId:f.cash.id,sessionId:f.session.id,amount:o.remainingAmount,tenderedAmount:o.remainingAmount,...extra},'token',attempt);

  it('opens with cashier grants, sells retail without seats/kitchen and returns 100 change from 200',async()=>{
    const f=await fixture(),api=client(f,f.app,{'X-Test-Permissions':'pos.caja.operate'});
    const context=(await api.commerce.context({outletId:f.outlet.id,terminalId:f.terminal.id},'token')).data;
    assert.equal(context.operationState,'READY');assert.equal(context.currentSession.id,f.session.id);assert.equal(context.capabilities.floorPlanner,false);assert.equal(context.capabilities.closeSession,false);
    await assert.rejects(api.commerce.closeSession(f.session.id,{countedCashAmount:'0.00'},'token',options()),{code:'FORBIDDEN'});
    const scan=(await api.commerce.scan({outletId:f.outlet.id,code:'000101'},'token')).data;assert.equal(scan.matches[0].productId,f.product.id);
    const o=await order(f);assert.equal(o.guestCount,0);assert.equal(o.tableId,null);assert.equal(o.waiterId,null);assert.equal(o.guests.length,0);
    const attempt=options();const a=await pay(f,o,api,attempt,{tenderedAmount:'200.00'}),b=await pay(f,o,api,attempt,{tenderedAmount:'200.00'});
    assert.deepEqual(a,b);assert.equal(a.data.payment.amount,'100.00');assert.equal(a.data.payment.changeAmount,'100.00');
    assert.equal(await db.posPayment.count({where:{orderId:o.id}}),1);assert.equal(await db.posKitchenTicket.count({where:{orderId:o.id}}),0);
    const receipt=(await api.commerce.getReceipt(a.data.receiptId,'token')).data;
    assert.equal(receipt.document.totals.totalAmount,'100.00');assert.equal(receipt.document.payments[0].tenderedAmount,'200.00');assert.equal(receipt.document.payments[0].changeAmount,'100.00');
    assert.equal(receipt.printStatus,'GENERATED');assert.equal(receipt.printJobs.length,0);
    assert.deepEqual((await api.commerce.getReceipt(receipt.id,'token')).data,receipt);
  });

  it('creates idempotent immutable print attempts, escapes HTML, records failed/submitted and reprints a copy',async()=>{
    const f=await fixture(),paid=(await pay(f,await order(f))).data;
    const attempt=options(),body={transport:'BROWSER'};
    const [a,b]=await Promise.all([f.client.commerce.createPrintJob(paid.receiptId,body,'token',attempt),client(f,router(f,peer)).commerce.createPrintJob(paid.receiptId,body,'token',attempt)]);
    assert.deepEqual(a,b);assert.equal(a.data.status,'QUEUED');assert.equal(a.data.copy,false);assert.ok(a.data.payload.html.includes('&lt;script&gt;'));assert.ok(!a.data.payload.html.includes('<script>'));assert.ok(a.data.payload.html.includes('Aplicado neto 100.00'));
    const resultOptions=options();const failed=await f.client.commerce.finishPrintJob(a.data.jobId,{status:'FAILED',errorCode:'PRINTER_ABSENT'},'token',resultOptions);
    assert.deepEqual(await f.client.commerce.finishPrintJob(a.data.jobId,{status:'FAILED',errorCode:'PRINTER_ABSENT'},'token',resultOptions),failed);
    const alias=await f.app.request(`/pos/v2/receipts/${paid.receiptId}/print-jobs/${a.data.jobId}/result`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':resultOptions.idempotencyKey},body:JSON.stringify({status:'FAILED',errorCode:'PRINTER_ABSENT'})});
    assert.equal(alias.status,200);assert.deepEqual(await alias.json(),failed);
    await assert.rejects(f.client.commerce.finishPrintJob(a.data.jobId,{status:'SUBMITTED'},'token',options()),{code:'INVALID_TRANSITION'});
    const second=(await f.client.commerce.createPrintJob(paid.receiptId,{transport:'BLUETOOTH',reason:'Reintento impresora'},'token',options())).data;
    assert.equal(second.copy,true);const text=Buffer.from(second.payload.dataBase64,'base64').toString('ascii');assert.match(text,/COPIA/);assert.ok(!text.includes('\u001b'));
    const submitted=await f.client.commerce.finishPrintJob(second.jobId,{status:'SUBMITTED'},'token',options());assert.equal(submitted.data.physicalConfirmationSupported,false);
    const receipt=(await f.client.commerce.getReceipt(paid.receiptId,'token')).data;assert.equal(receipt.printStatus,'SUBMITTED');assert.equal(receipt.confirmedPrintCount,0);assert.equal(receipt.printedCount,0);
    assert.equal(await db.posReceipt.count({where:{orderId:paid.order.id}}),1);assert.equal(await db.posPayment.count({where:{orderId:paid.order.id}}),1);
    await assert.rejects(f.client.commerce.finishPrintJob(second.jobId,{status:'CONFIRMED'},'token',options()),{code:'VALIDATION_ERROR'});
    await assert.rejects(db.posReceipt.update({where:{id:paid.receiptId},data:{printedCount:1}}));
    await assert.rejects(db.posPrintJob.update({where:{id:second.jobId},data:{payload:{forged:true}}}));
  });

  it('authorizes print results by actor/admin and isolates company, receipt and job paths',async()=>{
    const f=await fixture(),g=await fixture(),paid=(await pay(f,await order(f))).data;
    const job=(await f.client.commerce.createPrintJob(paid.receiptId,{transport:'BROWSER'},'token',options())).data;
    await assert.rejects(g.client.commerce.getReceipt(paid.receiptId,'token'),{code:'NOT_FOUND'});
    const impostor=client(f,f.app,{'X-Test-Actor':g.actor.id});
    await assert.rejects(impostor.commerce.finishPrintJob(job.jobId,{status:'FAILED'},'token',options()),{code:'FORBIDDEN'});
    const denied=await f.app.request(`/pos/v2/receipts/${await uuid()}/print-jobs/${job.jobId}/result`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key()},body:JSON.stringify({status:'FAILED'})});assert.equal(denied.status,404);
    const admin=client(f,f.app,{'X-Test-Actor':g.actor.id,'X-Test-Permissions':'pos.admin.update'});
    assert.equal((await admin.commerce.finishPrintJob(job.jobId,{status:'FAILED',errorCode:'USER_CANCELLED'},'token',options())).data.status,'FAILED');
  });

  it('supports line changes/removal, discount permissions, scoped history filters and frozen price/variant label',async()=>{
    const f=await fixture({variable:true});
    const v=await db.catalogProductVariant.create({data:{id:await uuid(),companyId:f.company.id,productId:f.product.id,optionValues:{Talla:'Grande'},price:50,stock:2}});
    await f.app.request(`/catalog/products/${f.product.id}/stock-allocations`,{method:'POST',headers:{'Content-Type':'application/json','X-Test-Permissions':'catalog.inventory.adjust','Idempotency-Key':key()},body:JSON.stringify({variantId:v.id,outletId:f.outlet.id,quantity:2,reason:'Stock variante'})});
    let o=await order(f,{variantId:v.id});assert.equal(o.lines[0].unitPrice,'50.00');
    o=(await f.client.commerce.updateLine(o.id,o.lines[0].id,{expectedVersion:o.version,quantity:'2'},'token',options())).data;assert.equal(o.totalAmount,'100.00');
    await assert.rejects(f.client.commerce.discount(o.id,o.lines[0].id,{expectedVersion:o.version,amount:'1.00',reason:'Autorizado'},'token',options()),{code:'FORBIDDEN'});
    const discounts=client(f,f.app,{'X-Test-Permissions':grants+',pos.discounts.apply'});
    o=(await discounts.commerce.discount(o.id,o.lines[0].id,{expectedVersion:o.version,amount:'0.00',reason:'Autorizado'},'token',options())).data;
    const paid=(await pay(f,o)).data;
    await db.catalogProductVariant.update({where:{id:v.id},data:{price:500,optionValues:{Talla:'Cambio'}}});
    const receipt=(await f.client.commerce.getReceipt(paid.receiptId,'token')).data;assert.equal(receipt.document.lines[0].variantLabel,'Grande');assert.equal(receipt.document.lines[0].unitPrice,'50.00');
    const query={outletId:f.outlet.id,terminalId:f.terminal.id,experience:'RETAIL',search:String(receipt.receiptNumber),from:'2020-01-01',to:'2099-01-01',page:1,pageSize:1};
    const history=await f.client.commerce.listOrders(query,'token');assert.equal(history.pagination.total,1);assert.equal(history.data[0].lineCount,1);assert.equal(history.data[0].receiptNumber,receipt.receiptNumber);
    const draft=await order(f,{variantId:v.id});const removed=(await f.client.commerce.deleteLine(draft.id,draft.lines[0].id,{expectedVersion:draft.version},'token',options())).data;assert.equal(removed.totalAmount,'0.00');
    await assert.rejects(f.client.commerce.listOrders({...query,from:'2026-99-01'},'token'),{code:'VALIDATION_ERROR'});
  });

  it('recovers a committed order after lost response with one order and blocks missing/closed/foreign contexts',async()=>{
    const f=await fixture();let dropped=false;
    const flaky=client(f,f.app,{},(path,opts)=>{if(path==='/pos/v2/orders'&&opts.method==='POST'&&!dropped){dropped=true;return true;}return false;});
    const body={outletId:f.outlet.id,terminalId:f.terminal.id,sessionId:f.session.id,experience:'RETAIL',fulfillmentType:'TAKEAWAY'},attempt=options();
    await assert.rejects(flaky.commerce.createOrder(body,'token',attempt),/Response lost/);
    const recovered=(await flaky.commerce.createOrder(body,'token',attempt)).data;
    assert.equal(await db.posOrder.count({where:{companyId:f.company.id}}),1);assert.equal((await f.client.commerce.getOrder(recovered.id,'token')).data.id,recovered.id);
    await assert.rejects(f.client.commerce.createOrder({outletId:f.outlet.id,experience:'RETAIL',fulfillmentType:'TAKEAWAY'},'token',options()),{code:'VALIDATION_ERROR'});
    await f.client.commerce.closeSession(f.session.id,{countedCashAmount:'0.00'},'token',options());
    await assert.rejects(f.client.commerce.addLine(recovered.id,{expectedVersion:recovered.version,productId:f.product.id,quantity:'1'},'token',options()),{code:'INVALID_TRANSITION'});
    const empty=await client(f,f.app,{'X-Test-Company':(await fixture()).company.id}).commerce.listOrders({experience:'RETAIL'},'token');assert.equal(empty.data.length,0);
  });

  it('prevents overselling across two boxes, insufficient stock and wrong terminal captures',async()=>{
    const f=await fixture({initial:1}),t=await db.posTerminal.create({data:{companyId:f.company.id,outletId:f.outlet.id,name:'Caja 2'}});
    const s=(await f.client.commerce.openSession({outletId:f.outlet.id,terminalId:t.id,openingCashAmount:'0.00'},'token',options())).data;
    const a=await order(f),b=await order(f,{terminal:t,session:s}),api=client(f,router(f,peer));
    await assert.rejects(pay(f,b),{code:'NOT_FOUND'});
    const responses=await Promise.allSettled([pay(f,a),pay(f,b,api,options(),{sessionId:s.id})]);
    assert.equal(responses.filter((r)=>r.status==='fulfilled').length,1);assert.equal(responses.find((r)=>r.status==='rejected').reason.code,'INSUFFICIENT_STOCK');
    assert.equal((await db.catalogProduct.findUnique({where:{id:f.product.id}})).stock,0);
  });

  it('previews partial refunds, restores once, preserves sale snapshot, and closes a reconciled cash box',async()=>{
    const f=await fixture(),o=await order(f,{quantity:'2'}),paid=(await pay(f,o)).data;
    const before=(await f.client.commerce.getReceipt(paid.receiptId,'token')).data;
    const input={expectedVersion:paid.order.version,lines:[{orderLineId:o.lines[0].id,quantity:'1',restock:true}]};
    const quote=(await f.client.commerce.refundPreview(o.id,input,'token')).data;assert.equal(quote.totalAmount,'100.00');
    const body={...input,sessionId:f.session.id,reason:'Regreso',payments:quote.payments.filter((p)=>Number(p.amount)>0).map(({paymentId,amount})=>({paymentId,amount}))},attempt=options();
    const refunded=await f.client.commerce.refund(o.id,body,'token',attempt);assert.deepEqual(await f.client.commerce.refund(o.id,body,'token',attempt),refunded);
    assert.equal((await db.catalogProduct.findUnique({where:{id:f.product.id}})).stock,1);
    assert.deepEqual((await f.client.commerce.getReceipt(paid.receiptId,'token')).data,before);
    const refundReceipt=(await f.client.commerce.getReceipt(refunded.data.receiptId,'token')).data;assert.equal(refundReceipt.document.kind,'REFUND');assert.equal(refundReceipt.document.totals.totalAmount,'100.00');
    assert.equal((await f.client.commerce.expectedCash(f.session.id,'token')).data.expectedCashAmount,'100.00');
    const closed=(await f.client.commerce.closeSession(f.session.id,{countedCashAmount:'100.00'},'token',options())).data;assert.equal(closed.differenceAmount,'0.00');
    const session=(await f.client.commerce.getSession(f.session.id,'token')).data;assert.equal(session.frozen,true);assert.equal(session.breakdown.refundOut,'100.00');
  });

  it('protects paid advances from cancellation and creates a coherent advance-refund receipt',async()=>{
    const f=await fixture(),o=await order(f),partial=(await pay(f,o,f.client,options(),{amount:'20.00',tenderedAmount:'20.00'})).data;
    await assert.rejects(f.client.commerce.cancel(o.id,{expectedVersion:partial.order.version,reason:'Cancelar'},'token',options()),{code:'REFUND_REQUIRED'});
    const quote=(await f.client.commerce.refundPreview(o.id,{expectedVersion:partial.order.version,lines:[]},'token')).data;
    const returned=(await f.client.commerce.refund(o.id,{expectedVersion:partial.order.version,sessionId:f.session.id,lines:[],reason:'Anticipo',payments:[{paymentId:quote.payments[0].paymentId,amount:'20.00'}]},'token',options())).data;
    const receipt=(await f.client.commerce.getReceipt(returned.receiptId,'token')).data;assert.equal(receipt.document.totals.subtotalAmount,'20.00');assert.equal(receipt.document.totals.totalAmount,'20.00');
    assert.equal(await db.catalogStockMovement.count({where:{sourceId:o.id,sourceType:'POS_SALE'}}),0);
  });

  it('preserves incomplete historic receipts and rolls back failed print audits without touching payments',async()=>{
    const f=await fixture(),o=await order(f),paid=(await pay(f,o)).data;
    const legacy=await db.posReceipt.create({data:{companyId:f.company.id,orderId:o.id,receiptNumber:2,kind:'SALE',printedCount:5,payload:{legacy:true}}});
    const read=(await f.client.commerce.getReceipt(legacy.id,'token')).data;
    assert.equal(read.printable,false);assert.equal(read.legacyPrintedCount,5);assert.equal(read.confirmedPrintCount,0);assert.deepEqual(read.payload,{legacy:true});
    await assert.rejects(f.client.commerce.createPrintJob(legacy.id,{transport:'BROWSER'},'token',options()),{code:'RECONCILIATION_REQUIRED'});
    const failing=db.$extends({query:{auditLog:{async create(){throw new Error('print-audit-failure');}}}});
    const service=createPosReceiptService({prisma:failing}),ctx={companyId:f.company.id,actorId:f.actor.id},attempt=key();
    await assert.rejects(service.create(ctx,paid.receiptId,{transport:'BROWSER'},attempt),/print-audit-failure/);
    assert.equal(await db.posPrintJob.count({where:{companyId:f.company.id}}),0);
    assert.equal(await db.posCommand.count({where:{companyId:f.company.id,key:attempt}}),0);
    const job=await createPosReceiptService({prisma:db}).create(ctx,paid.receiptId,{transport:'BROWSER'},attempt);
    const resultKey=key();await assert.rejects(service.result(ctx,job.jobId,{status:'FAILED'},resultKey,{permissionSet:new Set(['pos.caja.operate'])}),/print-audit-failure/);
    assert.equal((await db.posPrintJob.findUnique({where:{id:job.jobId}})).status,'QUEUED');
    assert.equal(await db.posPayment.count({where:{orderId:o.id}}),1);
    const oldCopy=await db.posReceipt.create({data:{companyId:f.company.id,orderId:o.id,receiptNumber:3,kind:'REPRINT',printedCount:1,payload:paid.order}});
    const copy=(await f.client.commerce.getReceipt(oldCopy.id,'token')).data;
    assert.equal(copy.document.copy,true);assert.equal(copy.document.totals.totalAmount,'100.00');assert.equal(copy.legacyPrintedCount,1);
    assert.ok((await f.client.commerce.getOrder(o.id,'token')).data.receipts.some((r)=>r.id===oldCopy.id));
    assert.equal((await f.client.commerce.createPrintJob(oldCopy.id,{transport:'BROWSER'},'token',options())).data.copy,true);
  });

  it('blocks unverified context currency, foreign filters and cross-company stock print references',async()=>{
    const f=await fixture(),g=await fixture();
    const o=await order(f),waiter=client(f,f.app,{'X-Test-Permissions':'pos.comandas.charge'});
    await assert.rejects(pay(f,o,waiter,options(),{sessionId:undefined}),{code:'VALIDATION_ERROR'});
    assert.equal(await db.posWaiterShift.count({where:{companyId:f.company.id}}),0);
    await assert.rejects(f.client.commerce.listOrders({terminalId:g.terminal.id},'token'),{code:'NOT_FOUND'});
    await assert.rejects(f.client.commerce.currentSession({outletId:g.outlet.id,terminalId:f.terminal.id},'token'),{code:'NOT_FOUND'});
    await db.posSettings.update({where:{companyId:f.company.id},data:{currency:'USD'}});
    const context=(await f.client.commerce.context({outletId:f.outlet.id,terminalId:f.terminal.id},'token')).data;
    assert.equal(context.operationState,'RECONCILIATION_REQUIRED');
    await assert.rejects(order(f),{code:'CURRENCY_MISMATCH'});
    await db.posSettings.update({where:{companyId:f.company.id},data:{currency:'MXN'}});
    const paid=(await pay(f,await order(f))).data;
    await assert.rejects(db.posPrintJob.create({data:{companyId:f.company.id,outletId:g.outlet.id,receiptId:paid.receiptId,createdById:f.actor.id,transport:'BROWSER',payload:{}}}));
  });

  it('legacy URLs cannot forge prices, change financial state or bypass company/session permissions',async()=>{
    const f=await fixture(),o=await order(f),g=await fixture();
    const request=(method,path,body,permissions=grants)=>f.app.request(path,{method,headers:{'Content-Type':'application/json','Idempotency-Key':key(),'X-Test-Permissions':permissions},body:JSON.stringify(body)});
    assert.equal((await request('POST',`/pos/orders/${o.id}/lines`,{expectedVersion:o.version,productId:f.product.id,quantity:'1',unitPrice:'0.01'})).status,400);
    assert.equal((await request('PATCH',`/pos/orders/${o.id}`,{status:'PAID'})).status,409);
    assert.equal((await request('POST','/pos/orders',{outletId:f.outlet.id,terminalId:f.terminal.id,sessionId:f.session.id,experience:'RESTAURANT',fulfillmentType:'DINE_IN'})).status,409);
    const payment={expectedVersion:o.version,paymentMethodId:f.cash.id,sessionId:g.session.id,amount:'100.00',tenderedAmount:'100.00'};
    assert.equal((await request('POST',`/pos/orders/${o.id}/payments`,payment)).status,404);
    assert.equal((await request('POST',`/pos/orders/${o.id}/payments`,{...payment,sessionId:f.session.id},'pos.caja.read')).status,403);
    assert.equal((await request('POST',`/pos/orders/${o.id}/receipts/reprint`,{})).status,409);
    await db.posTerminal.update({where:{id:f.terminal.id},data:{enabled:false}});
    await assert.rejects(pay(f,o),{code:'NOT_FOUND'});
    assert.equal((await request('POST',`/pos/orders/${o.id}/payments`,{...payment,sessionId:f.session.id})).status,404);
    assert.equal(await db.posPayment.count({where:{orderId:o.id}}),0);
    assert.equal((await db.posOrder.findUnique({where:{id:o.id}})).status,'OPEN');
    assert.equal((await db.catalogProduct.findUnique({where:{id:f.product.id}})).stock,2);
  });
});
