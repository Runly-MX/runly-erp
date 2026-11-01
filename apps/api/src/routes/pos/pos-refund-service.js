import { createPosRefundQuoteService } from './pos-refund-quote-service.js';
import {createPosAllocationsService} from './pos-allocations-service.js';
import { amount, decimal, fail, json, money, sum } from './pos-contracts.js';

export function createPosRefundService({ commands, store }) {
  async function refund(tx, ctx, data, { orderId }) {
    const initial = await store.row(tx, 'posOrder', ctx.companyId, orderId);
    const session = await store.session(tx, ctx.companyId, data.sessionId, initial.outletId);
    const value = await store.order(tx, ctx.companyId, orderId, data.expectedVersion);
    store.knownCurrency(value); store.knownCurrency(session);
    if (session.currency !== value.currency) fail('CURRENCY_MISMATCH', 'La caja de devolución usa otra moneda.');
    if (['CANCELLED','REFUNDED'].includes(value.status)) fail('INVALID_TRANSITION', 'La orden no admite devoluciones.');
    const net = decimal(value.paidAmount).minus(value.refundedAmount);
    const total = sum(data.payments, 'amount');
    if (total.gt(net)) fail('VALIDATION_ERROR', 'La devolución excede los pagos netos.', 400);
    if (new Set(data.payments.map((p) => p.paymentId)).size !== data.payments.length || new Set(data.lines.map((l) => l.orderLineId)).size !== data.lines.length) {
      fail('VALIDATION_ERROR', 'No repitas pagos ni líneas.', 400);
    }
    const closedSale = value.status === 'PAID';
    if (closedSale !== (data.lines.length > 0)) fail('VALIDATION_ERROR', closedSale ? 'Selecciona las líneas a devolver.' : 'La devolución de anticipo no admite líneas.', 400);
    const lineDocuments = await createPosRefundQuoteService({ prisma: tx }).lines(tx, value, data.lines);
    if (closedSale && !sum(lineDocuments, 'amount').eq(total)) fail('VALIDATION_ERROR', 'El importe devuelto no coincide con las líneas.', 400);
    const payments = [];
    let cashOut = decimal(0);
    const captures = await tx.posPayment.findMany({ where: { companyId: ctx.companyId, orderId, status: 'CAPTURED' } });
    if (!sum(captures, 'amount').eq(value.paidAmount)) fail('RECONCILIATION_REQUIRED', 'Los pagos históricos requieren conciliación.');
    for (const input of data.payments) {
      const payment = captures.find((p) => p.id === input.paymentId);
      if (!payment) fail('NOT_FOUND', 'Pago no encontrado en la orden.', 404);
      const previous = await tx.posRefundPayment.findMany({ where: { paymentId: payment.id } });
      if (decimal(input.amount).gt(decimal(payment.amount).minus(sum(previous, 'amount')))) fail('VALIDATION_ERROR', 'El importe excede lo disponible en ese pago.', 400);
      const method = await store.row(tx, 'posPaymentMethod', ctx.companyId, payment.paymentMethodId);
      if (method.kind === 'CASH') cashOut = cashOut.plus(input.amount);
      else if (!input.reference) fail('VALIDATION_ERROR', 'Registra la referencia de devolución externa.', 400);
      payments.push(input);
    }
    await store.lockStockLines(tx, ctx.companyId, lineDocuments.map((d) => d.line));
    const created = await tx.posRefund.create({ data: { companyId: ctx.companyId, orderId, sessionId: session.id,
      amount: amount(total), currency: value.currency, reason: data.reason, createdById: ctx.actorId,
    } });
    for (const document of lineDocuments) {
      const { line, ...fields } = document;
      if (fields.restock) fields.stockRestored = await store.stockReversal(tx, value, line, fields.quantity, created.id, ctx.actorId);
      await tx.posRefundLine.create({ data: { refundId: created.id, orderLineId: line.id, ...fields } });
      await tx.posOrderLine.update({ where: { id: line.id }, data: { returnedQuantity: { increment: fields.quantity } } });
    }
    await tx.posRefundPayment.createMany({ data: payments.map((p) => ({ ...p, refundId: created.id })) });
    const attributionBefore=await tx.posPaymentAllocation.findMany({where:{companyId:ctx.companyId,orderId}});
    await createPosAllocationsService({commands,store}).reduceAfterRefund(tx,value);
    if (cashOut.gt(0)) await tx.posCashMovement.create({ data: { companyId: ctx.companyId, sessionId: session.id,
      kind: 'REFUND_OUT', amount: amount(cashOut), reason: `Devolución ${created.id}`, createdById: ctx.actorId,
    } });
    const refundedAmount = decimal(value.refundedAmount).plus(total);
    await store.advanceOrder(tx, value, { refundedAmount: amount(refundedAmount),
      ...(closedSale && refundedAmount.eq(value.paidAmount) ? { status: 'REFUNDED' } : {}),
    });
    const document = await tx.posRefund.findUnique({ where: { id: created.id }, include: { lines: true, payments: true } });
    const receipt = await store.receipt(tx, value, 'REFUND', { refund: document });
    const after = { refund: json({ ...document, status: 'COMPLETED' }), order: await store.dto(tx, ctx.companyId, orderId), receiptId: receipt.id };
    await commands.audit(tx, { ...ctx, entityType: 'PosRefund', entityId: created.id, action: 'pos.refund.create', before: value, after,
      metadata:{attributionBefore,attributionAfter:await tx.posPaymentAllocation.findMany({where:{companyId:ctx.companyId,orderId}})} });
    return after;
  }
  return { refund };
}
