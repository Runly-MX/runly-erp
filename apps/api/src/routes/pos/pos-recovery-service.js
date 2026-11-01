import { commandSchemas, commerceDto, parse, fail } from './pos-contracts.js';
import { createPosCommandService } from './pos-command-service.js';
import { createPosRecoveryStore } from './pos-recovery-store.js';
import { createPosRecoveryOrders } from './pos-recovery-orders.js';
import { createPosPaymentService } from './pos-payment-service.js';
import { createPosRefundService } from './pos-refund-service.js';
import { createPosRecoverySessions } from './pos-recovery-sessions.js';

export function createPosRecoveryService({ prisma }) {
  const commands = createPosCommandService({ prisma });
  const store = createPosRecoveryStore({ commands });
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
      selectedOutletId: outlet?.id ?? null, selectedTerminalId: terminal?.id ?? null, currentSession,
      currency: settings?.currency ?? null, paymentMethods: methods,
      capabilities: {
        retail: outlet ? ['RETAIL','HYBRID'].includes(outlet.mode) : false,
        restaurant: outlet ? ['RESTAURANT','HYBRID'].includes(outlet.mode) : false,
        charge: allowed('pos.payments.create','pos.caja.operate','pos.comandas.charge'),
        openSession: allowed('pos.sessions.manage','pos.caja.operate'), closeSession: allowed('pos.sessions.manage','pos.caja.close'),
        refund: allowed('pos.refunds.create'), discount: allowed('pos.discounts.apply'),
        kitchenOperate: allowed('pos.stations.manage','pos.cocina.operate'), floorPlanner: allowed('pos.floor.manage','pos.admin.update'),
      }, contractVersion: 'pos-recovery-v1', activation: { phase: 1, trackedStockSales: false, retailUiReady: false },
    });
  }

  async function getOrder(companyId, id) {
    if (!companyId) fail('FORBIDDEN', 'Empresa requerida.', 403);
    // A repeatable-read transaction gives a coherent header/lines/payment snapshot.
    return prisma.$transaction((tx) => store.dto(tx, companyId, id), { isolationLevel: 'RepeatableRead' });
  }

  async function listOrders(companyId, filters) {
    if (!companyId) fail('FORBIDDEN', 'Empresa requerida.', 403);
    const where = { companyId, ...(filters.outletId ? { outletId: filters.outletId } : {}), ...(filters.status ? { status: filters.status } : {}) };
    return prisma.$transaction(async (tx) => {
      const [data, total] = await Promise.all([tx.posOrder.findMany({ where, orderBy: [{ openedAt: 'desc' },{ id: 'desc' }],
        skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }), tx.posOrder.count({ where })]);
      return commerceDto({ data: data.map((value) => ({ ...value, historicalCurrencyUnknown: !value.currency,
        netPaidAmount: store.amount(store.decimal(value.paidAmount).minus(value.refundedAmount)),
        remainingAmount: store.amount(['PAID','CANCELLED','REFUNDED'].includes(value.status) ? 0 : store.decimal(value.totalAmount).minus(value.paidAmount).plus(value.refundedAmount)),
        refundStatus: store.decimal(value.refundedAmount).eq(0) ? 'NONE' : (store.decimal(value.refundedAmount).eq(value.paidAmount) ? 'FULL' : 'PARTIAL'),
      })), pagination: { page: filters.page, pageSize: filters.pageSize, total, hasMore: filters.page * filters.pageSize < total } });
    }, { isolationLevel: 'RepeatableRead' });
  }

  async function expectedCash(companyId, sessionId) {
    if (!companyId) fail('FORBIDDEN', 'Empresa requerida.', 403);
    return prisma.$transaction(async (tx) => {
      const value = await store.row(tx, 'posSession', companyId, sessionId);
      if (value.status !== 'OPEN') return { expectedCashAmount: store.amount(value.expectedCashAmount ?? 0), frozen: true };
      return sessions.expectedCash(tx, companyId, value);
    }, { isolationLevel: 'RepeatableRead' });
  }

  return { execute, context, getOrder, listOrders, expectedCash };
}
