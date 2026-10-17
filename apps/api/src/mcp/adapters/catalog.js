import { z } from 'zod';
import { createCatalogProductService } from '../../routes/catalog/catalog-product-service.js';
import { createProductSchema, updateProductSchema, createCategorySchema } from '../../routes/catalog/validators.js';
import { insist } from '../config.js';
import { pageInput } from '../contracts.js';

const PUBLIC_BUCKET = 'runly-website';
const productLink = id => `/app/m/runly.catalog/${id}`;

export function createCatalogAdapter({ prisma }) {
  // No supabaseAdmin: listings never hand out signed URLs of private covers.
  // Public image URLs come from website_media.
  const svc = createCatalogProductService({ prisma });
  async function product(a, id) {
    const row = await svc.getProductById({ companyId: a.companyId, id });
    insist(row && row.enabled !== false, 'not_found', 'Producto no disponible.', 404);
    return row;
  }
  // Storefront images must be company PUBLIC images (permanent URLs).
  async function assertImages(a, data) {
    const ids = [...new Set([data.cover_asset_id, ...(data.images ?? [])].filter(Boolean))];
    if (!ids.length) return;
    const rows = await prisma.fileAsset.findMany({ where: { id: { in: ids }, entityId: a.companyId, enabled: true, visibility: 'PUBLIC', bucket: PUBLIC_BUCKET, mimeType: { startsWith: 'image/' } }, select: { id: true } });
    insist(rows.length === ids.length, 'invalid_request', 'Las imágenes deben ser imágenes públicas de la empresa (website_media o runly_files_import_prepare con target catalog.product / website.site).');
  }
  async function assertCategory(a, id) {
    if (!id) return;
    const rows = await prisma.$queryRaw`SELECT id FROM catalog_category WHERE id = ${id}::uuid AND company_id = ${a.companyId}::uuid AND enabled = true LIMIT 1`;
    insist(rows.length, 'not_found', 'Categoría no disponible.', 404);
  }
  async function assertSlug(a, table, slug, exceptId = null) {
    if (!slug) return;
    const rows = table === 'product'
      ? await prisma.$queryRaw`SELECT id FROM catalog_product WHERE company_id = ${a.companyId}::uuid AND slug = ${slug} AND (${exceptId}::uuid IS NULL OR id <> ${exceptId}::uuid) LIMIT 1`
      : await prisma.$queryRaw`SELECT id FROM catalog_category WHERE company_id = ${a.companyId}::uuid AND slug = ${slug} LIMIT 1`;
    insist(!rows.length, 'duplicate_resource', `Ya existe ese slug: ${slug}`, 409);
  }
  const summary = row => ({ id: row.id, name: row.name, slug: row.slug, sku: row.sku, type: row.product_type, price: row.price, comparePrice: row.compare_price, currency: row.currency, stock: row.stock, published: row.published, category: row.category_name ?? null, coverAssetId: row.cover_asset_id, link: productLink(row.id) });
  const preview = (title, data, before) => ({ title, fields: Object.entries(data).map(([label, value]) => ({ label, value: typeof value === 'string' ? value : JSON.stringify(value), ...(before && before[label] !== undefined ? { before: typeof before[label] === 'string' ? before[label] : JSON.stringify(before[label]) } : {}) })) });

  return { moduleKey: 'runly.catalog', label: 'Catálogo',
    queries: [
      { name: 'catalog_products_page', permission: 'catalog.products.read', inputSchema: z.strictObject({ ...pageInput, search: z.string().max(200).optional(), published: z.boolean().optional(), categoryId: z.uuid().optional() }), definition: { description: 'Productos del catálogo (precio, stock, publicado) con paginación.' },
        async run(input, a) {
          const { data, total } = await svc.listProducts({ companyId: a.companyId, search: input.search, published: input.published, categoryId: input.categoryId, limit: input.limit, offset: (input.page - 1) * input.limit });
          return { items: data.map(summary), total, page: input.page, limit: input.limit };
        } },
      { name: 'catalog_product_detail', permission: 'catalog.products.read', inputSchema: z.strictObject({ productId: z.uuid() }), definition: { description: 'Producto con descripción, atributos, imágenes y variantes.' },
        async run(input, a) { await product(a, input.productId); return { product: await svc.getFullProductById({ companyId: a.companyId, id: input.productId }), link: productLink(input.productId) }; } },
      { name: 'catalog_categories', permission: 'catalog.categories.read', inputSchema: z.strictObject({}), definition: { description: 'Árbol de categorías del catálogo.' },
        run: async (_input, a) => ({ items: await svc.listCategoriesTree({ companyId: a.companyId }) }) },
    ],
    actions: [
      { key: 'catalog.product.create', permission: 'catalog.products.create', operation: 'create', label: 'Crear producto',
        inputSchema: z.strictObject({ data: createProductSchema.strict() }),
        async prepare(input, a) {
          await Promise.all([assertSlug(a, 'product', input.data.slug), assertCategory(a, input.data.category_id), assertImages(a, input.data)]);
          return { input, targetId: null, preview: preview(input.data.published ? 'Crear producto publicado en la tienda' : 'Crear producto (borrador)', input.data) };
        },
        async execute(input, a) { const row = await svc.createProduct({ companyId: a.companyId, data: input.data }); return { ...summary(row), link: productLink(row.id) }; } },
      { key: 'catalog.product.update', permission: 'catalog.products.update', operation: 'update', label: 'Editar producto',
        inputSchema: z.strictObject({ productId: z.uuid(), data: updateProductSchema.strict().refine(data => Object.keys(data).length, 'Sin cambios') }),
        async prepare(input, a) {
          const before = await product(a, input.productId);
          await Promise.all([assertSlug(a, 'product', input.data.slug, input.productId), assertCategory(a, input.data.category_id), assertImages(a, input.data)]);
          return { input, targetId: input.productId, preview: preview('Editar producto', input.data, before) };
        },
        async execute(input, a) { const row = await svc.updateProduct({ companyId: a.companyId, id: input.productId, data: input.data }); insist(row, 'not_found', 'Producto no disponible.', 404); return summary(row); } },
      { key: 'catalog.category.create', permission: 'catalog.categories.create', operation: 'create', label: 'Crear categoría',
        inputSchema: z.strictObject({ data: createCategorySchema.strict() }),
        async prepare(input, a) {
          await Promise.all([assertSlug(a, 'category', input.data.slug), assertCategory(a, input.data.parent_id), assertImages(a, { cover_asset_id: input.data.cover_asset_id })]);
          return { input, targetId: null, preview: preview('Crear categoría', input.data) };
        },
        execute: (input, a) => svc.createCategory({ companyId: a.companyId, data: input.data }) },
    ],
    revision: async (_definition, prepared, a) => prepared.targetId ? product(a, prepared.targetId) : null,
    // Publishing a product exposes it (price, stock) on the public storefront.
    sensitive: (_definition, input) => input?.data?.published === true,
    effects: ['Crear o editar productos y categorías del catálogo. Un producto publicado aparece en la tienda del sitio y en el catálogo público.'],
  };
}
