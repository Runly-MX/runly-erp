import { createPosRefundQuoteService } from './pos-refund-quote-service.js';
import { Hono } from 'hono';
import { CommerceError, contextQuerySchema, listOrdersSchema, parse, resourceIdSchema, refundPreviewSchema, shiftStatusSchema } from './pos-contracts.js';
import { createPosRecoveryService } from './pos-recovery-service.js';
import { getActorId, getCompanyId } from './service-helpers.js';
import { orderStatusSchema, salesChannelSchema } from './validators.js';

export const POS_OPERATION_PERMISSIONS = ['pos.terminal.use','pos.caja.read','pos.comandas.read','pos.cocina.read','pos.admin.read','pos.settings.manage'];
const orderRead = ['pos.orders.read','pos.caja.read','pos.comandas.read'];
const orderCreate = ['pos.orders.create','pos.caja.operate','pos.comandas.create'];
const orderEdit = ['pos.orders.update','pos.caja.operate','pos.comandas.create'];
const sessionRead = ['pos.sessions.read','pos.caja.read'];

export function createPosV2Router({ prisma, requirePermission, requireAnyPermission, broadcaster }) {
  const app = new Hono();
  const service = createPosRecoveryService({ prisma });
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
    const code = err instanceof CommerceError ? err.code : 'INTERNAL_ERROR';
    const status = err instanceof CommerceError ? err.status : 500;
    const message = err instanceof CommerceError ? err.message : 'No se pudo confirmar la operación. Reintenta con la misma clave.';
    return c.json(legacy ? { error: message, code } : { error: { code, message }, requestId: c.get('requestId') ?? `pos-${Date.now().toString(36)}` }, status);
  }

  function read(handler, legacy = false) {
    return async (c) => { try { return await handler(c); } catch (err) { return error(c, err, legacy); } };
  }

  app.get('/pos/v2/context', any(POS_OPERATION_PERMISSIONS), read(async (c) => c.json({ data: await service.context(
    getCompanyId(c), parse(contextQuerySchema, c.req.query()), permissions(c),
  ) })));
  app.get('/pos/v2/orders', any(orderRead), read(async (c) => c.json(await service.listOrders(getCompanyId(c), parse(listOrdersSchema, c.req.query())))));
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
      const result = await service.execute(action, { companyId: getCompanyId(c), actorId: getActorId(c) }, body, params, key);
      // Notification failure never turns a committed payment into an apparent failure.
      if (broadcaster && params.orderId) Promise.resolve().then(() => broadcaster.broadcastToCompany(getCompanyId(c), 'pos.order.updated', {
        orderId: params.orderId, action, version: result.order?.version ?? result.version,
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
  ];
  for (const [verb, path, action, keys] of routes) {
    app[verb](`/pos/v2${path}`, any(keys), command(action));
    app[verb](`/pos${path}`, any(keys), command(action, true));
  }

  // These mutators are not part of the phase-1 contract. Do not leave an old
  // writer able to race the command kernel or reopen a financial terminal state.
  for (const [verb,path] of [['patch','/pos/orders/:id'],['post','/pos/orders/:id/guests'],['patch','/pos/orders/:id/waiter'],
    ['post','/pos/orders/:id/claim'],['post','/pos/orders/:id/send-to-kitchen'],['post','/pos/orders/:id/receipts/reprint']]) {
    app[verb](path, any(orderEdit), async (c) => c.json({ error: 'Este comando legado requiere el contrato de integración posterior.', code: 'CONTRACT_NOT_AVAILABLE' }, 409));
  }
  app.get('/pos/orders/:id/seat-totals', any(orderRead), async (c) => c.json({ error: 'La atribución de cuentas requiere C6 de fase 4.', code: 'CONTRACT_NOT_AVAILABLE' }, 409));

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
