import {before,after,describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {Hono} from 'hono';
import {createPosRouter} from '../pos-routes.js';
import {createRunlyClient} from '../../../../../../packages/sdk/src/index.js';
import {createPosRecoveryService} from '../pos-recovery-service.js';
import {createCatalogCommerceStock} from '../../catalog/catalog-commerce-stock.js';
import {createPosReservationService} from '../pos-reservation-service.js';

const url=process.env.RUNLY_COMMERCE_TEST_DATABASE_URL;
if(url&&(!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)||new URL(url).pathname!=='/commerce_test'))throw new Error('Requiere commerce_test local desechable.');
describe('Restaurant phase 4: same commerce engine, real PostgreSQL/API/SDK',{skip:!url},()=>{
  let db,peer,n=0;
  const key=()=>`restaurant-p4-${Date.now()}-${++n}`;
  const opt=()=>({idempotencyKey:key()});
  const uuid=async()=>(await db.$queryRaw`SELECT uuidv7()::text AS id`)[0].id;
  const grants='pos.admin.update,pos.floor.manage,pos.orders.read,pos.orders.create,pos.orders.update,pos.orders.cancel,pos.caja.operate,pos.caja.close,pos.comandas.read,pos.comandas.create,pos.cocina.read,pos.cocina.operate,pos.refunds.create';
  before(()=>{db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});peer=new PrismaClient({adapter:new PrismaPg({connectionString:url})});});
  after(async()=>{await db?.$disconnect();await peer?.$disconnect();});
  function api(f,{prisma=db,permissions=grants,actor=f.actor.id,company=f.company.id,drop}={}){
    const app=new Hono();
    app.use('*',async(c,next)=>{c.set('companyId',company);c.set('userId',actor);c.set('userContext',{isAdmin:false,permissionSet:new Set(permissions.split(','))});return next();});
    const any=keys=>async(c,next)=>keys.some(k=>c.get('userContext').permissionSet.has(k))?next():c.json({error:'Sin permiso'},403);
    app.route('',createPosRouter({prisma,requirePermission:k=>any([k]),requireAnyPermission:any}));
    return createRunlyClient({baseUrl:'https://example.test',getActiveCompanyId:()=>company,fetch:async(url,options)=>{
      const r=await app.request(new URL(url).pathname+new URL(url).search,options);
      if(drop?.(new URL(url).pathname,options,r))throw new TypeError('Lost after real commit');return r;
    }}).commerce;
  }
  async function fixture({manual=false,mode='RESTAURANT',tax=0,price=50}={}){
    const company=await db.company.create({data:{id:await uuid(),name:'Restaurant fixture',slug:key()}});
    const actor=await db.userProfile.create({data:{id:await uuid(),authUserId:await uuid(),displayName:'Mesero Uno',email:`${key()}@example.test`}});
    await db.posSettings.create({data:{companyId:company.id,currency:'MXN',defaultTaxRate:tax,pricesIncludeTax:true}});
    const outlet=await db.posOutlet.create({data:{companyId:company.id,name:'Comedor',mode,allowTableCharge:true,kitchenKdsEnabled:!manual,kitchenPrintEnabled:false}});
    const terminal=await db.posTerminal.create({data:{companyId:company.id,outletId:outlet.id,name:'Caja restaurante'}});
    const cash=await db.posPaymentMethod.create({data:{companyId:company.id,name:'Efectivo',kind:'CASH',code:'cash'}});
    const product=await db.catalogProduct.create({data:{id:await uuid(),companyId:company.id,name:'Platillo <script>x</script>',slug:'platillo',price,currency:'MXN',trackStock:false}});
    const station=await db.posKitchenStation.create({data:{companyId:company.id,outletId:outlet.id,name:'Caliente',code:'hot'}});
    await db.posProductConfig.create({data:{companyId:company.id,productId:product.id,stationId:station.id,requiresPreparation:true}});
    const f={company,actor,outlet,terminal,cash,product,station};f.api=api(f);
    f.table=(await f.api.createTable({outletId:outlet.id,name:'Mesa 1',capacity:4},'token',opt())).data;
    return f;
  }
  async function order(f,{client=f.api,tableId=f.table.id,guests=2,fulfillment='DINE_IN'}={}){
    return (await client.createOrder({outletId:f.outlet.id,experience:'RESTAURANT',fulfillmentType:fulfillment,...(tableId?{tableId}:{}),guestCount:guests},'token',opt())).data;
  }
  const add=async(f,o,extra={},client=f.api)=>(await client.addLine(o.id,{expectedVersion:o.version,productId:f.product.id,quantity:'1',...extra},'token',opt())).data;
  const dispatch=(f,o,extra={},client=f.api,attempt=opt())=>client.dispatchKitchen(o.id,{expectedVersion:o.version,lineIds:o.lines.filter(l=>!l.voided).map(l=>l.id),...extra},'token',attempt);
  async function session(f){return (await f.api.openSession({outletId:f.outlet.id,terminalId:f.terminal.id,openingCashAmount:'0.00'},'token',opt())).data;}
  const pay=(f,o,s,extra={},client=f.api,attempt=opt())=>client.addPayment(o.id,{expectedVersion:o.version,paymentMethodId:f.cash.id,sessionId:s.id,amount:o.remainingAmount,tenderedAmount:o.remainingAmount,...extra},'token',attempt);

  it('opens a simple table without floors, shows account/guests/waiter/time, and only one waiter wins simultaneous opening',async()=>{
    const f=await fixture(),mesero=api(f,{permissions:'pos.comandas.read,pos.comandas.create'});
    assert.equal(await db.posFloor.count({where:{companyId:f.company.id}}),0);assert.equal(f.table.floorId,null);
    const second=api(f,{prisma:peer,permissions:'pos.comandas.read,pos.comandas.create'});
    const results=await Promise.allSettled([order(f,{client:mesero}),order(f,{client:second})]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'TABLE_OCCUPIED');
    const tables=(await mesero.tables({outletId:f.outlet.id},'token')).data,t=tables[0];
    assert.equal(t.status,'OCCUPIED');assert.ok(t.activeOrderId);assert.equal(t.activeOrder.guestCount,2);assert.equal(t.activeOrder.waiterName,'Mesero Uno');assert.ok(t.activeOrder.openedAt);
    assert.equal(t.activeOrder.readyLineCount,0);
    const context=(await mesero.context({outletId:f.outlet.id},'token')).data;assert.equal(context.currentSession,null);assert.equal(context.selectedTerminalId,null);assert.equal(context.capabilities.openSession,false);
    assert.equal(context.restaurantOperationState,'READY');assert.equal(context.capabilities.takeOrders,true);
    await assert.rejects(f.api.updateTable(t.id,{expectedVersion:t.version,status:'AVAILABLE'},'token',opt()),{code:'TABLE_OCCUPIED'});
  });

  it('snapshots modifiers/notes, retries dispatch concurrently and after response loss, and sends extras only once',async()=>{
    const f=await fixture(),waiter=api(f,{permissions:'pos.comandas.read,pos.comandas.create'});
    const group=await db.posModifierGroup.create({data:{companyId:f.company.id,productId:f.product.id,name:'Extras',required:true,minSelect:1,maxSelect:1}});
    const option=await db.posModifierOption.create({data:{groupId:group.id,companyId:f.company.id,name:'Queso',priceDelta:5}});
    let o=await order(f,{client:waiter});
    await assert.rejects(add(f,o,{},waiter),{code:'VALIDATION_ERROR'});
    assert.equal((await waiter.modifiers(f.product.id,'token')).data[0].options[0].id,option.id);
    o=await add(f,o,{modifiers:[{optionId:option.id}],note:'Sin sal',guestSeatId:o.guests[0].id},waiter);assert.equal(o.totalAmount,'55.00');
    let lost=false;const flaky=api(f,{permissions:'pos.comandas.create',drop:(p,opts,r)=>p.endsWith('kitchen-dispatches')&&r.ok&&!lost&&(lost=true)}),attempt=opt();
    await assert.rejects(dispatch(f,o,{},flaky,attempt),/Lost/);
    const [a,b]=await Promise.all([dispatch(f,o,{},waiter,attempt),dispatch(f,o,{},api(f,{prisma:peer}),attempt)]);
    assert.deepEqual(a,b);assert.equal(await db.posKitchenDispatch.count({where:{orderId:o.id}}),1);assert.equal(await db.posKitchenTicketLine.count({where:{orderLineId:o.lines[0].id}}),1);
    let fresh=(await waiter.getOrder(o.id,'token')).data;
    await assert.rejects(waiter.updateLine(o.id,o.lines[0].id,{expectedVersion:fresh.version,quantity:'2'},'token',opt()),{code:'PREPARATION_ALREADY_DISPATCHED'});
    fresh=await add(f,fresh,{modifiers:[{optionId:option.id}],note:'Extra salsa'},waiter);
    const pending=fresh.lines.find(l=>!l.dispatchedAt);fresh=(await waiter.updateLine(o.id,pending.id,{expectedVersion:fresh.version,quantity:'2'},'token',opt())).data;
    const extra=(await dispatch(f,fresh,{},waiter)).data;assert.equal(extra.dispatchSequence,2);assert.deepEqual(extra.skippedLineIds,[o.lines[0].id]);
    const board=(await f.api.kitchenTickets({outletId:f.outlet.id},'token')).data;
    assert.equal(board.length,2);assert.equal(board[0].tableName,'Mesa 1');assert.equal(board[0].waiterName,'Mesero Uno');assert.equal(board[0].dispatchSequence,1);assert.ok(board[0].dispatchedAt);assert.equal(board[0].lateAfterMinutes,15);
    assert.equal(board[0].lines[0].note,'Sin sal');assert.equal(board[0].lines[0].modifiers[0].optionName,'Queso');assert.equal(board[1].lines.length,1);assert.equal(board[1].lines[0].quantity,'2.000');
    await db.posModifierOption.update({where:{id:option.id},data:{name:'Cambio posterior'}});
    const tableBefore=await db.posTable.findUnique({where:{id:f.table.id}});
    const renamed=await db.posTable.update({where:{id:f.table.id},data:{name:'Mesa renombrada después'}});
    assert.equal(renamed.version,tableBefore.version+1);
    assert.equal((await f.api.kitchenTickets({outletId:f.outlet.id},'token')).data[0].lines[0].modifiers[0].optionName,'Queso');
    assert.deepEqual((await api(f,{prisma:peer}).kitchenTickets({outletId:f.outlet.id},'token')).data,board);
    const page=(await f.api.kitchenTickets({outletId:f.outlet.id,limit:1},'token'));assert.equal(page.pagination.hasMore,true);
    const next=await f.api.kitchenTickets({outletId:f.outlet.id,limit:1,cursor:page.pagination.nextCursor},'token');assert.notEqual(next.data[0].id,page.data[0].id);
  });

  it('versioned KDS advances, atomically derives ticket/line/order, supports five-second author undo, and blocks illegal/terminal undo',async()=>{
    const f=await fixture();let o=await add(f,await order(f));const d=(await dispatch(f,o)).data;
    const cook=api(f,{permissions:'pos.cocina.read,pos.cocina.operate'});
    let t=(await cook.kitchenTickets({outletId:f.outlet.id},'token')).data[0],l=t.lines[0];
    const update=(status,version=l.version,client=cook,extra={},attempt=opt())=>client.updateKitchenLine(t.id,l.id,{expectedVersion:version,status,...extra},'token',attempt);
    await assert.rejects(update('READY'),{code:'INVALID_TRANSITION'});
    const attempt=opt(),a=await update('IN_PREPARATION',1,cook,{},attempt);assert.deepEqual(await update('IN_PREPARATION',1,cook,{},attempt),a);
    await assert.rejects(update('READY',1),{code:'RESOURCE_VERSION_CONFLICT'});
    await assert.rejects(update('PENDING',2,cook),{code:'UNDO_NOT_ALLOWED'});
    const undo=await update('PENDING',2,cook,{reason:'Toque accidental'});assert.equal(undo.data.ticket.status,'PENDING');
    let r=await update('IN_PREPARATION',3);r=await update('READY',r.data.line.version);
    assert.equal(r.data.ticket.status,'READY');assert.equal((await f.api.getOrder(o.id,'token')).data.lines[0].kitchenStatus,'READY');
    assert.equal((await f.api.tables({outletId:f.outlet.id},'token')).data[0].activeOrder.readyLineCount,1);
    r=await update('DELIVERED',r.data.line.version);assert.equal(r.data.ticket.status,'DELIVERED');
    await assert.rejects(update('READY',r.data.line.version,cook,{reason:'Tarde'}),{code:'INVALID_TRANSITION'});
    assert.equal((await f.api.getOrder(o.id,'token')).data.status,'SERVED');
    const served=(await f.api.getOrder(o.id,'token')).data;
    await assert.rejects(f.api.voidPreparation(o.id,o.lines[0].id,{expectedVersion:served.version,reason:'Ya entregado'},'token',opt()),{code:'INVALID_TRANSITION'});
    assert.equal(await db.auditLog.count({where:{companyId:f.company.id,action:'pos.kitchen.undo'}}),1);
    assert.equal(d.tickets.length,1);
  });

  it('undo expires, another operator cannot undo, and races on the same preparation line do not overwrite',async()=>{
    const f=await fixture();const o=await add(f,await order(f));await dispatch(f,o);
    const t=(await f.api.kitchenTickets({outletId:f.outlet.id},'token')).data[0],l=t.lines[0];
    const body={expectedVersion:l.version,status:'IN_PREPARATION'};
    const rs=await Promise.allSettled([f.api.updateKitchenLine(t.id,l.id,body,'token',opt()),api(f,{prisma:peer}).updateKitchenLine(t.id,l.id,body,'token',opt())]);
    assert.equal(rs.filter(r=>r.status==='fulfilled').length,1);assert.equal(rs.find(r=>r.status==='rejected').reason.code,'RESOURCE_VERSION_CONFLICT');
    const actor=await uuid();
    await assert.rejects(api(f,{actor}).updateKitchenLine(t.id,l.id,{expectedVersion:2,status:'PENDING',reason:'Otro'},'token',opt()),{code:'UNDO_NOT_ALLOWED'});
    await db.posKitchenTicketLine.update({where:{id:l.id},data:{transitionAt:new Date(Date.now()-6000)}});
    await assert.rejects(f.api.updateKitchenLine(t.id,l.id,{expectedVersion:2,status:'PENDING',reason:'Tarde'},'token',opt()),{code:'UNDO_NOT_ALLOWED'});
  });

  it('routes by branch, rejects missing/foreign/disabled station, and supports explicit manual mode without fabricated tickets',async()=>{
    const f=await fixture(),g=await fixture();let o=await add(f,await order(f));
    await db.posProductConfig.updateMany({where:{companyId:f.company.id},data:{stationId:g.station.id}});
    await assert.rejects(dispatch(f,o),{code:'PREPARATION_STATION_REQUIRED'});assert.equal(await db.posKitchenDispatch.count({where:{orderId:o.id}}),0);
    await db.posProductConfig.updateMany({where:{companyId:f.company.id},data:{stationId:null}});
    await assert.rejects(dispatch(f,o),{code:'PREPARATION_STATION_REQUIRED'});
    await db.posOutlet.update({where:{id:f.outlet.id},data:{defaultStationId:f.station.id}});
    assert.equal((await dispatch(f,o)).data.tickets[0].stationId,f.station.id);
    const m=await fixture({manual:true}),manualOrder=await add(m,await order(m));
    const manual=(await dispatch(m,manualOrder)).data;assert.equal(manual.manual,true);assert.equal(manual.tickets.length,0);assert.equal(manual.skippedLineIds.length,1);
    assert.ok((await m.api.getOrder(manualOrder.id,'token')).data.lines[0].dispatchedAt);
    await assert.rejects(dispatch(m,manual.order),{code:'NO_PENDING_LINES'});
  });

  it('voids sent preparation with reason and no fake stock, forbids void after delivery/payment, and keeps audit',async()=>{
    const f=await fixture();let o=await add(f,await order(f));o=(await dispatch(f,o)).data.order;
    const attempt=opt(),body={expectedVersion:o.version,reason:'Cliente cambió antes de preparar'};
    const r=await f.api.voidPreparation(o.id,o.lines[0].id,body,'token',attempt);assert.deepEqual(await f.api.voidPreparation(o.id,o.lines[0].id,body,'token',attempt),r);
    assert.equal(r.data.totalAmount,'0.00');assert.equal(r.data.lines[0].voided,true);assert.equal((await db.posKitchenTicket.findFirst({where:{orderId:o.id}})).status,'CANCELLED');
    assert.equal(await db.catalogStockMovement.count({where:{sourceId:o.id}}),0);
    o=await add(f,r.data);const s=await session(f);o=(await pay(f,o,s,{amount:'10.00',tenderedAmount:'10.00'})).data.order;
    await assert.rejects(f.api.voidPreparation(o.id,o.lines.find(l=>!l.voided).id,{expectedVersion:o.version,reason:'Con anticipo'},'token',opt()),{code:'REFUND_REQUIRED'});
    await assert.rejects(f.api.cancel(o.id,{expectedVersion:o.version,reason:'Con anticipo'},'token',opt()),{code:'REFUND_REQUIRED'});
  });

  it('attributes partial/final captures by seats and cents, cannot recollect a paid seat, releases table, preserves taxes and one stock exit',async()=>{
    const f=await fixture({tax:16,price:50});let o=await order(f);
    o=await add(f,o,{guestSeatId:o.guests[0].id});o=await add(f,o,{guestSeatId:o.guests[1].id});const s=await session(f);
    const first=o.lines[0],second=o.lines[1],attempt=opt();
    let result=await pay(f,o,s,{amount:'50.00',tenderedAmount:'100.00',allocations:[{orderLineId:first.id,amount:'50.00'}]},f.api,attempt);
    assert.deepEqual(await pay(f,o,s,{amount:'50.00',tenderedAmount:'100.00',allocations:[{orderLineId:first.id,amount:'50.00'}]},f.api,attempt),result);
    o=result.data.order;assert.equal(result.data.payment.changeAmount,'50.00');assert.equal(o.remainingAmount,'50.00');assert.equal(o.taxAmount,'13.80');
    const totals=(await f.api.seatTotals(o.id,'token')).data;assert.equal(totals.seats[0].remainingAmount,'0.00');assert.equal(totals.seats[1].remainingAmount,'50.00');
    await assert.rejects(pay(f,o,s,{amount:'50.00',allocations:[{orderLineId:first.id,amount:'50.00'}]}),{code:'ALLOCATION_CONFLICT'});
    result=await pay(f,o,s,{allocations:[{orderLineId:second.id,amount:'50.00'}]});assert.equal(result.data.order.status,'PAID');assert.equal(result.data.order.totalAmount,'100.00');assert.equal(result.data.order.taxAmount,'13.80');
    assert.equal(await db.posPayment.count({where:{orderId:o.id}}),2);assert.equal(await db.posReceipt.count({where:{orderId:o.id,kind:'SALE'}}),1);
    const table=(await f.api.tables({outletId:f.outlet.id},'token')).data[0];assert.equal(table.activeOrderId,null);assert.equal(table.status,'DIRTY');
    await f.api.updateTable(table.id,{expectedVersion:table.version,status:'AVAILABLE'},'token',opt());assert.ok((await order(f)).id);
    await assert.rejects(dispatch(f,result.data.order),{code:'INVALID_TRANSITION'});
  });

  it('general payments are explicit, attribution does not move money, rounding and refund reduce line/payment allocation limits',async()=>{
    const f=await fixture({price:33.33,tax:16});let o=await order(f);o=await add(f,o,{quantity:'3',guestSeatId:o.guests[0].id});const s=await session(f);
    const paid=(await pay(f,o,s)).data;assert.equal(paid.order.totalAmount,'99.99');
    const totals=(await f.api.seatTotals(o.id,'token')).data;assert.equal(totals.generalPaidAmount,'99.99');
    const body={expectedVersion:paid.order.version,paymentId:paid.payment.id,allocations:[{orderLineId:o.lines[0].id,amount:'99.99'}]},attempt=opt();
    const attributed=await f.api.allocatePayment(o.id,body,'token',attempt);assert.deepEqual(await f.api.allocatePayment(o.id,body,'token',attempt),attributed);
    assert.equal(await db.posPayment.count({where:{orderId:o.id}}),1);
    const q=(await f.api.refundPreview(o.id,{expectedVersion:attributed.data.version,lines:[{orderLineId:o.lines[0].id,quantity:'1',restock:false}]},'token')).data;
    const refund=(await f.api.refund(o.id,{expectedVersion:attributed.data.version,sessionId:s.id,reason:'Devolución parcial',lines:[{orderLineId:o.lines[0].id,quantity:'1',restock:false}],payments:q.payments.filter(p=>Number(p.amount)>0).map(({paymentId,amount})=>({paymentId,amount}))},'token',opt())).data;
    assert.equal(refund.refund.amount,'33.33');
    const after=(await f.api.seatTotals(o.id,'token')).data;assert.equal(after.seats[0].totalAmount,'66.66');assert.equal(after.seats[0].paidAmount,'66.66');assert.equal(after.generalPaidAmount,'0.00');
    await assert.rejects(f.api.allocatePayment(o.id,{...body,expectedVersion:refund.order.version},'token',opt()),{code:'ALLOCATION_CONFLICT'});
  });

  it('parallel allocations cannot charge a seat twice and line edits conflict instead of losing another waiter change',async()=>{
    const f=await fixture();let o=await order(f);o=await add(f,o);o=await add(f,o);const s=await session(f),line=o.lines[0];
    const rs=await Promise.allSettled([pay(f,o,s,{amount:'50.00',allocations:[{orderLineId:line.id,amount:'50.00'}]}),pay(f,o,s,{amount:'50.00',allocations:[{orderLineId:line.id,amount:'50.00'}]},api(f,{prisma:peer}))]);
    assert.equal(rs.filter(r=>r.status==='fulfilled').length,1);assert.equal(await db.posPayment.count({where:{orderId:o.id}}),1);
    const g=await fixture();o=await order(g);const edits=await Promise.allSettled([add(g,o),add(g,o,{},api(g,{prisma:peer}))]);
    assert.equal(edits.filter(r=>r.status==='fulfilled').length,1);assert.equal(edits.find(r=>r.status==='rejected').reason.code,'ORDER_VERSION_CONFLICT');
  });

  it('a waiter without Caja takes/sends but cannot capture; cook cannot charge; waiter table charge uses own shift and delivered money once',async()=>{
    const f=await fixture(),waiter=api(f,{permissions:'pos.comandas.read,pos.comandas.create'}),cook=api(f,{permissions:'pos.cocina.read,pos.cocina.operate'});
    let o=await add(f,await order(f,{client:waiter}),{},waiter);o=(await dispatch(f,o,{},waiter)).data.order;const s=await session(f);
    await assert.rejects(pay(f,o,s,{},waiter),{code:'FORBIDDEN'});await assert.rejects(pay(f,o,s,{},cook),{code:'FORBIDDEN'});
    const charge=api(f,{permissions:'pos.comandas.read,pos.comandas.charge'});
    await assert.rejects(pay(f,o,s,{},charge),{code:'FORBIDDEN'});
    const result=(await charge.addPayment(o.id,{expectedVersion:o.version,paymentMethodId:f.cash.id,amount:'50.00',tenderedAmount:'100.00'},'token',opt())).data;
    assert.equal(result.payment.sessionId,null);assert.ok(result.payment.waiterShiftId);
    assert.equal((await db.posWaiterShift.findUnique({where:{id:result.payment.waiterShiftId}})).waiterId,f.actor.id);
    const body={sessionId:s.id,deliveredAmount:'50.00'},attempt=opt();
    const rs=await Promise.all([f.api.closeShift(result.payment.waiterShiftId,body,'token',attempt),api(f,{prisma:peer}).closeShift(result.payment.waiterShiftId,body,'token',attempt)]);assert.deepEqual(rs[0],rs[1]);
    assert.equal(await db.posCashMovement.count({where:{sessionId:s.id,kind:'WAITER_DELIVERY'}}),1);assert.equal((await f.api.expectedCash(s.id,'token')).data.expectedCashAmount,'50.00');
    await db.posOutlet.update({where:{id:f.outlet.id},data:{allowTableCharge:false}});
    assert.equal((await charge.context({outletId:f.outlet.id},'token')).data.capabilities.tableCharge,false);
    const takeaway=await add(f,await order(f,{tableId:null,fulfillment:'TAKEAWAY'}));
    await assert.rejects(charge.addPayment(takeaway.id,{expectedVersion:takeaway.version,paymentMethodId:f.cash.id,amount:'50.00'},'token',opt()),{code:'INVALID_TRANSITION'});
  });

  it('isolates companies, branch/station queries, permissions and revocation; preserves distinct HYBRID experiences',async()=>{
    const f=await fixture({mode:'HYBRID'}),g=await fixture();const o=await add(f,await order(f));await dispatch(f,o);
    await assert.rejects(api(f,{company:g.company.id}).getOrder(o.id,'token'),{code:'NOT_FOUND'});
    await assert.rejects(f.api.tables({outletId:g.outlet.id},'token'),{code:'NOT_FOUND'});
    await assert.rejects(f.api.kitchenTickets({outletId:f.outlet.id,stationId:g.station.id},'token'),{code:'NOT_FOUND'});
    const foreign=(await dispatch(g,await add(g,await order(g)))).data.tickets[0];
    await assert.rejects(f.api.kitchenTickets({outletId:f.outlet.id,cursor:foreign.id},'token'),{code:'NOT_FOUND'});
    await assert.rejects(api(f,{permissions:'pos.orders.read'}).kitchenTickets({outletId:f.outlet.id},'token'),{code:'FORBIDDEN'});
    const s=await session(f);const retail=(await f.api.createOrder({outletId:f.outlet.id,terminalId:f.terminal.id,sessionId:s.id,experience:'RETAIL',fulfillmentType:'TAKEAWAY'},'token',opt())).data;
    assert.equal(retail.guests.length,0);assert.equal(retail.waiterId,null);assert.equal(retail.tableId,null);
    const r=await add(f,retail);await assert.rejects(dispatch(f,r),{code:'INVALID_TRANSITION'});
    await db.posKitchenStation.update({where:{id:f.station.id},data:{enabled:false}});
    const extra=await add(f,(await f.api.getOrder(o.id,'token')).data);
    await assert.rejects(dispatch(f,extra),{code:'PREPARATION_STATION_REQUIRED'});
    await db.posOutlet.update({where:{id:f.outlet.id},data:{enabled:false}});
    await assert.rejects(f.api.tables({outletId:f.outlet.id},'token'),{code:'NOT_FOUND'});
  });

  it('kitchen print jobs freeze the dispatch snapshot, replay, do not claim paper, and authorize their results by actor/document',async()=>{
    const f=await fixture(),o=await add(f,await order(f));const d=(await dispatch(f,o)).data,t=d.tickets[0];
    const cook=api(f,{permissions:'pos.cocina.read,pos.cocina.operate'}),attempt=opt();
    const a=await cook.kitchenPrintJob(t.id,{transport:'BROWSER'},'token',attempt);assert.deepEqual(await cook.kitchenPrintJob(t.id,{transport:'BROWSER'},'token',attempt),a);
    assert.equal(a.data.status,'QUEUED');assert.equal(a.data.physicalConfirmationSupported,false);assert.ok(a.data.payload.html.includes('&lt;script&gt;'));assert.ok(!a.data.payload.html.includes('<script>'));
    const result=await cook.finishPrintJob(a.data.jobId,{status:'SUBMITTED'},'token',opt());assert.equal(result.data.status,'SUBMITTED');
    assert.equal((await cook.getKitchenTicket(t.id,'token')).data.printJobs[0].status,'SUBMITTED');
    assert.equal((await cook.kitchenPrintJob(t.id,{transport:'BLUETOOTH'},'token',opt())).data.copy,true);
    await assert.rejects(cook.finishPrintJob(a.data.jobId,{status:'CONFIRMED'},'token',opt()),{code:'VALIDATION_ERROR'});
    await assert.rejects(api(f,{actor:await uuid(),permissions:'pos.cocina.read'}).finishPrintJob(a.data.jobId,{status:'FAILED'},'token',opt()),{code:'FORBIDDEN'});
    assert.equal(await db.posPayment.count({where:{orderId:o.id}}),0);
    await assert.rejects(db.posKitchenDispatch.update({where:{id:d.dispatchId},data:{snapshot:{forged:true}}}));
  });

  it('audit failures roll dispatch back, retaining the same key for an exact retry',async()=>{
    const f=await fixture(),o=await add(f,await order(f)),attempt=key();
    const broken=db.$extends({query:{auditLog:{async create(){throw new Error('audit-failed');}}}});
    const ctx={companyId:f.company.id,actorId:f.actor.id},body={expectedVersion:o.version,lineIds:[o.lines[0].id]};
    await assert.rejects(createPosRecoveryService({prisma:broken}).execute('dispatch',ctx,body,{orderId:o.id},attempt),/audit-failed/);
    assert.equal(await db.posKitchenDispatch.count({where:{orderId:o.id}}),0);assert.equal(await db.posKitchenTicket.count({where:{orderId:o.id}}),0);
    assert.equal((await db.posOrderLine.findUnique({where:{id:o.lines[0].id}})).dispatchedAt,null);
    assert.ok((await createPosRecoveryService({prisma:db}).execute('dispatch',ctx,body,{orderId:o.id},attempt)).dispatchId);
  });

  it('preserves floor/reservation identity and seats a reservation through the same transactional command',async()=>{
    const f=await fixture();const floor=await db.posFloor.create({data:{companyId:f.company.id,outletId:f.outlet.id,name:'Plano anterior'}});
    const table=await db.posTable.create({data:{companyId:f.company.id,floorId:floor.id,name:'Mesa plano'}});
    assert.equal(table.outletId,f.outlet.id);
    const reservation=await db.posReservation.create({data:{companyId:f.company.id,outletId:f.outlet.id,tableId:table.id,guestName:'Reserva fixture',scheduledAt:new Date(),partySize:3,createdById:f.actor.id}});
    const attempt=opt(),r=await f.api.seatReservation(reservation.id,{},'token',attempt);assert.deepEqual(await f.api.seatReservation(reservation.id,{},'token',attempt),r);
    assert.equal(r.data.tableId,table.id);assert.equal(r.data.guests.length,3);assert.equal(r.data.experience,'RESTAURANT');assert.equal((await db.posTable.findUnique({where:{id:table.id}})).floorId,floor.id);
    assert.equal((await db.posReservation.findUnique({where:{id:reservation.id}})).orderId,r.data.id);
    await assert.rejects(f.api.seatReservation(reservation.id,{},'token',opt()),{code:'INVALID_TRANSITION'});
  });

  it('paid preparation advances without reopening money, and retail/restaurant contend for the same last commercial unit',async()=>{
    const f=await fixture({mode:'HYBRID'}),s=await session(f);
    f.product=await db.catalogProduct.create({data:{id:await uuid(),companyId:f.company.id,name:'Ultima bebida',slug:'ultima-bebida',price:50,currency:'MXN',trackStock:true,stock:1}});
    await db.posProductConfig.create({data:{companyId:f.company.id,productId:f.product.id,stationId:f.station.id,requiresPreparation:true}});
    await createCatalogCommerceStock({prisma:db}).write({companyId:f.company.id,actorId:f.actor.id},f.product.id,{outletId:f.outlet.id,quantity:1,reason:'Asignación fixture'},key(),true);
    let restaurant=await add(f,await order(f));restaurant=(await dispatch(f,restaurant)).data.order;
    const t=(await f.api.kitchenTickets({outletId:f.outlet.id},'token')).data[0];
    const retail=await add(f,(await f.api.createOrder({outletId:f.outlet.id,terminalId:f.terminal.id,sessionId:s.id,experience:'RETAIL',fulfillmentType:'TAKEAWAY'},'token',opt())).data);
    // Same-session lock serializes captures; different order balances cannot
    // create two exits of the same last unit in the shared commercial ledger.
    const paid=(await pay(f,restaurant,s)).data;
    await assert.rejects(pay(f,retail,s),{code:'INSUFFICIENT_STOCK'});
    let r=await f.api.updateKitchenLine(t.id,t.lines[0].id,{expectedVersion:1,status:'IN_PREPARATION'},'token',opt());
    r=await f.api.updateKitchenLine(t.id,t.lines[0].id,{expectedVersion:r.data.line.version,status:'READY'},'token',opt());
    await assert.rejects(f.api.updateKitchenLine(t.id,t.lines[0].id,{expectedVersion:r.data.line.version,status:'IN_PREPARATION',reason:'Pagado'},'token',opt()),{code:'UNDO_NOT_ALLOWED'});
    await f.api.updateKitchenLine(t.id,t.lines[0].id,{expectedVersion:r.data.line.version,status:'DELIVERED'},'token',opt());
    assert.equal((await f.api.getOrder(restaurant.id,'token')).data.status,'PAID');
    assert.equal(await db.catalogStockMovement.count({where:{sourceId:restaurant.id,sourceType:'POS_SALE'}}),1);
    assert.equal((await db.catalogProduct.findUnique({where:{id:f.product.id}})).stock,0);
    assert.equal(await db.posPayment.count({where:{orderId:retail.id}}),0);assert.ok(paid.receiptId);
  });

  it('historical tickets remain readable with unknown sequence, expose server lateness, and cannot be silently redispatched or printed',async()=>{
    const f=await fixture();let o=await add(f,await order(f));
    const historic=await db.posKitchenTicket.create({data:{companyId:f.company.id,orderId:o.id,stationId:f.station.id,sentAt:new Date(Date.now()-16*60000)}});
    await db.posKitchenTicketLine.create({data:{ticketId:historic.id,orderLineId:o.lines[0].id,quantity:1,note:'Nota anterior'}});
    await db.posOrder.update({where:{id:o.id},data:{status:'SENT'}});
    await db.posOrderLine.update({where:{id:o.lines[0].id},data:{preparationTracked:false}});
    const t=(await f.api.kitchenTickets({outletId:f.outlet.id},'token')).data[0];
    assert.equal(t.historicalDispatchUnknown,true);assert.equal(t.dispatchSequence,null);assert.equal(t.isLate,true);assert.equal(t.lines[0].historicalSnapshotUnknown,true);
    o=(await f.api.getOrder(o.id,'token')).data;
    await assert.rejects(dispatch(f,o),{code:'NO_PENDING_LINES'});
    await assert.rejects(f.api.kitchenPrintJob(t.id,{transport:'BROWSER'},'token',opt()),{code:'RECONCILIATION_REQUIRED'});
    o=await add(f,o);const legacy=o.lines.find(l=>l.id!==t.lines[0].orderLineId);
    await db.posOrderLine.update({where:{id:legacy.id},data:{preparationTracked:false,kitchenStatus:'DELIVERED'}});
    await db.posOrder.update({where:{id:o.id},data:{status:'OPEN'}});
    await assert.rejects(dispatch(f,o,{lineIds:[legacy.id]}),{code:'NO_PENDING_LINES'});
    await assert.rejects(f.api.voidPreparation(o.id,legacy.id,{expectedVersion:o.version,reason:'Histórico ya entregado'},'token',opt()),{code:'INVALID_TRANSITION'});
    await assert.rejects(f.api.updateLine(o.id,legacy.id,{expectedVersion:o.version,quantity:'2'},'token',opt()),{code:'PREPARATION_ALREADY_DISPATCHED'});
  });

  it('a restaurant cashier uses an authorized current terminal of the same outlet, not the origin terminal',async()=>{
    const f=await fixture(),origin=await session(f),other=await db.posTerminal.create({data:{companyId:f.company.id,outletId:f.outlet.id,name:'Caja 2'}});
    const destination=(await f.api.openSession({outletId:f.outlet.id,terminalId:other.id,openingCashAmount:'0.00'},'token',opt())).data;
    let o=(await f.api.createOrder({outletId:f.outlet.id,terminalId:f.terminal.id,sessionId:origin.id,experience:'RESTAURANT',fulfillmentType:'TAKEAWAY'},'token',opt())).data;
    o=await add(f,o);const paid=(await pay(f,o,destination)).data;
    assert.equal(paid.payment.sessionId,destination.id);assert.equal((await f.api.expectedCash(origin.id,'token')).data.expectedCashAmount,'0.00');
    assert.equal((await f.api.expectedCash(destination.id,'token')).data.expectedCashAmount,'50.00');
    const g=await fixture(),foreignSession=await session(g);
    o=await add(f,await order(f));await assert.rejects(pay(f,o,foreignSession),{code:'NOT_FOUND'});
  });

  it('D12 Mis mesas and ready summary, guest metadata, authorized reassignment and D23 bill request remain operational without a planner',async()=>{
    const f=await fixture(),o=await order(f),other=await db.userProfile.create({data:{id:await uuid(),authUserId:await uuid(),displayName:'Mesero Dos',email:`${key()}@example.test`}});
    const role=await db.role.create({data:{id:await uuid(),companyId:f.company.id,name:'Mesero fixture',key:key()}});
    for(const actor of [f.actor,other])await db.membership.create({data:{id:await uuid(),companyId:f.company.id,userId:actor.id,roleId:role.id}});
    await assert.rejects(api(f,{permissions:'pos.comandas.create'}).updateRestaurantOrder(o.id,{expectedVersion:o.version,waiterId:other.id},'token',opt()),{code:'FORBIDDEN'});
    const metadata=(await f.api.updateRestaurantOrder(o.id,{expectedVersion:o.version,waiterId:other.id,guestCount:3,notes:'Cumpleaños'},'token',opt())).data;
    assert.equal(metadata.guests.length,3);assert.equal(metadata.guests[0].id,o.guests[0].id);assert.equal(metadata.waiterName,'Mesero Dos');assert.equal(metadata.notes,'Cumpleaños');
    assert.equal((await f.api.tables({outletId:f.outlet.id,myTablesOnly:true},'token')).data.length,0);
    assert.equal((await api(f,{actor:other.id}).tables({outletId:f.outlet.id,myTablesOnly:true},'token')).data.length,1);
    const attempt=opt(),body={expectedVersion:metadata.version};
    const bill=await f.api.requestBill(o.id,body,'token',attempt);assert.deepEqual(await f.api.requestBill(o.id,body,'token',attempt),bill);
    assert.equal((await f.api.tables({outletId:f.outlet.id},'token')).data[0].status,'BILL_REQUESTED');
    await assert.rejects(f.api.updateRestaurantOrder(o.id,{expectedVersion:bill.data.version,guestCount:1},'token',opt()),{code:'INVALID_TRANSITION'});
  });

  it('Caja lists only pending restaurant accounts with table/origin labels and drops paid accounts from the filtered count',async()=>{
    const f=await fixture({mode:'HYBRID'}),s=await session(f);
    let o=await add(f,await order(f));
    await order(f,{tableId:null,fulfillment:'TAKEAWAY'});
    let retail=(await f.api.createOrder({outletId:f.outlet.id,terminalId:f.terminal.id,sessionId:s.id,experience:'RETAIL',fulfillmentType:'TAKEAWAY'},'token',opt())).data;
    retail=await add(f,retail);
    const query={outletId:f.outlet.id,experience:'RESTAURANT',pendingPayment:true,pageSize:1};
    const pending=await f.api.listOrders(query,'token');assert.equal(pending.pagination.total,1);assert.equal(pending.data[0].orderLabel,'Mesa 1');assert.equal(pending.data[0].waiterName,'Mesero Uno');
    o=(await pay(f,o,s,{amount:'20.00',tenderedAmount:'20.00'})).data.order;
    assert.equal((await f.api.listOrders(query,'token')).data[0].remainingAmount,'30.00');
    await pay(f,o,s);assert.equal((await f.api.listOrders(query,'token')).pagination.total,0);
    assert.equal((await f.api.listOrders({...query,experience:'RETAIL'},'token')).data[0].id,retail.id);
  });

  it('reservation creation/arrival/cancellation serialize with tables and keep historical guest details',async()=>{
    const f=await fixture(),ctx={companyId:f.company.id,actorId:f.actor.id},a=createPosReservationService({prisma:db}),b=createPosReservationService({prisma:peer});
    const data={outletId:f.outlet.id,tableId:f.table.id,guestName:'Invitado fixture',guestPhone:'0000000000',partySize:3,scheduledAt:new Date().toISOString()};
    const rs=await Promise.allSettled([a.createReservation({...ctx,data}),b.createReservation({...ctx,data})]);
    assert.equal(rs.filter(r=>r.status==='fulfilled').length,1);assert.equal(await db.posReservation.count({where:{companyId:f.company.id}}),1);
    const r=rs.find(r=>r.status==='fulfilled').value;
    await assert.rejects(order(f),{code:'TABLE_OCCUPIED'});
    await assert.rejects(a.updateReservation({...ctx,id:r.id,data:{status:'SEATED'}}),e=>e.status===409);
    const attempt=opt(),seated=(await f.api.seatReservation(r.id,{},'token',attempt)).data;
    assert.equal(seated.customerName,data.guestName);assert.equal(seated.customerPhone,data.guestPhone);assert.equal(seated.guests.length,3);
    await assert.rejects(b.updateReservation({...ctx,id:r.id,data:{status:'CANCELLED'}}),e=>e.status===409);
    assert.equal((await db.posTable.findUnique({where:{id:f.table.id}})).status,'OCCUPIED');
    assert.equal(await db.auditLog.count({where:{companyId:f.company.id,entityId:r.id,action:'pos.reservation.create'}}),1);
  });

  it('two different boxes concurrently sell the same last unit through RETAIL and RESTAURANT: only one commits',async()=>{
    const f=await fixture({mode:'HYBRID'}),s=await session(f);
    const t2=await db.posTerminal.create({data:{companyId:f.company.id,outletId:f.outlet.id,name:'Mostrador 2'}});
    const s2=(await f.api.openSession({outletId:f.outlet.id,terminalId:t2.id,openingCashAmount:'0.00'},'token',opt())).data;
    f.product=await db.catalogProduct.create({data:{id:await uuid(),companyId:f.company.id,name:'Una botella',slug:'una-botella',price:50,currency:'MXN',trackStock:true,stock:1}});
    await createCatalogCommerceStock({prisma:db}).write({companyId:f.company.id,actorId:f.actor.id},f.product.id,{outletId:f.outlet.id,quantity:1,reason:'Fixture'},key(),true);
    const restaurant=await add(f,await order(f));
    const retail=await add(f,(await f.api.createOrder({outletId:f.outlet.id,terminalId:t2.id,sessionId:s2.id,experience:'RETAIL',fulfillmentType:'TAKEAWAY'},'token',opt())).data);
    const rs=await Promise.allSettled([pay(f,restaurant,s),pay(f,retail,s2,{},api(f,{prisma:peer}))]);
    assert.equal(rs.filter(r=>r.status==='fulfilled').length,1);assert.equal(rs.find(r=>r.status==='rejected').reason.code,'INSUFFICIENT_STOCK');
    assert.equal(await db.posPayment.count({where:{companyId:f.company.id}}),1);assert.equal(await db.catalogStockMovement.count({where:{companyId:f.company.id,sourceType:'POS_SALE'}}),1);
    assert.equal((await db.catalogProduct.findUnique({where:{id:f.product.id}})).stock,0);
  });
});
