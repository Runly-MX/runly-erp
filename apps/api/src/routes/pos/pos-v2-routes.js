import { createPosRefundQuoteService } from './pos-refund-quote-service.js';
import {createPosReceiptService} from './pos-receipt-service.js';
import {restaurantQuerySchema,kitchenQuerySchema} from './pos-contracts.js';
import {createPosModifierService} from './pos-modifier-service.js';
import {currentSessionQuerySchema,printJobSchema,printResultSchema} from './pos-contracts.js';
import { Hono } from 'hono';
import { CommerceError, contextQuerySchema, listOrdersSchema, parse, resourceIdSchema, refundPreviewSchema, shiftStatusSchema } from './pos-contracts.js';
import { createPosRecoveryService } from './pos-recovery-service.js';
import { getActorId, getCompanyId,PosServiceError } from './service-helpers.js';
import { orderStatusSchema, salesChannelSchema } from './validators.js';

export const POS_OPERATION_PERMISSIONS = ['pos.terminal.use','pos.caja.read','pos.caja.operate','pos.comandas.read','pos.comandas.create','pos.cocina.read','pos.admin.read','pos.settings.manage'];
const orderRead = ['pos.orders.read','pos.caja.read','pos.caja.operate','pos.comandas.read'];
const orderCreate = ['pos.orders.create','pos.caja.operate','pos.comandas.create'];
const orderEdit = ['pos.orders.update','pos.caja.operate','pos.comandas.create'];
const sessionRead = ['pos.sessions.read','pos.caja.read','pos.caja.operate'];
const kitchenRead=['pos.stations.read','pos.cocina.read','pos.cocina.operate','pos.stations.manage'];

export function createPosV2Router({ prisma, requirePermission, requireAnyPermission, broadcaster }) {
  const app = new Hono();
  const service = createPosRecoveryService({ prisma });
  const receipts=createPosReceiptService({prisma});
  const any = requireAnyPermission ?? ((keys) => requirePermission(keys[0]));

  app.use('/pos/v2/*', async (c, next) => {
    await next();
    if (![401,403].includes(c.res.status)) return;
    const response = await c.res.clone().json().catch(() => null);
    if (typeof response?.error === 'string') c.res = c.json({ error: { code: 'FORBIDDEN', message: response.error },
      requestId: c.get('requestId') ?? `pos-${Date.now().toString(36)}` }, c.res.status);
  });

  function permissions(c) {
    const user = c.get('userContext');
    return { isAdmin: Boolean(user?.isAdmin), permissionSet: user?.permissionSet ?? new Set() };
  }

  function error(c, err, legacy = false) {
    const known=err instanceof CommerceError||err instanceof PosServiceError;
    const code = err instanceof CommerceError ? err.code : known?(err.status===404?'NOT_FOUND':err.status===400?'VALIDATION_ERROR':'INVALID_TRANSITION'):'INTERNAL_ERROR';
    const status = known ? err.status : 500;
    const message = known ? err.message : 'No se pudo confirmar la operación. Reintenta con la misma clave.';
    return c.json(legacy ? { error: message, code } : { error: { code, message }, requestId: c.get('requestId') ?? `pos-${Date.now().toString(36)}` }, status);
  }

  function read(handler, legacy = false) {
    return async (c) => { try { return await handler(c); } catch (err) { return error(c, err, legacy); } };
  }

  app.get('/pos/v2/context', any(POS_OPERATION_PERMISSIONS), read(async (c) => c.json({ data: await service.context(
    getCompanyId(c), parse(contextQuerySchema, c.req.query()), permissions(c),
  ) })));
  app.get('/pos/v2/orders', any(orderRead), read(async (c) => c.json(await service.listOrders(getCompanyId(c), parse(listOrdersSchema, c.req.query())))));
  app.get('/pos/v2/sessions/current',any(sessionRead),read(async(c)=>c.json({data:await service.currentSession(getCompanyId(c),parse(currentSessionQuerySchema,c.req.query()))})));
  app.get('/pos/v2/sessions/:id',any(sessionRead),read(async(c)=>c.json({data:await service.getSession(getCompanyId(c),parse(resourceIdSchema,c.req.param('id')))})));
  app.get('/pos/v2/receipts/:id',any(orderRead),read(async(c)=>c.json({data:await receipts.get(getCompanyId(c),parse(resourceIdSchema,c.req.param('id')))})));
  app.post('/pos/v2/receipts/:id/print-jobs',any(orderRead),read(async(c)=>c.json({data:await receipts.create({companyId:getCompanyId(c),actorId:getActorId(c)},parse(resourceIdSchema,c.req.param('id')),parse(printJobSchema,await c.req.json().catch(()=>null)),c.req.header('Idempotency-Key'))})));
  const printResult=(nested)=>read(async(c)=>c.json({data:await receipts.result({companyId:getCompanyId(c),actorId:getActorId(c)},parse(resourceIdSchema,c.req.param('jobId')),parse(printResultSchema,await c.req.json().catch(()=>null)),c.req.header('Idempotency-Key'),permissions(c),nested?parse(resourceIdSchema,c.req.param('id')):undefined)}));
  app.post('/pos/v2/receipts/:id/print-jobs/:jobId/result',any([...orderRead,'pos.admin.update']),printResult(true));
  app.post('/pos/v2/print-jobs/:jobId/result',any([...orderRead,...kitchenRead,'pos.admin.update']),printResult(false));
  app.get('/pos/v2/tables',any([...orderRead,'pos.comandas.create','pos.floor.read']),read(async c=>c.json({data:await service.tables(getCompanyId(c),parse(restaurantQuerySchema,c.req.query()),getActorId(c))})));
  app.get('/pos/v2/orders/:id/seat-totals',any(orderRead),read(async c=>c.json({data:await service.seatTotals(getCompanyId(c),parse(resourceIdSchema,c.req.param('id')))})));
  app.get('/pos/v2/kitchen/tickets',any(kitchenRead),read(async c=>c.json(await service.listTickets(getCompanyId(c),parse(kitchenQuerySchema,c.req.query())))));
  app.get('/pos/v2/kitchen/tickets/:id',any(kitchenRead),read(async c=>c.json({data:await service.getKitchenTicket(getCompanyId(c),parse(resourceIdSchema,c.req.param('id')))})));
  app.get('/pos/v2/stations',any([...kitchenRead,'pos.comandas.read','pos.comandas.create']),read(async c=>{
    const {outletId}=parse(restaurantQuerySchema,c.req.query()),companyId=getCompanyId(c);
    if(!await prisma.posOutlet.findFirst({where:{id:outletId,companyId,enabled:true}}))throw new CommerceError('NOT_FOUND','Sucursal no encontrada.',404);
    return c.json({data:await prisma.posKitchenStation.findMany({where:{companyId,outletId,enabled:true},orderBy:{name:'asc'}})});
  }));
  app.get('/pos/v2/sellables/:id/modifiers',any([...orderRead,'pos.comandas.create']),read(async c=>{
    const id=parse(resourceIdSchema,c.req.param('id')),companyId=getCompanyId(c);
    if(!await prisma.catalogProduct.findFirst({where:{id,companyId,enabled:true}}))throw new CommerceError('NOT_FOUND','Producto no encontrado.',404);
    return c.json({data:await createPosModifierService({prisma}).listForProduct({companyId,productId:id})});
  }));
  app.get('/pos/v2/orders/:id', any(orderRead), read(async (c) => c.json({ data: await service.getOrder(getCompanyId(c), parse(resourceIdSchema, c.req.param('id'))) })));
  app.get('/pos/v2/sessions/:id/expected-cash', any(sessionRead), read(async (c) => c.json({ data: await service.expectedCash(getCompanyId(c), parse(resourceIdSchema, c.req.param('id'))) })));
  app.post('/pos/v2/orders/:id/refunds/preview', requirePermission('pos.refunds.create'), read(async (c) => c.json({ data: await createPosRefundQuoteService({ prisma }).preview(getCompanyId(c), parse(resourceIdSchema,c.req.param('id')),parse(refundPreviewSchema,await c.req.json())) })));
  app.get('/pos/v2/payment-methods', any(POS_OPERATION_PERMISSIONS), read(async (c) => c.json({ data: (await service.context(getCompanyId(c), {}, permissions(c))).paymentMethods })));
  app.get('/pos/v2/waiter-shifts', any(['pos.caja.read','pos.caja.close']), read(async (c) => {
    const outletId = c.req.query('outletId');
    if (outletId) parse(resourceIdSchema, outletId);
    return c.json({ data: await prisma.posWaiterShift.findMany({ where: { companyId: getCompanyId(c), ...(outletId ? { outletId } : {}),
      ...(c.req.query('status') ? { status: parse(shiftStatusSchema, c.req.query('status')) } : {}) }, orderBy: { openedAt: 'desc' } }) });
  }));

  function command(action, legacy = false) {
    return read(async (c) => {
      const params = Object.fromEntries(Object.entries(c.req.param()).map(([k,v]) => [k, parse(resourceIdSchema, v)]));
      const body = await c.req.json().catch(() => null);
      // Validate key before accepting or translating legacy payloads; missing keys never write.
      const key = c.req.header('Idempotency-Key');
      if (!key || !/^[\x21-\x7e]{16,128}$/.test(key)) throw new CommerceError('IDEMPOTENCY_REQUIRED', 'Falta una clave de intento válida.', 428);
      if (action === 'payment') {
        const p = permissions(c);
        if (body?.sessionId && !p.isAdmin && !['pos.payments.create','pos.caja.operate'].some((k) => p.permissionSet.has(k))) throw new CommerceError('FORBIDDEN', 'El cobro en mesa no permite operar una caja.', 403);
        if (!body?.sessionId && !p.isAdmin && !p.permissionSet.has('pos.comandas.charge')) throw new CommerceError('FORBIDDEN', 'Caja requiere una sesión explícita; el cobro en mesa requiere su propio permiso.', 403);
      }
      // The counter (RETAIL) belongs to Caja: table-service roles (comandas only) may
      // neither open a counter sale nor edit someone else's cart.
      if (!['payment'].includes(action)) {
        const p = permissions(c);
        const counterRoles = ['pos.orders.create','pos.orders.update','pos.caja.operate'];
        const touchesCounter = action === 'createOrder' ? body?.experience === 'RETAIL'
          : ['addLine','updateLine','deleteLine'].includes(action) && params.orderId
            ? (await prisma.posOrder.findFirst({ where: { id: params.orderId, companyId: getCompanyId(c) }, select: { experience: true } }))?.experience === 'RETAIL'
            : false;
        if (touchesCounter && !p.isAdmin && !counterRoles.some((k) => p.permissionSet.has(k))) throw new CommerceError('FORBIDDEN', 'Las ventas de mostrador requieren permiso de Caja.', 403);
      }
      if(action==='updateRestaurantOrder'&&body?.waiterId&&body.waiterId!==getActorId(c)){
        const p=permissions(c);if(!p.isAdmin&&!['pos.orders.update','pos.admin.update'].some(k=>p.permissionSet.has(k)))throw new CommerceError('FORBIDDEN','No tienes permiso para reasignar a otro mesero.',403);
      }
      const result = await service.execute(action, { companyId: getCompanyId(c), actorId: getActorId(c) }, body, params, key);
      // Notification failure never turns a committed payment into an apparent failure.
      const updatedOrderId=params.orderId??result.orderId;
      if (broadcaster && updatedOrderId) Promise.resolve().then(() => broadcaster.broadcastToCompany(getCompanyId(c), 'pos.order.updated', {
        orderId: updatedOrderId, action, version: result.order?.version ?? result.orderVersion ?? result.version,
      })).catch(() => {});
      const data = legacy && action === 'payment' ? result.payment : result;
      return c.json({ data });
    }, legacy);
  }

  const routes = [
    ['post','/orders','createOrder',orderCreate],
    ['post','/orders/:orderId/lines','addLine',orderEdit],
    ['patch','/orders/:orderId/lines/:lineId','updateLine',orderEdit],
    ['delete','/orders/:orderId/lines/:lineId','deleteLine',orderEdit],
    ['post','/orders/:orderId/lines/:lineId/discount','discount',['pos.discounts.apply']],
    ['post','/orders/:orderId/payments','payment',['pos.payments.create','pos.caja.operate','pos.comandas.charge']],
    ['post','/orders/:orderId/cancel','cancel',['pos.orders.cancel']],
    ['post','/orders/:orderId/refunds','refund',['pos.refunds.create']],
    ['post','/sessions/open','openSession',['pos.sessions.manage','pos.caja.operate']],
    ['post','/sessions/:sessionId/close','closeSession',['pos.sessions.manage','pos.caja.close']],
    ['post','/sessions/:sessionId/cash-movements','cashMovement',['pos.cash.manage','pos.caja.operate']],
    ['post','/waiter-shifts/open','openShift',['pos.comandas.charge']],
    ['post','/waiter-shifts/:shiftId/close','closeShift',['pos.sessions.manage','pos.caja.close']],
    ['post','/tables','createTable',['pos.floor.manage','pos.admin.update']],
    ['patch','/tables/:tableId','updateTable',['pos.floor.manage','pos.admin.update']],
    ['patch','/orders/:orderId/restaurant','updateRestaurantOrder',orderEdit],
    ['post','/orders/:orderId/request-bill','requestBill',orderEdit],
    ['post','/orders/:orderId/kitchen-dispatches','dispatch',orderEdit],
    ['post','/orders/:orderId/lines/:lineId/void-preparation','voidPreparation',['pos.orders.cancel']],
    ['post','/orders/:orderId/payment-allocations','allocatePayment',['pos.payments.create','pos.caja.operate']],
    ['patch','/kitchen/tickets/:ticketId/lines/:lineId','kitchenLine',['pos.stations.manage','pos.cocina.operate']],
    ['post','/kitchen/tickets/:ticketId/print-jobs','kitchenPrint',kitchenRead],
    ['post','/reservations/:reservationId/seat','seatReservation',orderCreate],
  ];
  for (const [verb, path, action, keys] of routes) {
    app[verb](`/pos/v2${path}`, any(keys), command(action));
    // Floor-linked table creation keeps its existing administrative contract.
    if(action!=='createTable')app[verb](`/pos${path}`, any(keys), command(action, true));
  }

  app.post('/pos/orders/:orderId/send-to-kitchen',any(orderEdit),command('dispatch',true));
  // Do not leave an old
  // writer able to race the command kernel or reopen a financial terminal state.
  for (const [verb,path] of [['patch','/pos/orders/:id'],['post','/pos/orders/:id/guests'],['patch','/pos/orders/:id/waiter'],
    ['post','/pos/orders/:id/claim'],['post','/pos/orders/:id/receipts/reprint']]) {
    app[verb](path, any(orderEdit), async (c) => c.json({ error: 'Este comando legado requiere el contrato de integración posterior.', code: 'CONTRACT_NOT_AVAILABLE' }, 409));
  }
  app.get('/pos/orders/:id/seat-totals', any(orderRead), read(async c=>c.json({data:await service.seatTotals(getCompanyId(c),parse(resourceIdSchema,c.req.param('id')))}),true));
  app.patch('/pos/kitchen/tickets/:ticketId/lines/:lineId/status',any(['pos.stations.manage','pos.cocina.operate']),command('kitchenLine',true));
  for(const path of ['/pos/kitchen/tickets/:ticketId/status','/pos/tables/:tableId/status','/pos/tables/:tableId/waiter'])app.patch(path,any([...orderEdit,...kitchenRead,'pos.floor.manage']),async c=>c.json({error:'Usa el comando C6 con versión y clave de intento.',code:'CONTRACT_NOT_AVAILABLE'},409));

  // Compatible operational reads expose enabled resources; administrative writes
  // continue through the existing, stricter settings handlers.
  app.get('/pos/outlets', any(POS_OPERATION_PERMISSIONS), read(async (c) => c.json({ data: await prisma.posOutlet.findMany({ where: { companyId: getCompanyId(c), enabled: true }, orderBy: { name: 'asc' } }) }), true));
  app.get('/pos/terminals', any(POS_OPERATION_PERMISSIONS), read(async (c) => c.json({ data: await prisma.posTerminal.findMany({ where: { companyId: getCompanyId(c), enabled: true, outlet: { companyId: getCompanyId(c), enabled: true } }, orderBy: { name: 'asc' } }) }), true));
  app.get('/pos/settings', any(POS_OPERATION_PERMISSIONS), read(async (c) => c.json({ data: await prisma.posSettings.findUnique({ where: { companyId: getCompanyId(c) } }) }), true));
  app.get('/pos/payment-methods', any(POS_OPERATION_PERMISSIONS), read(async (c) => c.json({ data: await prisma.posPaymentMethod.findMany({ where: { companyId: getCompanyId(c), enabled: true } }) }), true));
  app.get('/pos/orders', any(orderRead), read(async (c) => {
    const query = c.req.query();
    const date = (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(new Date(value).getTime())) throw new CommerceError('VALIDATION_ERROR','Fecha inválida.',400);
      return new Date(value);
    };
    const openedAt = { ...(query.dateFrom ? { gte: date(query.dateFrom) } : {}),
      ...(query.dateTo ? { lt: new Date(date(query.dateTo).getTime() + 86400000) } : {}) };
    return c.json({ data: await prisma.posOrder.findMany({ where: { companyId: getCompanyId(c),
      ...(query.status ? { status: parse(orderStatusSchema, query.status) } : {}),
      ...(query.salesChannel ? { salesChannel: parse(salesChannelSchema, query.salesChannel) } : {}),
      ...(Object.keys(openedAt).length ? { openedAt } : {}),
    }, orderBy: { openedAt: 'desc' } }) });
  }, true));
  app.get('/pos/orders/:id', any(orderRead), read(async (c) => c.json({ data: await service.getOrder(getCompanyId(c), parse(resourceIdSchema, c.req.param('id'))) }), true));
  app.get('/pos/sessions/:id/expected-cash', any(sessionRead), read(async (c) => c.json({ data: await service.expectedCash(getCompanyId(c), parse(resourceIdSchema, c.req.param('id'))) }), true));
  app.get('/pos/sessions/current', any(sessionRead), read(async (c) => {
    const terminalId = parse(resourceIdSchema, c.req.query('terminalId'));
    return c.json({ data: await prisma.posSession.findFirst({ where: { companyId: getCompanyId(c), terminalId, status: 'OPEN' } }) });
  }, true));
  return app;
}
