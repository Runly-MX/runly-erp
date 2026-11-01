import { createCommerceCatalogRoutes } from './commerce-routes.js';
// apps/api/src/routes/catalog/index.js
import { Hono } from 'hono'
import { createCatalogProductService } from './catalog-product-service.js'
import { createCatalogVariantService } from './catalog-variant-service.js'
import { createCatalogStockService }   from './catalog-stock-service.js'
import { createCategoriesRouter }      from './categories-routes.js'
import { createProductsRouter }        from './products-routes.js'
import { createVariantsRouter }        from './variants-routes.js'
import { createStockRouter }           from './stock-routes.js'

export function createCatalogRouter({ prisma, requirePermission, requireAnyPermission, supabaseAdmin }) {
  const app = new Hono()
  app.route('', createCommerceCatalogRoutes({ prisma, requirePermission, requireAnyPermission, supabaseAdmin }))

  const productSvc = createCatalogProductService({ prisma, supabaseAdmin })
  const variantSvc = createCatalogVariantService({ prisma })
  const stockSvc   = createCatalogStockService({ prisma })

  app.route('/', createCategoriesRouter({ productSvc, prisma, requirePermission }))
  app.route('/', createProductsRouter({ productSvc, prisma, requirePermission }))
  app.route('/', createVariantsRouter({ variantSvc, prisma, requirePermission }))
  app.route('/', createStockRouter({ stockSvc, productSvc, prisma, requirePermission, requireAnyPermission }))

  return app
}
