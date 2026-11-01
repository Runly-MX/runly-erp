import { createCatalogSellablesService } from '../catalog/catalog-sellables-service.js';
import { fail, json } from './pos-contracts.js';
import { createPosScopeService } from './pos-scope-service.js';
import { createPosModifierService } from './pos-modifier-service.js';

export function createPosRecoveryOrders({ commands, store }) {
  async function createOrder(tx, ctx, data) {
    const { companyId, actorId } = ctx;
    const outlet = await store.row(tx, 'posOutlet', companyId, data.outletId, { enabled: true });
    if (outlet.mode !== 'HYBRID' && outlet.mode !== data.experience) fail('INVALID_TRANSITION', 'La experiencia no corresponde al modo de la sucursal.');
    if (data.experience === 'RETAIL' && (data.fulfillmentType !== 'TAKEAWAY' || data.tableId)) fail('VALIDATION_ERROR', 'Tienda requiere TAKEAWAY sin mesa.', 400);
    if(data.experience==='RETAIL' && (data.guestCount!==undefined || !data.terminalId || !data.sessionId))fail('VALIDATION_ERROR','Tienda requiere sucursal, terminal y sesión explícitas, sin comensales.',400);
    const session = data.sessionId ? await store.session(tx, companyId, data.sessionId, outlet.id, data.terminalId) : null;
    await createPosScopeService({ prisma: tx }).order(companyId, data);
    if (data.terminalId) await store.row(tx, 'posTerminal', companyId, data.terminalId, { outletId: outlet.id, enabled: true });
    const settings = await store.settings(tx, companyId);
    if(session){store.knownCurrency(session);if(session.currency!==settings.currency)fail('CURRENCY_MISMATCH','La sesión abierta y la configuración comercial usan monedas distintas.');}
    await commands.lock(tx, `order-number:${companyId}`);
    const last = await tx.posOrder.findFirst({ where: { companyId }, orderBy: { orderNumber: 'desc' } });
    const value = await tx.posOrder.create({ data: { companyId, outletId: outlet.id,
      terminalId: data.terminalId ?? session?.terminalId ?? null, sessionId: data.sessionId ?? null, tableId: data.tableId ?? null,
      orderNumber: (last?.orderNumber ?? 0) + 1, status: 'OPEN', currency: settings.currency, experience: data.experience,
      taxSnapshot: json({ rate: settings.defaultTaxRate, included: settings.pricesIncludeTax }), stockStatus: 'NOT_APPLIED',
      fulfillmentType: data.fulfillmentType, salesChannel: 'IN_STORE', guestCount: data.experience === 'RETAIL' ? 0 : (data.guestCount ?? 1),
      notes: data.notes, createdById: actorId, waiterId: data.experience==='RETAIL'?null:actorId,
    } });
    if (data.experience === 'RESTAURANT' && data.fulfillmentType === 'DINE_IN') {
      await tx.posGuestSeat.createMany({ data: Array.from({ length: data.guestCount ?? 1 }, (_, i) => ({ orderId: value.id, label: `Comensal ${i + 1}`, position: i + 1 })) });
    }
    if (data.tableId) await tx.posTable.update({ where: { id: data.tableId }, data: { status: 'OCCUPIED', waiterId: actorId } });
    const after = await store.dto(tx, companyId, value.id);
    await commands.audit(tx, { ...ctx, entityType: 'PosOrder', entityId: value.id, action: 'pos.order.create', after });
    return after;
  }

  async function addLine(tx, ctx, data, { orderId }) {
    const value = await store.editOrder(tx, ctx.companyId, orderId, data.expectedVersion);
    if(value.experience==='RETAIL'&&data.guestSeatId)fail('VALIDATION_ERROR','Tienda no utiliza asientos.',400);
    store.editable(value); store.knownCurrency(value);
    const product = await store.row(tx, 'catalogProduct', ctx.companyId, data.productId, { enabled: true });
    if (product.currency !== value.currency) fail('CURRENCY_MISMATCH', 'El producto usa otra moneda.');
    if (product.productType === 'VARIABLE' && !data.variantId) fail('VARIANT_REQUIRED', 'Selecciona una variante.');
    const variant = data.variantId ? await store.row(tx, 'catalogProductVariant', ctx.companyId, data.variantId, { productId: product.id, enabled: true }) : null;
    await store.assertAvailable(tx, ctx.companyId, product.id, variant?.id, value.outletId);
    if (product.trackStock && !store.decimal(data.quantity).isInteger()) fail('VALIDATION_ERROR', 'El artículo controlado requiere unidades enteras.', 400);
    await createPosScopeService({ prisma: tx }).guest(ctx.companyId, orderId, data.guestSeatId);
    const optionIds = (data.modifiers ?? []).map((m) => m.optionId);
    if (new Set(optionIds).size !== optionIds.length) fail('VALIDATION_ERROR', 'No repitas modificadores.', 400);
    const selection = await createPosModifierService({ prisma: tx }).resolveSelection({ companyId: ctx.companyId, productId: product.id, optionIds });
    const commercial = await createCatalogSellablesService({ prisma: tx }).snapshot(tx, value, product, variant);
    const baseUnitPrice = commercial.price;
    const unitPrice = store.amount(store.decimal(baseUnitPrice).plus(store.sum(selection.snapshots, 'priceDelta')));
    const taxRate = commercial.tax.rate;
    if (taxRate === undefined) fail('CURRENCY_MISMATCH', 'La política fiscal histórica requiere conciliación.');
    const totals = store.lineTotals({ quantity: data.quantity, unitPrice, taxRate, taxIncluded: commercial.tax.included });
    const line = await tx.posOrderLine.create({ data: {
      orderId, productId: product.id, variantId: variant?.id ?? null, productName: product.name,
      sku: variant?.sku ?? product.sku, variantLabel:commercial.variantLabel, guestSeatId: data.guestSeatId, quantity: data.quantity,
      baseUnitPrice, unitPrice, priceVersion: commercial.priceVersion, taxIncluded: commercial.tax.included,
      taxRate, taxAmount: totals.taxAmount, totalAmount: totals.totalAmount, note: data.note,
    } });
    if (selection.snapshots.length) await tx.posOrderLineModifier.createMany({ data: selection.snapshots.map((s) => ({ ...s, lineId: line.id, companyId: ctx.companyId })) });
    await store.recalculate(tx, value);
    const after = await store.dto(tx, ctx.companyId, orderId);
    await commands.audit(tx, { ...ctx, entityType: 'PosOrderLine', entityId: line.id, action: 'pos.order_line.create', after });
    return after;
  }

  async function changeLine(tx, ctx, data, { orderId, lineId }, mode) {
    const value = await store.editOrder(tx, ctx.companyId, orderId, data.expectedVersion);
    if(value.experience==='RETAIL'&&data.guestSeatId)fail('VALIDATION_ERROR','Tienda no utiliza asientos.',400);
    store.editable(value); store.knownCurrency(value);
    const before = await tx.posOrderLine.findFirst({ where: { id: lineId, orderId, voided: false } });
    if (!before) fail('NOT_FOUND', 'Línea no encontrada.', 404);
    await createPosScopeService({ prisma: tx }).guest(ctx.companyId, orderId, data.guestSeatId);
    if (data.quantity && before.productId) {
      const product = await store.row(tx, 'catalogProduct', ctx.companyId, before.productId);
      if (product.trackStock && !store.decimal(data.quantity).isInteger()) fail('VALIDATION_ERROR', 'El artículo controlado requiere unidades enteras.', 400);
    }
    const quantity = data.quantity ?? before.quantity;
    const discountAmount = mode === 'discount' ? data.amount : before.discountAmount;
    const totals = store.lineTotals({ ...before, quantity, discountAmount });
    await tx.posOrderLine.update({ where: { id: lineId }, data: mode === 'delete' ? { voided: true, taxAmount: 0, totalAmount: 0 } : {
      quantity, discountAmount, taxAmount: totals.taxAmount, totalAmount: totals.totalAmount,
      ...(data.guestSeatId !== undefined ? { guestSeatId: data.guestSeatId } : {}), ...(data.note !== undefined ? { note: data.note } : {}),
    } });
    await store.recalculate(tx, value);
    const after = await store.dto(tx, ctx.companyId, orderId);
    await commands.audit(tx, { ...ctx, entityType: 'PosOrderLine', entityId: lineId, action: `pos.order_line.${mode}`,
      before, after, metadata: { reason: data.reason ?? null } });
    return after;
  }

  async function cancel(tx, ctx, data, { orderId }) {
    const value = await store.order(tx, ctx.companyId, orderId, data.expectedVersion);
    if (['PAID','CANCELLED','REFUNDED'].includes(value.status)) fail('INVALID_TRANSITION', 'La orden no se puede cancelar.');
    // Also inspect captured documents: do not trust a possibly drifted old cached balance.
    const captures = await tx.posPayment.findMany({ where: { companyId: ctx.companyId, orderId, status: 'CAPTURED' } });
    if (store.decimal(value.paidAmount).minus(value.refundedAmount).gt(0) || store.sum(captures, 'amount').minus(value.refundedAmount).gt(0)) {
      fail('REFUND_REQUIRED', 'Tiene pagos aplicados: devuelve el anticipo antes de cancelar.');
    }
    await store.advanceOrder(tx, value, { status: 'CANCELLED', cancelledAt: new Date() });
    await tx.posKitchenTicketLine.updateMany({ where: { ticket: { orderId, companyId: ctx.companyId }, status: { not: 'DELIVERED' } }, data: { status: 'CANCELLED' } });
    await tx.posKitchenTicket.updateMany({ where: { orderId, companyId: ctx.companyId, status: { not: 'DELIVERED' } }, data: { status: 'CANCELLED' } });
    await store.releaseTable(tx, value, 'AVAILABLE');
    const after = await store.dto(tx, ctx.companyId, orderId);
    await commands.audit(tx, { ...ctx, entityType: 'PosOrder', entityId: orderId, action: 'pos.order.cancel', before: value, after, metadata: { reason: data.reason } });
    return after;
  }

  return { createOrder, addLine, updateLine: (tx,c,d,p) => changeLine(tx,c,d,p,'update'),
    deleteLine: (tx,c,d,p) => changeLine(tx,c,d,p,'delete'), discount: (tx,c,d,p) => changeLine(tx,c,d,p,'discount'), cancel };
}
