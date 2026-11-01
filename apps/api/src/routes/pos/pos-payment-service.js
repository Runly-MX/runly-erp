import { amount, decimal, fail, json, money, sum } from './pos-contracts.js';

export function createPosPaymentService({ commands, store }) {
  async function payment(tx, ctx, data, { orderId }) {
    const initial = await store.row(tx, 'posOrder', ctx.companyId, orderId);
    const container = data.sessionId
      ? await store.session(tx, ctx.companyId, data.sessionId, initial.outletId, initial.terminalId)
      : await store.shift(tx, ctx.companyId, ctx.actorId, initial.outletId);
    const value = await store.order(tx, ctx.companyId, orderId, data.expectedVersion);
    store.knownCurrency(value);
    if (data.sessionId) {
      store.knownCurrency(container);
      if (container.currency !== value.currency) fail('CURRENCY_MISMATCH', 'La caja y la orden usan monedas diferentes.');
    }
    if (['PAID','CANCELLED','REFUNDED'].includes(value.status)) fail('INVALID_TRANSITION', 'La orden no admite pagos.');
    if (data.allocations.length) fail('CONTRACT_NOT_AVAILABLE', 'La atribución por cuenta corresponde a fase 4.');
    const method = await store.row(tx, 'posPaymentMethod', ctx.companyId, data.paymentMethodId, { enabled: true });
    if (!['CASH','CARD','TRANSFER'].includes(method.kind)) fail('VALIDATION_ERROR', 'Método de pago no admitido.', 400);
    if (method.requiresReference && !data.reference) fail('VALIDATION_ERROR', 'El método requiere referencia.', 400);
    const applied = money(data.amount);
    const remaining = decimal(value.totalAmount).minus(value.paidAmount).plus(value.refundedAmount);
    if (applied.gt(remaining)) fail('VALIDATION_ERROR', 'El pago excede el saldo pendiente.', 400);
    const captured = await tx.posPayment.findMany({ where: { companyId: ctx.companyId, orderId, status: 'CAPTURED' } });
    if (!sum(captured, 'amount').eq(value.paidAmount)) fail('RECONCILIATION_REQUIRED', 'El saldo histórico no coincide con sus pagos.');
    const cash = method.kind === 'CASH';
    if (!cash && data.tenderedAmount !== undefined) fail('VALIDATION_ERROR', 'Este método no admite efectivo recibido.', 400);
    const tendered = cash ? money(data.tenderedAmount ?? data.amount) : null;
    if (tendered?.lt(applied)) fail('VALIDATION_ERROR', 'El efectivo recibido es menor al pago aplicado.', 400);
    // No capture, including an advance, may bypass the branch-stock gate.
    await store.stockGate(tx, value);
    const paidAmount = decimal(value.paidAmount).plus(applied);
    const fullyPaid = paidAmount.minus(value.refundedAmount).eq(value.totalAmount);
    if (fullyPaid) await store.stockSale(tx, value, ctx.actorId);
    const created = await tx.posPayment.create({ data: { companyId: ctx.companyId, orderId, paymentMethodId: method.id,
      amount: amount(applied), tenderedAmount: tendered ? amount(tendered) : null,
      changeAmount: tendered ? amount(tendered.minus(applied)) : null, reference: data.reference,
      sessionId: data.sessionId ?? null, waiterShiftId: data.sessionId ? null : container.id,
      status: 'CAPTURED', createdById: ctx.actorId,
    } });
    if (!data.sessionId && cash) await tx.posWaiterShift.update({ where: { id: container.id }, data: { expectedCashAmount: { increment: amount(applied) } } });
    await store.advanceOrder(tx, value, { paidAmount: amount(paidAmount),
      ...(fullyPaid ? { status: 'PAID', paidAt: new Date(), stockStatus: 'APPLIED' } : {}),
    });
    if (fullyPaid) await store.releaseTable(tx, value, 'DIRTY');
    const receipt = fullyPaid ? await store.receipt(tx, value, 'SALE') : null;
    const order = await store.dto(tx, ctx.companyId, orderId);
    const result = { payment: json({ ...created, currency: value.currency }), order, receiptId: receipt?.id ?? null };
    await commands.audit(tx, { ...ctx, entityType: 'PosPayment', entityId: created.id, action: 'pos.payment.create', before: value, after: result });
    return result;
  }

  return { payment };
}
