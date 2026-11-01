import { fail, json } from '../pos/pos-contracts.js';
import { createPosCommandService } from '../pos/pos-command-service.js';

export function createCatalogWriteService({ prisma }) {
  const commands = createPosCommandService({ prisma });
  async function create(ctx, operation, input, key, execute) {
    return commands.run({ ...ctx, operation, input, key, serialize: json, execute: async (tx) => {
      const row = await execute(tx);
      await commands.audit(tx, { ...ctx, moduleKey: 'runly.catalog', action: operation,
        entityType: operation.includes('variant') ? 'CatalogProductVariant' : 'CatalogProduct', entityId: row.id, after: row });
      return row;
    } });
  }

  async function patchTx(tx, ctx, { variantId, productId, data, expectedVersion, clientUpdatedAt }, execute) {
      const rows = variantId
        ? await tx.$queryRaw`SELECT * FROM catalog_product_variant WHERE id=${variantId}::uuid AND product_id=${productId}::uuid AND company_id=${ctx.companyId}::uuid AND enabled=true FOR UPDATE`
        : await tx.$queryRaw`SELECT * FROM catalog_product WHERE id=${productId}::uuid AND company_id=${ctx.companyId}::uuid AND enabled=true FOR UPDATE`;
      const before = rows[0];
      if (!before) fail('NOT_FOUND', 'Registro no encontrado en esta empresa.', 404);
      if (Object.keys(data).length) {
        if (expectedVersion == null && clientUpdatedAt == null) fail('PRECONDITION_REQUIRED', 'Vuelve a leer el registro y envía su revisión esperada.', 428);
        if ((expectedVersion != null && before.revision !== expectedVersion) ||
          (clientUpdatedAt != null && before.updated_at.toISOString() !== clientUpdatedAt)) {
          fail('CATALOG_VERSION_CONFLICT', 'Alguien cambió este registro. Recarga antes de guardar.');
        }
      }
      const row = await execute(tx);
      if (Object.keys(data).length) await commands.audit(tx, { ...ctx, moduleKey: 'runly.catalog', action: variantId ? 'catalog.variant.update' : 'catalog.product.update',
        entityType: variantId ? 'CatalogProductVariant' : 'CatalogProduct', entityId: row.id, before, after: row });
      return json(row);
  }
  async function patch(ctx, input, execute) {
    return prisma.$transaction((tx) => patchTx(tx, ctx, input, execute));
  }
  return { create, patch, patchTx };
}
