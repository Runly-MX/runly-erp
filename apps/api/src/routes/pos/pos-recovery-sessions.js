import { amount, decimal, fail, json, sum } from './pos-contracts.js';

export function createPosRecoverySessions({ commands, store }) {
  async function expectedCash(tx, companyId, value) {
    const [payments, movements] = await Promise.all([
      tx.posPayment.findMany({ where: { companyId, sessionId: value.id, status: 'CAPTURED' }, include: { paymentMethod: true } }),
      tx.posCashMovement.findMany({ where: { companyId, sessionId: value.id } }),
    ]);
    const cashSales = sum(payments.filter((p) => p.paymentMethod.kind === 'CASH'), 'amount');
    const byKind = (kind) => sum(movements.filter((m) => m.kind === kind), 'amount');
    return { expectedCashAmount: amount(decimal(value.openingCashAmount).plus(cashSales).plus(byKind('IN')).minus(byKind('OUT')).plus(byKind('WAITER_DELIVERY')).minus(byKind('REFUND_OUT'))),
      cashSales: amount(cashSales), cashIn: amount(byKind('IN')), cashOut: amount(byKind('OUT')),
      waiterDeliveries: amount(byKind('WAITER_DELIVERY')), refundOut: amount(byKind('REFUND_OUT')) };
  }

  async function openSession(tx, ctx, data) {
    await commands.lock(tx, `terminal:${ctx.companyId}:${data.terminalId}`);
    await store.row(tx, 'posOutlet', ctx.companyId, data.outletId, { enabled: true });
    await store.row(tx, 'posTerminal', ctx.companyId, data.terminalId, { outletId: data.outletId, enabled: true });
    const existing = await tx.posSession.findFirst({ where: { companyId: ctx.companyId, terminalId: data.terminalId, status: 'OPEN' } });
    if (existing) fail('INVALID_TRANSITION', 'La terminal ya tiene una sesión abierta.');
    const settings = await store.settings(tx, ctx.companyId);
    const value = await tx.posSession.create({ data: { ...data, companyId: ctx.companyId, openedById: ctx.actorId, currency: settings.currency } });
    await commands.audit(tx, { ...ctx, entityType: 'PosSession', entityId: value.id, action: 'pos.session.open', after: value });
    return value;
  }

  async function closeSession(tx, ctx, data, { sessionId }) {
    const before = await store.session(tx, ctx.companyId, sessionId);
    const totals = await expectedCash(tx, ctx.companyId, before);
    const closed = await tx.posSession.updateMany({ where: { id: sessionId, companyId: ctx.companyId, status: 'OPEN' }, data: { status: 'CLOSED', closedById: ctx.actorId, closedAt: new Date(),
      countedCashAmount: data.countedCashAmount, expectedCashAmount: totals.expectedCashAmount,
      differenceAmount: amount(decimal(data.countedCashAmount).minus(totals.expectedCashAmount)), notes: data.notes ?? before.notes,
    } });
    if (closed.count !== 1) fail('INVALID_TRANSITION', 'La sesión ya fue cerrada.');
    const value = await store.row(tx, 'posSession', ctx.companyId, sessionId);
    await commands.audit(tx, { ...ctx, entityType: 'PosSession', entityId: sessionId, action: 'pos.session.close', before, after: value, metadata: totals });
    return json({ ...value, ...totals });
  }

  async function cashMovement(tx, ctx, data, { sessionId }) {
    await store.session(tx, ctx.companyId, sessionId);
    const value = await tx.posCashMovement.create({ data: { ...data, companyId: ctx.companyId, sessionId, createdById: ctx.actorId } });
    await commands.audit(tx, { ...ctx, entityType: 'PosCashMovement', entityId: value.id, action: 'pos.cash_movement.create', after: value });
    return value;
  }

  async function openShift(tx, ctx, data) {
    const value = await store.shift(tx, ctx.companyId, ctx.actorId, data.outletId);
    await commands.audit(tx, { ...ctx, entityType: 'PosWaiterShift', entityId: value.id, action: 'pos.waiter_shift.open', after: value });
    return value;
  }

  async function closeShift(tx, ctx, data, { shiftId }) {
    const initial = await store.row(tx, 'posWaiterShift', ctx.companyId, shiftId);
    await store.session(tx, ctx.companyId, data.sessionId, initial.outletId);
    await commands.lock(tx, `shift:${ctx.companyId}:${initial.outletId}:${initial.waiterId}`);
    await tx.$queryRaw`SELECT id FROM pos_waiter_shift WHERE id = ${shiftId}::uuid AND company_id = ${ctx.companyId}::uuid FOR UPDATE`;
    const before = await store.row(tx, 'posWaiterShift', ctx.companyId, shiftId);
    if (before.status !== 'OPEN') fail('INVALID_TRANSITION', 'El turno ya está cerrado.');
    const closed = await tx.posWaiterShift.updateMany({ where: { id: shiftId, companyId: ctx.companyId, status: 'OPEN' }, data: { status: 'CLOSED', closedAt: new Date(),
      deliveredAmount: data.deliveredAmount, deliveredToSessionId: data.sessionId, notes: data.notes ?? before.notes,
    } });
    if (closed.count !== 1) fail('INVALID_TRANSITION', 'El turno ya fue cerrado.');
    const value = await store.row(tx, 'posWaiterShift', ctx.companyId, shiftId);
    await tx.posCashMovement.create({ data: { companyId: ctx.companyId, sessionId: data.sessionId, kind: 'WAITER_DELIVERY',
      amount: data.deliveredAmount, reason: `Entrega de turno ${shiftId}`, createdById: ctx.actorId,
    } });
    await commands.audit(tx, { ...ctx, entityType: 'PosWaiterShift', entityId: shiftId, action: 'pos.waiter_shift.close', before, after: value });
    return value;
  }

  return { expectedCash, openSession, closeSession, cashMovement, openShift, closeShift };
}
