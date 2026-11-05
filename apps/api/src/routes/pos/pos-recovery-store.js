import { createCatalogCommerceStock } from '../catalog/catalog-commerce-stock.js';
import { createPosReceiptDocuments } from './pos-receipt-documents.js';
import { amount, commerceDto, decimal, fail, json, lineTotals, money, sum } from './pos-contracts.js';

export function createPosRecoveryStore({ commands, prisma }) {
  const ledger = createCatalogCommerceStock({ prisma });
  async function row(tx, model, companyId, id, extra = {}) {
    if(!companyId)fail('FORBIDDEN','Empresa requerida.',403);
    const value = await tx[model].findFirst({ where: { id, companyId, ...extra } });
    if (!value) fail('NOT_FOUND', 'Recurso no encontrado en esta empresa.', 404);
    return value;
  }

  async function order(tx, companyId, id, expectedVersion) {
    await tx.$queryRaw`SELECT id FROM pos_order WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`;
    const value = await row(tx, 'posOrder', companyId, id);
    if (expectedVersion !== undefined && value.version !== expectedVersion) fail('ORDER_VERSION_CONFLICT', 'La orden cambió en otro dispositivo.');
    return value;
  }

  function knownCurrency(value) {
    if (!value.currency || !/^[A-Z]{3}$/.test(value.currency)) fail('CURRENCY_MISMATCH', 'La moneda histórica requiere conciliación explícita.');
  }

  async function editOrder(tx, companyId, id, expectedVersion) {
    const initial=await row(tx,'posOrder',companyId,id);
    await row(tx,'posOutlet',companyId,initial.outletId,{enabled:true});
    // Same lock order as payments/close: container before order.
    if(initial.experience==='RETAIL'){
      if(!initial.sessionId||!initial.terminalId)fail('CONFIGURATION_REQUIRED','La orden histórica no tiene contexto de caja verificable.');
      const container=await session(tx,companyId,initial.sessionId,initial.outletId,initial.terminalId);
      knownCurrency(container);
      if(container.currency!==initial.currency)fail('CURRENCY_MISMATCH','La orden y su sesión usan monedas distintas.');
    }
    return order(tx,companyId,id,expectedVersion);
  }

  function editable(value,{allowSent=false}={}) {
    if (['PAID', 'CANCELLED', 'REFUNDED'].includes(value.status)) fail('INVALID_TRANSITION', 'La orden no admite esta operación.');
    if (decimal(value.paidAmount).minus(value.refundedAmount).gt(0)) fail('REFUND_REQUIRED', 'Devuelve los pagos antes de editar el consumo.');
    if (!allowSent&&['SENT', 'PARTIALLY_SERVED', 'SERVED'].includes(value.status)) fail('INVALID_TRANSITION', 'El consumo enviado requiere anulación de preparación.');
  }

  async function settings(tx, companyId) {
    const value = await tx.posSettings.findUnique({ where: { companyId } });
    if (!value) fail('CONFIGURATION_REQUIRED', 'Configura la moneda y los impuestos del POS.');
    knownCurrency(value);
    return value;
  }

  async function session(tx, companyId, id, outletId, terminalId) {
    await tx.$queryRaw`SELECT id FROM pos_session WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`;
    const value = await row(tx, 'posSession', companyId, id, {
      ...(outletId ? { outletId } : {}), ...(terminalId ? { terminalId } : {}),
    });
    if (value.status !== 'OPEN') fail('INVALID_TRANSITION', 'La sesión de caja está cerrada.');
    const outlet = await row(tx, 'posOutlet', companyId, value.outletId, { enabled: true });
    await row(tx, 'posTerminal', companyId, value.terminalId, { outletId: outlet.id, enabled: true });
    return value;
  }

  async function shift(tx, companyId, actorId, outletId) {
    // Also serializes creation of the first OPEN shift for this operator/outlet.
    await commands.lock(tx, `shift:${companyId}:${outletId}:${actorId}`);
    const outlet = await row(tx, 'posOutlet', companyId, outletId, { enabled: true });
    if (!outlet.allowTableCharge) fail('INVALID_TRANSITION', 'El cobro en mesa no está habilitado.');
    const current = await tx.posWaiterShift.findFirst({ where: { companyId, outletId, waiterId: actorId, status: 'OPEN' } });
    if (!current) return tx.posWaiterShift.create({ data: { companyId, outletId, waiterId: actorId } });
    await tx.$queryRaw`SELECT id FROM pos_waiter_shift WHERE id = ${current.id}::uuid FOR UPDATE`;
    return row(tx, 'posWaiterShift', companyId, current.id, { status: 'OPEN' });
  }

  async function dto(tx, companyId, id) {
    const value = await row(tx, 'posOrder', companyId, id);
    const [lines, guests, payments, receipts, refunds] = await Promise.all([
      tx.posOrderLine.findMany({ where: { orderId: id }, orderBy: { createdAt: 'asc' }, include: { modifiers: true } }),
      tx.posGuestSeat.findMany({ where: { orderId: id }, orderBy: { position: 'asc' } }),
      tx.posPayment.findMany({ where: { orderId: id, companyId }, orderBy: { paidAt: 'asc' } }),
      tx.posReceipt.findMany({ where: { orderId: id, companyId }, orderBy: { createdAt: 'asc' } }),
      tx.posRefund.findMany({ where: { orderId: id, companyId }, include: { lines: true, payments: true } }),
    ]);
    const net = decimal(value.paidAmount).minus(value.refundedAmount);
    const remaining = ['PAID','CANCELLED','REFUNDED'].includes(value.status) ? decimal(0) : decimal(value.totalAmount).minus(net);
    const table = value.tableId ? await tx.posTable.findFirst({ where: { id: value.tableId, companyId } }) : null;
    const waiter = value.waiterId ? await tx.userProfile.findUnique({ where: { id: value.waiterId }, select: { displayName: true } }) : null;
    const dispatches=await tx.posKitchenDispatch.findMany({where:{companyId,orderId:id},orderBy:{sequence:'asc'}});
    return commerceDto({ ...value, lines, guests, payments, refunds, table, dispatches, waiterName: waiter?.displayName ?? null,
      receipts:receipts.map(({id,receiptNumber,kind,createdAt})=>({id,receiptNumber,kind,createdAt})),
      historicalCurrencyUnknown: !value.currency,
      refundedAmount: amount(value.refundedAmount), netPaidAmount: amount(net), remainingAmount: amount(remaining),
      refundStatus: decimal(value.refundedAmount).eq(0) ? 'NONE' : (decimal(value.refundedAmount).eq(value.paidAmount) ? 'FULL' : 'PARTIAL'),
      receiptId: receipts.find((r) => r.kind === 'SALE')?.id ?? null,
    });
  }

  async function recalculate(tx, value) {
    const lines = await tx.posOrderLine.findMany({ where: { orderId: value.id, voided: false } });
    const total = sum(lines, 'totalAmount');
    const tax = sum(lines, 'taxAmount');
    await advanceOrder(tx, value, {
      subtotalAmount: amount(total.minus(tax)), taxAmount: amount(tax), totalAmount: amount(total),
      discountAmount: amount(sum(lines, 'discountAmount')),
    });
  }

  async function advanceOrder(tx, before, data) {
    // Keep the existing payment CAS as a second defense beside the row lock;
    // also compare version/status so edits cannot invalidate the quoted total.
    const result = await tx.posOrder.updateMany({ where: { id: before.id, companyId: before.companyId,
      version: before.version, paidAmount: before.paidAmount, status: before.status,
    }, data: { ...data, version: { increment: 1 } } });
    if (result.count !== 1) fail('ORDER_VERSION_CONFLICT', 'La orden cambió en otro dispositivo.');
  }

  async function receipt(tx, value, kind, extra = {}) {
    // Shared across all orders; locked last, after containers/orders. No caller
    // may hold this counter and then request an order or container lock.
    await commands.lock(tx, `receipt:${value.companyId}`);
    const last = await tx.posReceipt.findFirst({ where: { companyId: value.companyId }, orderBy: { receiptNumber: 'desc' } });
    return tx.posReceipt.create({ data: { companyId: value.companyId, orderId: value.id,
      receiptNumber: (last?.receiptNumber ?? 0) + 1, kind, printedCount: 0,
      payload: await createPosReceiptDocuments().snapshot(tx,await dto(tx,value.companyId,value.id),kind,(last?.receiptNumber??0)+1,extra),
    } });
  }

  async function releaseTable(tx, value, status) {
    if (!value.tableId) return;
    await tx.$queryRaw`SELECT id FROM pos_table WHERE id = ${value.tableId}::uuid AND company_id = ${value.companyId}::uuid FOR UPDATE`;
    const other = await tx.posOrder.count({ where: { companyId: value.companyId, tableId: value.tableId,
      id: { not: value.id }, status: { notIn: ['PAID','CANCELLED','REFUNDED'] } } });
    if (!other) await tx.posTable.updateMany({ where: { id: value.tableId, companyId: value.companyId }, data: { status,waiterId:null,version:{increment:1} } });
  }

  async function assertAvailable(tx, companyId, productId, variantId, outletId) {
    const parent = await tx.posProductConfig.findFirst({ where: { companyId, productId, variantId: null } });
    const variant = variantId ? await tx.posProductConfig.findFirst({ where: { companyId, productId, variantId } }) : null;
    const product = await row(tx, 'catalogProduct', companyId, productId);
    const policy = outletId ? await tx.catalogPosAvailability.findFirst({ where: { companyId, productId, outletId } }) : null;
    if (!(policy?.enabled ?? (product.posEnabled && parent?.availableInPos !== false)) || variant?.availableInPos === false) fail('NOT_AVAILABLE_AT_OUTLET', 'El producto no esta disponible en esta sucursal.');
  }

  async function stockGate(tx, value) {
    const all = await tx.posOrderLine.findMany({ where: { orderId: value.id, voided: false } });
    // "Venta rápida" lines carry no product and no stock.
    const lines = all.filter((line) => !line.customItem);
    for (const line of lines) {
      if (!line.productId) fail('STOCK_RECOVERY_NOT_READY', 'El artículo histórico requiere conciliación comercial.');
      const product = await row(tx, 'catalogProduct', value.companyId, line.productId, { enabled: true });
      if (product.currency !== value.currency) fail('CURRENCY_MISMATCH', 'La moneda del producto cambió; revisa la orden.');
      if (line.variantId) await row(tx, 'catalogProductVariant', value.companyId, line.variantId, { productId: product.id, enabled: true });
      if (product.productType === 'VARIABLE' && !line.variantId) fail('VARIANT_REQUIRED', 'Selecciona una variante para vender.');
      await assertAvailable(tx, value.companyId, product.id, line.variantId, value.outletId);

    }
    if (!all.length) fail('INVALID_TRANSITION', 'No se puede cobrar una orden sin consumo.');
    await ledger.checkOrder(tx, value, lines);
  }

  async function stockReversal(tx, value, line, qty, refundId, actorId) {
    return ledger.reverse(tx, value, line, qty, refundId, actorId);
  }


  return { row, order, editOrder, knownCurrency, editable, settings, session, shift, dto, recalculate, advanceOrder, receipt, releaseTable, assertAvailable, stockGate, stockReversal, stockSale: ledger.sale, lockStockLines: ledger.lockItems,
    amount, decimal, money, sum, lineTotals };
}
