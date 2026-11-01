// apps/api/src/routes/catalog/stock-routes.js
import { Hono } from 'hono'

export function createStockRouter({ stockSvc, productSvc, prisma, requirePermission }) {
  const app = new Hono()

  // Stock reads and writes are handled by commerce-routes; keep legacy exports here.

  // ── Export ────────────────────────────────────────────────────────────────

  app.get('/catalog/products/:id/stock-movements/export/xlsx', requirePermission('catalog.products.read'), async (c) => {
    try {
      const { buildStockMovementsExcelBuffer } = await import('./catalog-export-service.js')
      const { resolveCompanyBranding } = await import('../../services/pdf-branding-service.js')
      const companyId = c.get('companyId')
      const productId = c.req.param('id')
      const product = await productSvc.getProductById({ companyId, id: productId })
      if (!product) return c.json({ error: 'Not found' }, 404)
      const { data: rows } = await stockSvc.listStockMovements({ companyId, productId, limit: 5000, offset: 0 })
      const branding = await resolveCompanyBranding({ prisma, companyId }).catch(() => undefined)
      const buffer = await buildStockMovementsExcelBuffer({ product, rows, branding })
      c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      c.header('Content-Disposition', `attachment; filename="movimientos-${product.slug ?? productId}-${Date.now()}.xlsx"`)
      return new Response(buffer, { status: 200, headers: c.res.headers })
    } catch (err) {
      console.error('[GET /catalog/products/:id/stock-movements/export/xlsx]', err?.message)
      return c.json({ error: 'No se pudo exportar el archivo Excel.' }, 500)
    }
  })

  app.get('/catalog/products/:id/stock-movements/export/pdf', requirePermission('catalog.products.read'), async (c) => {
    try {
      const { buildStockMovementsPdfBuffer } = await import('./catalog-export-service.js')
      const { resolveCompanyBranding } = await import('../../services/pdf-branding-service.js')
      const companyId = c.get('companyId')
      const productId = c.req.param('id')
      const product = await productSvc.getProductById({ companyId, id: productId })
      if (!product) return c.json({ error: 'Not found' }, 404)
      const { data: rows } = await stockSvc.listStockMovements({ companyId, productId, limit: 5000, offset: 0 })
      const branding = await resolveCompanyBranding({ prisma, companyId }).catch(() => undefined)
      const buffer = await buildStockMovementsPdfBuffer({ product, rows, branding })
      c.header('Content-Type', 'application/pdf')
      c.header('Content-Disposition', `attachment; filename="movimientos-${product.slug ?? productId}-${Date.now()}.pdf"`)
      return new Response(buffer, { status: 200, headers: c.res.headers })
    } catch (err) {
      console.error('[GET /catalog/products/:id/stock-movements/export/pdf]', err?.message)
      return c.json({ error: 'No se pudo exportar el PDF.' }, 500)
    }
  })

  return app
}
