import { commandSchemas, commerceDto, parse, fail } from './pos-contracts.js';
import { createPosCommandService } from './pos-command-service.js';
import { createPosRecoveryStore } from './pos-recovery-store.js';
import { createPosRecoveryOrders } from './pos-recovery-orders.js';
import { createPosPaymentService } from './pos-payment-service.js';
import { createPosRefundService } from './pos-refund-service.js';
import { createPosRecoverySessions } from './pos-recovery-sessions.js';

export function createPosRecoveryService({ prisma }) {
  const commands = createPosCommandService({ prisma });
  const store = createPosRecoveryStore({ commands, prisma });
  const sessions = createPosRecoverySessions({ commands, store });
  const handlers = { ...createPosRecoveryOrders({ commands, store }), ...createPosPaymentService({ commands, store }),
    ...createPosRefundService({ commands, store }), ...sessions };

  async function execute(action, ctx, input, params = {}, key) {
    const data = parse(commandSchemas[action], input);
    return commands.run({ ...ctx, operation: action, key, input: { params, data }, execute: (tx) => handlers[action](tx, ctx, data, params) });
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
    const currentSession = terminal ? await prisma.posSession.findFirst({ where: { companyId, terminalId: terminal.id, status: 'OPEN' } }) : null;
    return commerceDto({ companyId, outlets: outlets.map(({id,name,mode}) => ({id,name,mode})), terminals: terminals.map(({id,outletId,name}) => ({id,outletId,name})),
      operationState: !outlet ? 'SELECT_OUTLET' : !terminal ? 'SELECT_TERMINAL' : !settings?.currency ? 'CONFIGURATION_REQUIRED' : !currentSession ? 'OPEN_SESSION' : currentSession.currency!==settings.currency ? 'RECONCILIATION_REQUIRED' : 'READY',
      selectedOutletId: outlet?.id ?? null, selectedTerminalId: terminal?.id ?? null, currentSession,
      currency: settings?.currency ?? null, paymentMethods: methods,
      capabilities: {
        retail: outlet ? ['RETAIL','HYBRID'].includes(outlet.mode) : false,
        restaurant: outlet ? ['RESTAURANT','HYBRID'].includes(outlet.mode) : false,
        charge: allowed('pos.payments.create','pos.caja.operate','pos.comandas.charge'),
        openSession: allowed('pos.sessions.manage','pos.caja.operate'), closeSession: allowed('pos.sessions.manage','pos.caja.close'),
        refund: allowed('pos.refunds.create'), discount: allowed('pos.discounts.apply'),
        kitchenOperate: allowed('pos.stations.manage','pos.cocina.operate'), floorPlanner: allowed('pos.floor.manage','pos.admin.update'),
      }, contractVersion: 'pos-recovery-v1', activation: { phase: 3, trackedStockSales: true, retailBackendReady: true, retailUiReady: false },
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
    return prisma.$transaction(async (tx) => {
      if(filters.outletId)await store.row(tx,'posOutlet',companyId,filters.outletId);
      if(filters.terminalId)await store.row(tx,'posTerminal',companyId,filters.terminalId,filters.outletId?{outletId:filters.outletId}:{});
      const start=filters.from?new Date(filters.from):null;
      const end=filters.to?new Date(new Date(filters.to).getTime()+(filters.to.length===10?86400000:0)):null;
      if(start&&end&&start>=end)fail('VALIDATION_ERROR','El intervalo de fechas es inválido.',400);
      if(start||end)where.openedAt={...(start?{gte:start}:{}),...(end?{lt:end}:{})};
      if(filters.search){const number=Number(filters.search.replace('#',''));where.OR=[{orderNumber:number},{receipts:{some:{companyId,receiptNumber:number}}}];}
      const [rows, total] = await Promise.all([tx.posOrder.findMany({ where, orderBy: [{ openedAt: 'desc' },{ id: 'desc' }],
        include:{receipts:{where:{companyId,kind:'SALE'},select:{id:true,receiptNumber:true},orderBy:{receiptNumber:'desc'},take:1},_count:{select:{lines:{where:{voided:false}}}}},
        skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }), tx.posOrder.count({ where })]);
      const data=rows.map(({receipts,_count,...value})=>({...value,historicalCurrencyUnknown:!value.currency,
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

  return { execute, context, getOrder, listOrders, expectedCash, currentSession, getSession };
}
