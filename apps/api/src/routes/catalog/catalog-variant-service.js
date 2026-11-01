import { fail } from '../pos/pos-contracts.js';
// apps/api/src/routes/catalog/catalog-variant-service.js

export function createCatalogVariantService({ prisma }) {
  async function assertAsset(companyId, assetId) {
    if (!assetId) return;
    const rows=await prisma.$queryRaw`SELECT id FROM file_asset WHERE id=${assetId}::uuid AND entity_id=${companyId}::uuid AND enabled=true`;
    if (!rows[0]) fail('NOT_FOUND','Imagen no encontrada en esta empresa.',404);
  }
  async function assertProduct(db, companyId, productId) {
    const rows=await db.$queryRaw`SELECT id FROM catalog_product WHERE id=${productId}::uuid AND company_id=${companyId}::uuid`;
    if(!rows[0])fail('NOT_FOUND','Producto no encontrado.',404);
  }
  async function assertChild(db,table,companyId,childId,productId) {
    const rows=await db.$queryRawUnsafe(`SELECT id,product_id FROM ${table} WHERE id=$1::uuid AND company_id=$2::uuid`,childId,companyId);
    if(!rows[0] || (productId && String(rows[0].product_id)!==String(productId)))fail('NOT_FOUND','Recurso no encontrado en este producto.',404);
    return rows[0];
  }


  async function listOptions({ companyId, productId }) {
    await assertProduct(prisma,companyId,productId);
    const options = await prisma.$queryRaw`
      SELECT o.id, o.name, o.position
      FROM catalog_product_option o
      WHERE o.product_id = ${productId}::uuid AND o.company_id = ${companyId}::uuid
      ORDER BY o.position ASC, o.name ASC
    `
    const values = await prisma.$queryRaw`
      SELECT v.id, v.option_id, v.value, v.position
      FROM catalog_product_option_value v
      JOIN catalog_product_option o ON o.id = v.option_id
      WHERE o.product_id = ${productId}::uuid AND o.company_id = ${companyId}::uuid
      ORDER BY v.position ASC
    `
    return options.map(o => ({
      ...o,
      values: values.filter(v => String(v.option_id) === String(o.id)),
    }))
  }

  async function createOption({ companyId, productId, data }) {
    await assertProduct(prisma,companyId,productId);
    return prisma.$transaction(async (tx) => {
      const [option] = await tx.$queryRaw`
        INSERT INTO catalog_product_option (company_id, product_id, name, position)
        VALUES (${companyId}::uuid, ${productId}::uuid, ${data.name}, ${data.position ?? 0})
        RETURNING *
      `
      const vals = []
      for (const [i, val] of (data.values ?? []).entries()) {
        const [row] = await tx.$queryRaw`
          INSERT INTO catalog_product_option_value (company_id, option_id, value, position)
          VALUES (${companyId}::uuid, ${option.id}::uuid, ${val}, ${i})
          RETURNING *
        `
        vals.push(row)
      }
      return { ...option, values: vals }
    })
  }

  async function updateOption({ companyId, optionId, productId, data }) {
    await assertChild(prisma,"catalog_product_option",companyId,optionId,productId);
    return prisma.$transaction(async (tx) => {
      if (data.name !== undefined || data.position !== undefined) {
        const map = { name: data.name, position: data.position }
        const entries = Object.entries(map).filter(([, v]) => v !== undefined)
        if (entries.length) {
          const setParts = entries.map(([k], i) => `${k} = $${i + 2}`).join(', ')
          const values   = entries.map(([, v]) => v)
          const sql = `UPDATE catalog_product_option SET ${setParts}, updated_at = now()
                       WHERE id = $1::uuid AND company_id = $${values.length + 2}::uuid RETURNING *`
          await tx.$queryRawUnsafe(sql, optionId, ...values, companyId)
        }
      }
      if (data.values !== undefined) {
        await tx.$queryRaw`
          DELETE FROM catalog_product_option_value WHERE option_id = ${optionId}::uuid
        `
        for (const [i, val] of data.values.entries()) {
          await tx.$queryRaw`
            INSERT INTO catalog_product_option_value (company_id, option_id, value, position)
            VALUES (${companyId}::uuid, ${optionId}::uuid, ${val}, ${i})
          `
        }
      }
      const [updated] = await tx.$queryRaw`
        SELECT * FROM catalog_product_option WHERE id = ${optionId}::uuid AND company_id=${companyId}::uuid LIMIT 1
      `
      if (!updated) return null
      const values = await tx.$queryRaw`
        SELECT * FROM catalog_product_option_value WHERE option_id = ${optionId}::uuid ORDER BY position ASC
      `
      return { ...updated, values }
    })
  }

  async function deleteOption({ companyId, optionId, productId }) {
    await assertChild(prisma,"catalog_product_option",companyId,optionId,productId);
    await prisma.$queryRaw`
      DELETE FROM catalog_product_option
      WHERE id = ${optionId}::uuid AND company_id = ${companyId}::uuid
    `
  }

  async function listVariants({ companyId, productId }) {
    await assertProduct(prisma,companyId,productId);
    return prisma.$queryRaw`
      SELECT v.*, CASE WHEN v.price_inherited THEN p.price ELSE v.price END AS price
      FROM catalog_product_variant v JOIN catalog_product p ON p.id=v.product_id AND p.company_id=v.company_id
      WHERE v.product_id = ${productId}::uuid AND v.company_id = ${companyId}::uuid AND v.enabled = true
      ORDER BY v.created_at ASC
    `
  }

  async function getVariantById({ companyId, variantId, productId }) {
    await assertChild(prisma,"catalog_product_variant",companyId,variantId,productId);
    const rows = await prisma.$queryRaw`
      SELECT v.*, CASE WHEN v.price_inherited THEN p.price ELSE v.price END AS price
      FROM catalog_product_variant v JOIN catalog_product p ON p.id=v.product_id AND p.company_id=v.company_id
      WHERE v.id = ${variantId}::uuid AND v.company_id = ${companyId}::uuid
      LIMIT 1
    `
    return rows[0] ?? null
  }

  async function createVariant({ companyId, productId, data }) {
    await assertProduct(prisma,companyId,productId);
    await assertAsset(companyId,data.cover_asset_id);
    const rows = await prisma.$queryRaw`
      INSERT INTO catalog_product_variant
        (company_id, product_id, option_values, sku, barcode, price, compare_price, stock, cover_asset_id, price_inherited)
      VALUES (
        ${companyId}::uuid,
        ${productId}::uuid,
        ${JSON.stringify(data.option_values ?? {})}::jsonb,
        ${data.sku ?? null},
        ${data.barcode ?? null},
        ${data.price ?? 0},
        ${data.compare_price ?? null},
        ${data.stock ?? 0},
        ${data.cover_asset_id ?? null}::uuid,
        ${data.price === null}
      )
      RETURNING *
    `
    return getVariantById({companyId,variantId:rows[0].id,productId})
  }

  async function updateVariant({ companyId, variantId, productId, data }) {
    await assertChild(prisma,"catalog_product_variant",companyId,variantId,productId);
    await assertAsset(companyId,data.cover_asset_id);
    if(data.stock!==undefined)fail('VALIDATION_ERROR','Usa un ajuste de existencias auditado.',400);
    const map = {
      option_values:  data.option_values !== undefined ? JSON.stringify(data.option_values) : undefined,
      sku:            data.sku,
      barcode:        data.barcode,
      price:          data.price === null ? 0 : data.price,
      price_inherited: data.price === undefined ? undefined : data.price === null,
      compare_price:  data.compare_price,

      cover_asset_id: data.cover_asset_id,
    }
    const entries = Object.entries(map).filter(([, v]) => v !== undefined)
    if (!entries.length) return getVariantById({ companyId, variantId })
    const setParts = entries.map(([k], i) => `${k} = $${i + 2}`).join(', ')
    const values   = entries.map(([, v]) => v)
    const sql = `UPDATE catalog_product_variant SET ${setParts}, updated_at = now()
                 WHERE id = $1::uuid AND company_id = $${values.length + 2}::uuid AND enabled = true
                 RETURNING *`
    const rows = await prisma.$queryRawUnsafe(sql, variantId, ...values, companyId)
    return rows[0] ? getVariantById({companyId,variantId,productId}) : null
  }

  async function deleteVariant({ companyId, variantId, productId }) {
    await assertChild(prisma,"catalog_product_variant",companyId,variantId,productId);
    await prisma.$queryRaw`
      UPDATE catalog_product_variant SET enabled = false, updated_at = now()
      WHERE id = ${variantId}::uuid AND company_id = ${companyId}::uuid
    `
  }

  return {
    listOptions,
    createOption,
    updateOption,
    deleteOption,
    listVariants,
    getVariantById,
    createVariant,
    updateVariant,
    deleteVariant,
  }
}
