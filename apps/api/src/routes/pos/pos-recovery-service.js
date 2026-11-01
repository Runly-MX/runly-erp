import { commandSchemas, commerceDto, parse, fail,RESTAURANT_LATE_AFTER_MINUTES } from './pos-contracts.js';
import { createPosCommandService } from './pos-command-service.js';
import { createPosRecoveryStore } from './pos-recovery-store.js';
import { createPosRecoveryOrders } from './pos-recovery-orders.js';
import { createPosPaymentService } from './pos-payment-service.js';
import { createPosRefundService } from './pos-refund-service.js';
import { createPosRecoverySessions } from './pos-recovery-sessions.js';
import {createPosRestaurantService} from './pos-restaurant-service.js';
import {createPosPreparationService} from './pos-preparation-service.js';
import {createPosAllocationsService} from './pos-allocations-service.js';
import {createPosKitchenPrintService} from './pos-kitchen-print-service.js';
import {PosServiceError} from './service-helpers.js';

export function createPosRecoveryService({ prisma }) {
  const commands = createPosCommandService({ prisma });
  const store = createPosRecoveryStore({ commands, prisma });
  const sessions = createPosRecoverySessions({ commands, store });
  const restaurant=createPosRestaurantService({commands,store,prisma});
  const preparation=createPosPreparationService({commands,store,prisma});
  const allocations=createPosAllocationsService({commands,store});
  const kitchenPrint=createPosKitchenPrintService({commands,store,preparation});
  const handlers = { ...createPosRecoveryOrders({ commands, store }), ...createPosPaymentService({ commands, store }),
    ...createPosRefundService({ commands, store }), ...sessions,...restaurant,...preparation,...allocations,
    kitchenPrint:(tx,ctx,data,{ticketId})=>kitchenPrint.create(tx,ctx,{...data,ticketId}) };

  async function execute(action, ctx, input, params = {}, key) {
    const data = parse(commandSchemas[action], input);
    try{return await commands.run({ ...ctx, operation: action, key, input: { params, data }, execute: (tx) => handlers[action](tx, ctx, data, params) });}
    catch(error){if(error instanceof PosServiceError)fail(error.status===404?'NOT_FOUND':error.status===400?'VALIDATION_ERROR':'INVALID_TRANSITION',error.message,error.status);throw error;}
  }

  async function context(companyId, selection, permissions) {
    if (!companyId) fail('FORBIDDEN', 'Empresa requerida.', 403);
    const [outlets, terminals, settings, methods] = await Promise.all([
      prisma.posOutlet.findMany({ where: { companyId, enabled: true }, orderBy: { name: 'asc' } }),
      prisma.posTerminal.findMany({ where: { companyId, enabled: true, outlet: { companyId, enabled: true } }, orderBy: { name: 'asc' } }),
      prisma.posSettings.findUnique({ where: { companyId } }),
      prisma.posPaymentMethod.findMany({ where: { companyId, enabled: true }, orderBy: { name: 'asc' } }),
    ]);
    if (selection.terminalId && !selection.outletId) fail('VALIDATION_ERROR', 'Selecciona sucursal y terminal juntas.', 400);
    const outlet = outlets.find((o) => o.id === selection.outletId);
    const terminal = terminals.find((t) => t.id === selection.terminalId && t.outletId === selection.outletId);
    if ((selection.outletId && !outlet) || (selection.terminalId && !terminal)) fail('NOT_FOUND', 'La selección guardada ya no está disponible.', 404);
    const allowed = (...keys) => permissions.isAdmin || keys.some((k) => permissions.permissionSet?.has(k));
    const tableCharge=Boolean(outlet&&['RESTAURANT','HYBRID'].includes(outlet.mode)&&outlet.allowTableCharge&&allowed('pos.comandas.charge'));
    const currentSession = terminal ? await prisma.posSession.findFirst({ where: { companyId, terminalId: terminal.id, status: 'OPEN' } }) : null;
    return commerceDto({ companyId, outlets: outlets.map(({id,name,mode}) => ({id,name,mode})), terminals: terminals.map(({id,outletId,name}) => ({id,outletId,name})),
      operationState: !outlet ? 'SELECT_OUTLET' : !terminal ? 'SELECT_TERMINAL' : !settings?.currency ? 'CONFIGURATION_REQUIRED' : !currentSession ? 'OPEN_SESSION' : currentSession.currency!==settings.currency ? 'RECONCILIATION_REQUIRED' : 'READY',
      restaurantOperationState:!outlet?'SELECT_OUTLET':!['RESTAURANT','HYBRID'].includes(outlet.mode)?'EXPERIENCE_NOT_AVAILABLE':!settings?.currency?'CONFIGURATION_REQUIRED':'READY',
      selectedOutletId: outlet?.id ?? null, selectedTerminalId: terminal?.id ?? null, currentSession,
      currency: settings?.currency ?? null, paymentMethods: methods,
      preparation:outlet?{kdsEnabled:outlet.kitchenKdsEnabled,printEnabled:outlet.kitchenPrintEnabled,
        manual:!outlet.kitchenKdsEnabled&&!outlet.kitchenPrintEnabled,lateAfterMinutes:RESTAURANT_LATE_AFTER_MINUTES}:null,
      capabilities: {
        retail: outlet ? ['RETAIL','HYBRID'].includes(outlet.mode) : false,
        restaurant: outlet ? ['RESTAURANT','HYBRID'].includes(outlet.mode) : false,
        takeOrders:Boolean(outlet&&['RESTAURANT','HYBRID'].includes(outlet.mode)&&allowed('pos.orders.create','pos.comandas.create','pos.caja.operate')),
        charge: allowed('pos.payments.create','pos.caja.operate')||tableCharge,tableCharge,
        openSession: allowed('pos.sessions.manage','pos.caja.operate'), closeSession: allowed('pos.sessions.manage','pos.caja.close'),
        refund: allowed('pos.refunds.create'), discount: allowed('pos.discounts.apply'),
        kitchenOperate: allowed('pos.stations.manage','pos.cocina.operate'), floorPlanner: allowed('pos.floor.manage','pos.admin.update'),
      }, contractVersion: 'pos-recovery-v1', activation: { phase: 4, trackedStockSales: true, retailBackendReady: true, retailUiReady: true,restaurantBackendReady:true,restaurantUiReady:false },
    });
  }

  async function getOrder(companyId, id) {
    if (!companyId) fail('FORBIDDEN', 'Empresa requerida.', 403);
    // A repeatable-read transaction gives a coherent header/lines/payment snapshot.
    return prisma.$transaction((tx) => store.dto(tx, companyId, id), { isolationLevel: 'RepeatableRead' });
  }

  async function listOrders(companyId, filters) {
    if (!companyId) fail('FORBIDDEN', 'Empresa requerida.', 403);
    const where = { companyId, ...(filters.outletId ? { outletId: filters.outletId } : {}), ...(filters.status ? { status: filters.status } : {}),
      ...(filters.terminalId ? {terminalId:filters.terminalId}:{}),...(filters.experience?{experience:filters.experience}:{}) };
    if(filters.pendingPayment){
      if(['PAID','CANCELLED','REFUNDED'].includes(filters.status))fail('VALIDATION_ERROR','El filtro de cobro pendiente excluye estados cerrados.',400);
      where.status=filters.status??{notIn:['PAID','CANCELLED','REFUNDED']};where.totalAmount={gt:0};
    }
    return prisma.$transaction(async (tx) => {
      if(filters.outletId)await store.row(tx,'posOutlet',companyId,filters.outletId);
      if(filters.terminalId)await store.row(tx,'posTerminal',companyId,filters.terminalId,filters.outletId?{outletId:filters.outletId}:{});
      const start=filters.from?new Date(filters.from):null;
      const end=filters.to?new Date(new Date(filters.to).getTime()+(filters.to.length===10?86400000:0)):null;
      if(start&&end&&start>=end)fail('VALIDATION_ERROR','El intervalo de fechas es inválido.',400);
      if(start||end)where.openedAt={...(start?{gte:start}:{}),...(end?{lt:end}:{})};
      if(filters.search){const number=Number(filters.search.replace('#',''));where.OR=[{orderNumber:number},{receipts:{some:{companyId,receiptNumber:number}}}];}
      const [rows, total] = await Promise.all([tx.posOrder.findMany({ where, orderBy: [{ openedAt: 'desc' },{ id: 'desc' }],
        include:{table:{select:{id:true,name:true}},receipts:{where:{companyId,kind:'SALE'},select:{id:true,receiptNumber:true},orderBy:{receiptNumber:'desc'},take:1},_count:{select:{lines:{where:{voided:false}}}}},
        skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }), tx.posOrder.count({ where })]);
      const waiters=await tx.userProfile.findMany({where:{id:{in:rows.map(r=>r.waiterId).filter(Boolean)}},select:{id:true,displayName:true}});
      const data=rows.map(({receipts,_count,table,...value})=>({...value,historicalCurrencyUnknown:!value.currency,
        tableName:table?.name??null,waiterName:waiters.find(w=>w.id===value.waiterId)?.displayName??null,
        orderLabel:table?.name??`${{TAKEAWAY:'Para llevar',PICKUP:'Recoger',DELIVERY:'Entrega',DINE_IN:'Cuenta'}[value.fulfillmentType]??'Orden'} #${value.orderNumber}`,
        receiptId:receipts[0]?.id??null,receiptNumber:receipts[0]?.receiptNumber??null,lineCount:_count.lines,
        netPaidAmount:store.amount(store.decimal(value.paidAmount).minus(value.refundedAmount)),
        remainingAmount:store.amount(['PAID','CANCELLED','REFUNDED'].includes(value.status)?0:store.decimal(value.totalAmount).minus(value.paidAmount).plus(value.refundedAmount)),
        refundStatus:store.decimal(value.refundedAmount).eq(0)?'NONE':store.decimal(value.refundedAmount).eq(value.paidAmount)?'FULL':'PARTIAL'}));
      return commerceDto({data,pagination:{page:filters.page,pageSize:filters.pageSize,total,hasMore:filters.page*filters.pageSize<total}});
    }, { isolationLevel: 'RepeatableRead' });
  }

  async function currentSession(companyId,{outletId,terminalId}){
    if(!companyId)fail('FORBIDDEN','Empresa requerida.',403);
    await store.row(prisma,'posOutlet',companyId,outletId,{enabled:true});
    await store.row(prisma,'posTerminal',companyId,terminalId,{outletId,enabled:true});
    return commerceDto(await prisma.posSession.findFirst({where:{companyId,outletId,terminalId,status:'OPEN'}}));
  }
  async function getSession(companyId,id){
    if(!companyId)fail('FORBIDDEN','Empresa requerida.',403);
    return prisma.$transaction(async(tx)=>{
      const value=await store.row(tx,'posSession',companyId,id);
      const audit=value.status==='CLOSED'?await tx.auditLog.findFirst({where:{companyId,entityType:'PosSession',entityId:id,action:'pos.session.close'},orderBy:{createdAt:'desc'}}):null;
      const breakdown=value.status==='OPEN'?await sessions.expectedCash(tx,companyId,value):audit?.metadata??null;
      return commerceDto({...value,breakdown,frozen:value.status!=='OPEN',historicalBreakdownUnknown:value.status!=='OPEN'&&!breakdown});
    },{isolationLevel:'RepeatableRead'});
  }

  async function expectedCash(companyId, sessionId) {
    if (!companyId) fail('FORBIDDEN', 'Empresa requerida.', 403);
    return prisma.$transaction(async (tx) => {
      const value = await store.row(tx, 'posSession', companyId, sessionId);
      if (value.status !== 'OPEN') return { expectedCashAmount: store.amount(value.expectedCashAmount ?? 0), frozen: true };
      return sessions.expectedCash(tx, companyId, value);
    }, { isolationLevel: 'RepeatableRead' });
  }

  async function seatTotals(companyId,id){return prisma.$transaction(async tx=>allocations.totals(tx,await store.row(tx,'posOrder',companyId,id)),{isolationLevel:'RepeatableRead'});}
  return { execute, context, getOrder, listOrders, expectedCash, currentSession, getSession,seatTotals,tables:restaurant.tables,listTickets:preparation.listTickets,getKitchenTicket:preparation.getTicket };
}
