import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createPosRecoveryService } from '../pos-recovery-service.js';
import { createPosRouter } from '../pos-routes.js';

// Explicit opt-in ONLY. This suite never reads the application's DATABASE_URL.
const url = process.env.RUNLY_COMMERCE_TEST_DATABASE_URL;
if (url && (!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname) || new URL(url).pathname !== '/commerce_test')) {
  throw new Error('Usa exclusivamente la base local desechable commerce_test.');
}

describe('Commerce phase 1 — real PostgreSQL transactions', { skip: !url }, () => {
  let db, peer, svc, other;
  let sequence = 0;
  const batch = Date.now();
  const key = () => `commerce-test-attempt-${++sequence}`;
  const uuid = async () => (await db.$queryRaw`SELECT uuidv7()::text AS id`)[0].id;
  const code = (expected) => (err) => err.code === expected;
  before(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    peer = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    svc = createPosRecoveryService({ prisma: db });
    other = createPosRecoveryService({ prisma: peer });
  });
  after(async () => { await db?.$disconnect(); await peer?.$disconnect(); });

  async function fixture(options = {}) {
    const suffix = ++sequence;
    const company = await db.company.create({ data: { id: await uuid(), name: 'Commerce test', slug: `commerce-${batch}-${suffix}` } });
    const actor = await db.userProfile.create({ data: { id: await uuid(), authUserId: await uuid(), displayName: 'Operador prueba', email: `operator-${batch}-${suffix}@example.test` } });
    const ctx = { companyId: company.id, actorId: actor.id };
    await db.posSettings.create({ data: { companyId: company.id, currency: 'MXN', defaultTaxRate: options.taxRate ?? 0, pricesIncludeTax: options.included ?? false } });
    const outlet = await db.posOutlet.create({ data: { companyId: company.id, name: 'Centro', mode: 'HYBRID', allowTableCharge: true } });
    const terminal = await db.posTerminal.create({ data: { companyId: company.id, outletId: outlet.id, name: 'Caja' } });
    const cash = await db.posPaymentMethod.create({ data: { companyId: company.id, name: 'Efectivo', code: 'cash', kind: 'CASH' } });
    const product = await db.catalogProduct.create({ data: { id: await uuid(), companyId: company.id, name: 'Artículo', slug: 'article', price: options.price ?? 100,
      currency: options.currency ?? 'MXN', trackStock: options.tracked ?? false, stock: 1 } });
    const run = (action, data, params = {}, attempt = key(), engine = svc) => engine.execute(action, ctx, data, params, attempt);
    const session = await run('openSession', { outletId: outlet.id, terminalId: terminal.id, openingCashAmount: '0.00' });
    let order = await run('createOrder', { outletId: outlet.id, terminalId: terminal.id, sessionId: session.id, experience: options.experience??'RETAIL', fulfillmentType: 'TAKEAWAY' });
    if (options.currency === undefined) order = await run('addLine', { expectedVersion: order.version, productId: product.id, quantity: options.quantity ?? '1' }, { orderId: order.id });
    return { ctx, company, actor, outlet, terminal, cash, product, session, order, run };
  }

  async function pay(f, applied = '100.00', attempt = key(), engine = svc, extra = {}) {
    return f.run('payment', { expectedVersion: f.order.version, paymentMethodId: f.cash.id, amount: applied, tenderedAmount: applied, sessionId: f.session.id, ...extra }, { orderId: f.order.id }, attempt, engine);
  }

  it('100 due / 200 tendered applies 100, returns 100 and reconciles exactly 100', async () => {
    const f = await fixture();
    const result = await pay(f, '100.00', key(), svc, { tenderedAmount: '200.00' });
    assert.equal(result.payment.amount, '100.00');
    assert.equal(result.payment.tenderedAmount, '200.00');
    assert.equal(result.payment.changeAmount, '100.00');
    assert.equal(result.order.status, 'PAID');
    assert.equal(result.order.remainingAmount, '0.00');
    assert.equal((await svc.expectedCash(f.company.id, f.session.id)).expectedCashAmount, '100.00');
    assert.equal((await db.posReceipt.findUnique({ where: { id: result.receiptId } })).printedCount, 0);
  });

  it('simultaneous retries of the same partial payment return one committed document', async () => {
    const f = await fixture(), attempt = key();
    const [a,b] = await Promise.all([pay(f,'20.00',attempt,svc),pay(f,'20.00',attempt,other)]);
    assert.deepEqual(a,b);
    assert.equal(await db.posPayment.count({ where: { orderId: f.order.id } }),1);
    assert.equal((await svc.getOrder(f.company.id,f.order.id)).paidAmount,'20.00');
    await assert.rejects(pay(f,'21.00',attempt),code('IDEMPOTENCY_CONFLICT'));
  });

  it('different concurrent attempts cannot overcharge or race a line edit', async () => {
    const f = await fixture();
    const result = await Promise.allSettled([pay(f,'80.00',key(),svc),pay(f,'80.00',key(),other)]);
    assert.equal(result.filter((r) => r.status === 'fulfilled').length,1);
    assert.equal((await svc.getOrder(f.company.id,f.order.id)).paidAmount,'80.00');
    const g = await fixture();
    const race = await Promise.allSettled([pay(g,'100.00',key(),svc),g.run('updateLine',{expectedVersion:g.order.version,quantity:'2'}, {orderId:g.order.id,lineId:g.order.lines[0].id},key(),other)]);
    assert.equal(race.filter((r) => r.status === 'fulfilled').length,1);
    const current = await svc.getOrder(g.company.id,g.order.id);
    assert.ok((current.totalAmount === '100.00' && current.paidAmount === '100.00') || (current.totalAmount === '200.00' && current.paidAmount === '0.00'));
  });

  it('partial captures block cancellation; refunding the advance allows audited cancellation', async () => {
    const f = await fixture(); const result = await pay(f,'20.00');
    await assert.rejects(f.run('cancel',{expectedVersion:result.order.version,reason:'Error'}, {orderId:f.order.id}),code('REFUND_REQUIRED'));
    const refunded = await f.run('refund',{ expectedVersion:result.order.version,reason:'Devolver anticipo',sessionId:f.session.id,lines:[],payments:[{paymentId:result.payment.id,amount:'20.00'}]}, {orderId:f.order.id});
    const cancelled = await f.run('cancel',{expectedVersion:refunded.order.version,reason:'Venta cancelada'}, {orderId:f.order.id});
    assert.equal(cancelled.status,'CANCELLED'); assert.equal(cancelled.paidAmount,'20.00'); assert.equal(cancelled.refundedAmount,'20.00');
    assert.equal(await db.posPayment.count({where:{orderId:f.order.id}}),1);
    assert.equal((await svc.expectedCash(f.company.id,f.session.id)).expectedCashAmount,'0.00');
  });

  it('refunds paid lines in parts, returns final rounding remainder, and replays once', async () => {
    const f = await fixture({price:'33.33',quantity:'3'}); const paid = await pay(f,'99.99');
    const attempt = key(); const input = {expectedVersion:paid.order.version,reason:'Una unidad',sessionId:f.session.id,
      lines:[{orderLineId:f.order.lines[0].id,quantity:'1',restock:true}],payments:[{paymentId:paid.payment.id,amount:'33.33'}]};
    const [a,b] = await Promise.all([f.run('refund',input,{orderId:f.order.id},attempt),f.run('refund',input,{orderId:f.order.id},attempt,other)]);
    assert.deepEqual(a,b); assert.equal(a.order.status,'PAID'); assert.equal(a.order.refundStatus,'PARTIAL');
    const full = await f.run('refund',{...input,expectedVersion:a.order.version,lines:[{orderLineId:f.order.lines[0].id,quantity:'2',restock:true}],payments:[{paymentId:paid.payment.id,amount:'66.66'}]}, {orderId:f.order.id});
    assert.equal(full.order.status,'REFUNDED'); assert.equal(full.order.paidAmount,'99.99');
    assert.equal(await db.catalogStockMovement.count({where:{companyId:f.company.id,sourceType:{in:['POS_SALE','POS_REFUND']}}}),0);
    assert.equal((await db.catalogProduct.findUnique({where:{id:f.product.id}})).stock,1);
    assert.equal((await svc.expectedCash(f.company.id,f.session.id)).expectedCashAmount,'0.00');
    await assert.rejects(f.run('refund',{...input,expectedVersion:full.order.version},{orderId:f.order.id}),code('INVALID_TRANSITION'));
  });

  it('cash refund after original close affects the current session without rewriting the old cut', async () => {
    const f = await fixture(); const paid = await pay(f);
    const cut = await f.run('closeSession',{countedCashAmount:'100.00'},{sessionId:f.session.id});
    const next = await f.run('openSession',{outletId:f.outlet.id,terminalId:f.terminal.id,openingCashAmount:'100.00'});
    await f.run('refund',{expectedVersion:paid.order.version,reason:'Devolución',sessionId:next.id,lines:[{orderLineId:f.order.lines[0].id,quantity:'1',restock:false}],payments:[{paymentId:paid.payment.id,amount:'100.00'}]}, {orderId:f.order.id});
    assert.equal((await svc.expectedCash(f.company.id,next.id)).expectedCashAmount,'0.00');
    assert.equal((await db.posSession.findUnique({where:{id:cut.id}})).expectedCashAmount.toString(),'100');
  });

  it('blocks forged price, cross-company/branch/terminal references and unknown historic currency', async () => {
    const f=await fixture(), g=await fixture();
    await assert.rejects(f.run('addLine',{expectedVersion:f.order.version,productId:f.product.id,quantity:'1',unitPrice:'0.01'},{orderId:f.order.id}),code('VALIDATION_ERROR'));
    await assert.rejects(svc.getOrder(g.company.id,f.order.id),code('NOT_FOUND'));
    await assert.rejects(pay(f,'100.00',key(),svc,{sessionId:g.session.id}),code('NOT_FOUND'));
    const foreignOutlet=await db.posOutlet.create({data:{companyId:f.company.id,name:'Otra',mode:'RETAIL'}});
    const foreignTerminal=await db.posTerminal.create({data:{companyId:f.company.id,outletId:foreignOutlet.id,name:'Otra'}});
    const secondSession=await f.run('openSession',{outletId:foreignOutlet.id,terminalId:foreignTerminal.id,openingCashAmount:'0'});
    await assert.rejects(pay(f,'100.00',key(),svc,{sessionId:secondSession.id}),code('NOT_FOUND'));
    const otherTerminal=await db.posTerminal.create({data:{companyId:f.company.id,outletId:f.outlet.id,name:'Segunda'}});
    const sameBranch=await f.run('openSession',{outletId:f.outlet.id,terminalId:otherTerminal.id,openingCashAmount:'0'});
    await assert.rejects(pay(f,'100.00',key(),svc,{sessionId:sameBranch.id}),code('NOT_FOUND'));
    await db.posOrder.update({where:{id:f.order.id},data:{currency:null,taxSnapshot:undefined}});
    assert.equal((await svc.getOrder(f.company.id,f.order.id)).historicalCurrencyUnknown,true);
    await assert.rejects(pay(f),code('CURRENCY_MISMATCH'));
  });

  it('validates variable parent, currency and tracked stock before capturing any money', async () => {
    const f=await fixture();
    await db.catalogProduct.update({where:{id:f.product.id},data:{productType:'VARIABLE'}});
    await assert.rejects(f.run('addLine',{expectedVersion:f.order.version,productId:f.product.id,quantity:'1'},{orderId:f.order.id}),code('VARIANT_REQUIRED'));
    const g=await fixture({currency:'USD'});
    await assert.rejects(g.run('addLine',{expectedVersion:g.order.version,productId:g.product.id,quantity:'1'},{orderId:g.order.id}),code('CURRENCY_MISMATCH'));
    const h=await fixture({tracked:true});
    await assert.rejects(pay(h),code('INSUFFICIENT_STOCK'));
    assert.equal(await db.posPayment.count({where:{orderId:h.order.id}}),0);
    assert.equal((await db.catalogProduct.findUnique({where:{id:h.product.id}})).stock,1);
  });

  it('freezes included/excluded tax and catalog price, with authorized explicit discounts', async () => {
    const f=await fixture({included:true,taxRate:16,price:116});
    assert.equal(f.order.totalAmount,'116.00'); assert.equal(f.order.subtotalAmount,'100.00'); assert.equal(f.order.taxAmount,'16.00');
    await db.catalogProduct.update({where:{id:f.product.id},data:{price:999}});
    const same=await f.run('updateLine',{expectedVersion:f.order.version,quantity:'1'},{orderId:f.order.id,lineId:f.order.lines[0].id});
    assert.equal(same.totalAmount,'116.00');
    const discounted=await f.run('discount',{expectedVersion:same.version,amount:'16.00',reason:'Autorizado'},{orderId:f.order.id,lineId:f.order.lines[0].id});
    assert.equal(discounted.totalAmount,'100.00');
    const g=await fixture({included:false,taxRate:16,price:100});
    assert.equal(g.order.totalAmount,'116.00'); assert.equal(g.order.taxAmount,'16.00');
  });

  it('serializes session opening, close/payment, waiter delivery retries and independent captures', async () => {
    const f=await fixture();
    await f.run('closeSession',{countedCashAmount:'0'},{sessionId:f.session.id});
    const opens=await Promise.allSettled([f.run('openSession',{outletId:f.outlet.id,terminalId:f.terminal.id,openingCashAmount:'0'}, {},key(),svc),
      f.run('openSession',{outletId:f.outlet.id,terminalId:f.terminal.id,openingCashAmount:'0'}, {},key(),other)]);
    assert.equal(opens.filter((r)=>r.status==='fulfilled').length,1);
    f.session=opens.find((r)=>r.status==='fulfilled').value;
    const raced=await Promise.allSettled([pay(f,'100.00',key(),other),f.run('closeSession',{countedCashAmount:'0'},{sessionId:f.session.id})]);
    const cut=await db.posSession.findUnique({where:{id:f.session.id}});
    if(cut.status==='CLOSED') assert.equal(cut.expectedCashAmount.toString(),raced[0].status==='fulfilled'?'100':'0');
    else assert.equal(raced[0].status,'fulfilled');
    const g=await fixture({experience:'RESTAURANT'});
    const waiterPaid=await pay(g,'100.00',key(),svc,{sessionId:undefined});
    const shiftId=waiterPaid.payment.waiterShiftId, attempt=key();
    await Promise.all([g.run('closeShift',{sessionId:g.session.id,deliveredAmount:'100'},{shiftId},attempt,svc),g.run('closeShift',{sessionId:g.session.id,deliveredAmount:'100'},{shiftId},attempt,other)]);
    assert.equal(await db.posCashMovement.count({where:{sessionId:g.session.id,kind:'WAITER_DELIVERY'}}),1);
    assert.equal((await svc.expectedCash(g.company.id,g.session.id)).expectedCashAmount,'100.00');
  });

  it('rolls back capture, order, receipt and key when audit storage fails, then retries safely', async () => {
    const f=await fixture(); const attempt=key();
    const faulty=db.$extends({query:{auditLog:{async create(){throw new Error('injected audit failure');}}}});
    await assert.rejects(pay(f,'100.00',attempt,createPosRecoveryService({prisma:faulty})),/injected audit failure/);
    assert.equal(await db.posPayment.count({where:{orderId:f.order.id}}),0);
    assert.equal(await db.posReceipt.count({where:{orderId:f.order.id}}),0);
    assert.equal(await db.posCommand.count({where:{companyId:f.company.id,key:attempt}}),0);
    assert.equal((await svc.getOrder(f.company.id,f.order.id)).status,'OPEN');
    assert.equal((await pay(f,'100.00',attempt)).order.status,'PAID');
  });

  it('records card payments without cash/change and requires external refund references', async () => {
    const f=await fixture();
    const card=await db.posPaymentMethod.create({data:{companyId:f.company.id,code:'card',name:'Tarjeta',kind:'CARD',requiresReference:true}});
    const input={expectedVersion:f.order.version,paymentMethodId:card.id,amount:'100.00',sessionId:f.session.id};
    await assert.rejects(f.run('payment',input,{orderId:f.order.id}),code('VALIDATION_ERROR'));
    await assert.rejects(f.run('payment',{...input,reference:'external-test',tenderedAmount:'200.00'},{orderId:f.order.id}),code('VALIDATION_ERROR'));
    const paid=await f.run('payment',{...input,reference:'external-test'},{orderId:f.order.id});
    assert.equal(paid.payment.changeAmount,null);
    assert.equal((await svc.expectedCash(f.company.id,f.session.id)).expectedCashAmount,'0.00');
    const refund={expectedVersion:paid.order.version,reason:'Devolución externa',sessionId:f.session.id,
      lines:[{orderLineId:f.order.lines[0].id,quantity:'1',restock:false}],payments:[{paymentId:paid.payment.id,amount:'100.00'}]};
    await assert.rejects(f.run('refund',refund,{orderId:f.order.id}),code('VALIDATION_ERROR'));
    assert.equal(await db.posRefund.count({where:{orderId:f.order.id}}),0);
    await f.run('refund',{...refund,payments:[{...refund.payments[0],reference:'refund-test'}]},{orderId:f.order.id});
    assert.equal(await db.posCashMovement.count({where:{sessionId:f.session.id,kind:'REFUND_OUT'}}),0);
  });

  it('serializes independent refund attempts and prevents excess payment reversals', async () => {
    const f=await fixture({quantity:'2',price:'50.00'}); const paid=await pay(f);
    const input={expectedVersion:paid.order.version,reason:'Una pieza',sessionId:f.session.id,
      lines:[{orderLineId:f.order.lines[0].id,quantity:'1',restock:false}],payments:[{paymentId:paid.payment.id,amount:'50.00'}]};
    const result=await Promise.allSettled([f.run('refund',input,{orderId:f.order.id},key(),svc),f.run('refund',input,{orderId:f.order.id},key(),other)]);
    assert.equal(result.filter((r)=>r.status==='fulfilled').length,1);
    const current=await svc.getOrder(f.company.id,f.order.id);
    assert.equal(current.refundedAmount,'50.00');
    await assert.rejects(f.run('refund',{...input,expectedVersion:current.version,payments:[{paymentId:paid.payment.id,amount:'75.00'}]},{orderId:f.order.id}),code('VALIDATION_ERROR'));
  });

  it('old sales never invent stock; unreconciled sale origins cannot invent stock', async () => {
    const f=await fixture(); const paid=await pay(f);
    await db.catalogStockMovement.create({data:{companyId:f.company.id,productId:f.product.id,quantityDelta:-1,
      sourceType:'POS_SALE',sourceId:f.order.id,sourceLineId:f.order.lines[0].id,operationKey:'fixture-origin',outletId:f.outlet.id}});
    await assert.rejects(f.run('refund',{expectedVersion:paid.order.version,reason:'Reponer',sessionId:f.session.id,
      lines:[{orderLineId:f.order.lines[0].id,quantity:'1',restock:true}],payments:[{paymentId:paid.payment.id,amount:'100.00'}]},{orderId:f.order.id}),code('RECONCILIATION_REQUIRED'));
    assert.equal(await db.posRefund.count({where:{orderId:f.order.id}}),0);
    assert.equal(await db.posCashMovement.count({where:{sessionId:f.session.id,kind:'REFUND_OUT'}}),0);
    assert.equal(await db.catalogStockMovement.count({where:{companyId:f.company.id,sourceType:'POS_SALE'}}),1);
  });

  it('real routes enforce operational permissions, stable errors and legacy safety gates', async () => {
    const f=await fixture();
    const authorize=(keys)=>async(c,next)=>{
      const granted=new Set((c.req.header('X-Test-Permissions')??'').split(','));
      c.set('companyId',f.company.id);c.set('userId',f.actor.id);c.set('userContext',{isAdmin:false,permissionSet:granted});
      if(!keys.some((p)=>granted.has(p)))return c.json({error:'Sin permiso'},403);
      return next();
    };
    const app=createPosRouter({prisma:db,requirePermission:(k)=>authorize([k]),requireAnyPermission:authorize});
    const headers={'X-Test-Permissions':'pos.caja.read,pos.caja.operate','Content-Type':'application/json'};
    assert.equal((await app.request('/pos/v2/context',{headers})).status,200);
    assert.equal((await app.request('/pos/outlets',{headers})).status,200);
    const missing=await app.request(`/pos/orders/${f.order.id}/payments`,{method:'POST',headers,body:JSON.stringify({amount:100})});
    assert.equal(missing.status,428);assert.equal((await missing.json()).code,'IDEMPOTENCY_REQUIRED');
    assert.equal(await db.posPayment.count({where:{orderId:f.order.id}}),0);
    const denied=await app.request(`/pos/v2/orders/${f.order.id}/lines/${f.order.lines[0].id}/discount`,{method:'POST',headers,body:'{}'});
    assert.equal(denied.status,403);assert.equal((await denied.json()).error.code,'FORBIDDEN');
    const noSession=await app.request(`/pos/v2/orders/${f.order.id}/payments`,{method:'POST',headers:{...headers,'Idempotency-Key':key()},body:JSON.stringify({expectedVersion:f.order.version,paymentMethodId:f.cash.id,amount:'100.00'})});
    assert.equal(noSession.status,403);
    const paid=await app.request(`/pos/v2/orders/${f.order.id}/payments`,{method:'POST',headers:{...headers,'Idempotency-Key':key()},
      body:JSON.stringify({expectedVersion:f.order.version,paymentMethodId:f.cash.id,amount:'100.00',tenderedAmount:'200.00',sessionId:f.session.id})});
    assert.equal(paid.status,200,JSON.stringify(await paid.clone().json()));
    assert.equal((await paid.json()).data.payment.changeAmount,'100.00');
    const invalid=await app.request('/pos/v2/context?terminalId=bad',{headers});
    assert.equal(invalid.status,400);assert.equal((await invalid.json()).error.code,'VALIDATION_ERROR');
  });
});
