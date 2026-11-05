import { fail, json } from '../pos/pos-contracts.js';
import { createPosCommandService } from '../pos/pos-command-service.js';

export function createCatalogCommerceStock({ prisma }) {
  const commands = createPosCommandService({ prisma });

  async function item(tx, companyId, productId, variantId, sellable = true) {
    const product = await tx.catalogProduct.findFirst({ where: { id: productId, companyId } });
    if (!product) fail('NOT_FOUND', 'Producto no encontrado.', 404);
    const variant = variantId ? await tx.catalogProductVariant.findFirst({ where: { id: variantId, productId, companyId } }) : null;
    if (variantId && !variant) fail('NOT_FOUND', 'Variante no encontrada en este producto.', 404);
    if (sellable && product.productType === 'VARIABLE' && !variant) fail('VARIANT_REQUIRED', 'Selecciona una variante.');
    return { product, variant, aggregate: variant?.stock ?? product.stock };
  }

  async function outlet(tx, companyId, outletId) {
    if (!outletId) return;
    if (!await tx.posOutlet.findFirst({ where: { id: outletId, companyId, enabled: true } })) fail('NOT_FOUND', 'Sucursal no encontrada.', 404);
  }

  async function lockItems(tx, companyId, lines) {
    const keys = [...new Set(lines.map((l) => `${l.productId}:${l.variantId ?? 'base'}`))].sort();
    for (const key of keys) await commands.lock(tx, `catalog:item:${companyId}:${key}`);
  }

  async function balance(tx, companyId, productId, variantId, outletId, create = false) {
    const where = { companyId, productId, variantId: variantId ?? null, outletId: outletId ?? null };
    const existing = await tx.catalogStockBalance.findFirst({ where });
    if (existing || !create) return existing;
    return tx.catalogStockBalance.create({ data: { ...where, scope: outletId ? 'OUTLET' : 'LEGACY_UNALLOCATED', quantity: 0 } });
  }

  async function reconcile(tx, companyId, productId, variantId) {
    const { aggregate } = await item(tx, companyId, productId, variantId, false);
    const totals = await tx.catalogStockBalance.aggregate({ where: { companyId, productId, variantId: variantId ?? null }, _sum: { quantity: true } });
    if (totals._sum.quantity !== aggregate) fail('RECONCILIATION_REQUIRED', 'El saldo agregado no coincide con sus ubicaciones.');
  }

  async function move(tx, { companyId, actorId, productId, variantId, outletId, delta, operationKey, sourceType, sourceId, sourceLineId, reversalOfId, reason, note }) {
    const existing = await tx.catalogStockMovement.findFirst({ where: { companyId, operationKey } });
    if (existing) return existing;
    const current = await balance(tx, companyId, productId, variantId, outletId, true);
    const next = current.quantity + delta;
    if (next < 0 && !(outletId == null && sourceType === 'MANUAL_ADJUSTMENT' && delta > 0)) fail('INSUFFICIENT_STOCK', 'No hay existencias suficientes en esta ubicación.');
    if (!Number.isSafeInteger(next) || next > 2147483647) fail('VALIDATION_ERROR', 'Cantidad fuera de rango.', 400);
    const {aggregate} = await item(tx, companyId, productId, variantId, false);
    if (aggregate + delta > 2147483647 || aggregate + delta < -2147483648) fail('VALIDATION_ERROR', 'Saldo agregado fuera de rango.', 400);
    await tx.catalogStockBalance.update({ where: { id: current.id }, data: { quantity: next, updatedAt: new Date() } });
    return tx.catalogStockMovement.create({ data: { companyId, productId, variantId: variantId ?? null, outletId: outletId ?? null,
      quantityDelta: delta, operationKey, sourceType, sourceId, sourceLineId, reversalOfId, reason, note, userId: actorId, balanceApplied: true } });
  }

  async function quantities(tx, companyId, productId, variantId, outletId) {
    const rows = await tx.catalogStockBalance.findMany({ where: { companyId, productId, variantId: variantId ?? null } });
    return { stock: rows.find((b) => b.outletId === outletId)?.quantity ?? 0,
      unallocatedStock: rows.find((b) => b.outletId === null)?.quantity ?? 0 };
  }

  async function checkOrder(tx, value, lines) {
    await lockItems(tx, value.companyId, lines);
    const totals = new Map();
    for (const line of lines) {
      const { product } = await item(tx, value.companyId, line.productId, line.variantId);
      if (!product.trackStock) continue;
      if (!Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0) fail('VALIDATION_ERROR', 'El artículo controlado requiere unidades enteras positivas.', 400);
      const key = `${line.productId}:${line.variantId ?? 'base'}`;
      const total = (totals.get(key)?.quantity ?? 0) + Number(line.quantity);
      totals.set(key, { ...line, quantity: total });
    }
    for (const line of totals.values()) {
      await reconcile(tx, value.companyId, line.productId, line.variantId);
      const current = await balance(tx, value.companyId, line.productId, line.variantId, value.outletId);
      if ((current?.quantity ?? 0) < line.quantity) fail('INSUFFICIENT_STOCK', 'No hay existencias suficientes en esta sucursal.');
    }
  }

  async function sale(tx, value, actorId) {
    const lines = await tx.posOrderLine.findMany({ where: { orderId: value.id, voided: false, customItem: false }, orderBy: [{ productId: 'asc' }, { variantId: 'asc' }, { id: 'asc' }] });
    await checkOrder(tx, value, lines);
    for (const line of lines) {
      const { product } = await item(tx, value.companyId, line.productId, line.variantId);
      if (!product.trackStock) continue;
      await move(tx, { companyId: value.companyId, actorId, productId: line.productId, variantId: line.variantId,
        outletId: value.outletId, delta: -Number(line.quantity), operationKey: `sale:${value.id}:${line.id}`,
        sourceType: 'POS_SALE', sourceId: value.id, sourceLineId: line.id, reason: `Venta POS #${value.orderNumber}` });
    }
  }

  async function reverse(tx, value, line, quantity, refundId, actorId) {
    const original = await tx.catalogStockMovement.findFirst({ where: { companyId: value.companyId, sourceType: 'POS_SALE', sourceId: value.id, sourceLineId: line.id } });
    if (!original) return false;
    if (!original.balanceApplied || original.outletId !== value.outletId || original.quantityDelta >= 0) fail('RECONCILIATION_REQUIRED', 'La salida histórica requiere conciliación antes de reponer.');
    if (!Number.isInteger(Number(quantity))) fail('VALIDATION_ERROR', 'Sólo se reponen unidades enteras controladas.', 400);
    await lockItems(tx, value.companyId, [line]);
    await reconcile(tx, value.companyId, line.productId, line.variantId);
    const previous = await tx.catalogStockMovement.aggregate({ where: { companyId: value.companyId, reversalOfId: original.id }, _sum: { quantityDelta: true } });
    const operationKey = `refund:${refundId}:${line.id}`;
    if (await tx.catalogStockMovement.findFirst({ where: { companyId: value.companyId, operationKey } })) return true;
    if ((previous._sum.quantityDelta ?? 0) + Number(quantity) > -original.quantityDelta) fail('INVALID_TRANSITION', 'La reposición excede la salida original.');
    await move(tx, { companyId: value.companyId, actorId, productId: line.productId, variantId: line.variantId, outletId: original.outletId,
      delta: Number(quantity), operationKey, sourceType: 'POS_REFUND', sourceId: refundId, sourceLineId: line.id, reversalOfId: original.id, reason: 'Devolución POS' });
    return true;
  }

  async function balances(companyId, productId, variantId, outletId) {
    if (!companyId) fail('FORBIDDEN', 'Empresa requerida.', 403);
    await item(prisma, companyId, productId, variantId, false); await outlet(prisma, companyId, outletId);
    const rows=await prisma.catalogStockBalance.findMany({ where: { companyId, productId, ...(variantId ? { variantId } : {}), ...(outletId ? { outletId } : {}) }, orderBy: [{ scope: 'asc' }, { id: 'asc' }] });
    const outlets=await prisma.posOutlet.findMany({where:{companyId}});
    return rows.map((b)=>({...b,outletName:b.outletId?outlets.find((o)=>o.id===b.outletId)?.name??null:'Sin asignar'}));
  }

  async function write(ctx, productId, input, key, allocation = false) {
    return commands.run({ ...ctx, operation: allocation ? 'catalog.allocate' : 'catalog.adjust', key,
      input: { productId, ...input }, serialize: json, execute: async (tx) => {
        await item(tx, ctx.companyId, productId, input.variantId, allocation || input.outletId !== null); await outlet(tx, ctx.companyId, input.outletId);
        await lockItems(tx, ctx.companyId, [{ productId, variantId: input.variantId }]);
        await reconcile(tx, ctx.companyId, productId, input.variantId);
        const fields = { ...ctx, productId, variantId: input.variantId, outletId: input.outletId, sourceId: productId, reason: input.reason, note: input.note };
        const movements = [];
        if (allocation) movements.push(await move(tx, { ...fields, outletId: null, delta: -input.quantity, operationKey: `allocate:${key}:from`, sourceType: 'LEGACY_ALLOCATION' }));
        movements.push(await move(tx, { ...fields, delta: allocation ? input.quantity : input.quantityDelta,
          operationKey: `${allocation ? 'allocate' : 'adjust'}:${key}:to`, sourceType: allocation ? 'LEGACY_ALLOCATION' : 'MANUAL_ADJUSTMENT' }));
        await commands.audit(tx, { ...ctx, moduleKey: 'runly.catalog', entityType: 'CatalogStockMovement', entityId: movements.at(-1).id,
          action: allocation ? 'catalog.stock.allocate' : 'catalog.stock.adjust', after: movements });
        return { movements, balances: await tx.catalogStockBalance.findMany({ where: { companyId: ctx.companyId, productId, variantId: input.variantId ?? null } }) };
      } });
  }

  return { item, outlet, lockItems, quantities, checkOrder, sale, reverse, balances, write };
}
