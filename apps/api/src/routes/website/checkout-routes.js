// apps/api/src/routes/website/checkout-routes.js
import { Hono } from 'hono'
import Stripe from 'stripe'
import { decryptPassword } from '../../services/smtp-service.js'

export function createPublicCheckoutRouter({ prisma, StripeImpl = Stripe, decryptPasswordImpl = decryptPassword }) {
  const app = new Hono()

  app.post('/checkout', async (c) => {
    const siteId = c.req.header('X-Site-Id')
    const body   = await c.req.json().catch(() => ({}))
    const { items } = body

    if (!siteId || !items?.length) {
      return c.json({ error: 'Faltan siteId o items' }, 400)
    }
    // Each cart line must name a product; qty is the only client-trusted number.
    // price/currency/name are NEVER taken from the request body (see below) —
    // a client could otherwise buy anything for any amount it likes.
    for (const item of items) {
      if (!item?.productId || !Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0) {
        return c.json({ error: 'Cada item requiere productId y qty > 0' }, 400)
      }
    }

    try {
      const sites = await prisma.$queryRaw`
        SELECT stripe_secret_key, stripe_success_message, company_id
        FROM website_site
        WHERE id = ${siteId}::uuid AND enabled = true
        LIMIT 1
      `
      const site = sites[0]
      if (!site?.stripe_secret_key) {
        return c.json({ error: 'Stripe no configurado para este sitio' }, 400)
      }

      // Re-derive price/currency/name server-side from the published catalog —
      // never trust the client-supplied values for these. A tampered request
      // (or one sent directly with curl, bypassing the storefront UI entirely)
      // must not be able to set its own price. catalog_product/catalog_product_variant
      // are RME3-managed tables (no prisma.<model> accessor) — use $queryRaw,
      // same convention as catalog-public-service.js.
      const productIds = [...new Set(items.map((i) => String(i.productId)))]
      const products = await prisma.$queryRaw`
        SELECT id, name, price, currency
        FROM catalog_product
        WHERE id = ANY(${productIds}::uuid[])
          AND company_id = ${site.company_id}::uuid
          AND enabled = true
          AND published = true
          AND EXISTS(SELECT 1 FROM website_site s WHERE s.id=${siteId}::uuid AND s.company_id=${site.company_id}::uuid AND COALESCE((SELECT l.included FROM website_catalog_product l WHERE l.company_id=s.company_id AND l.site_id=s.id AND l.product_id=catalog_product.id),s.catalog_mode='legacy_all'))
      `
      const productById = new Map(products.map((p) => [p.id, p]))

      const variantIds = [...new Set(items.map((i) => i.variantId).filter(Boolean).map(String))]
      const variants = variantIds.length
        ? await prisma.$queryRaw`
            SELECT id, product_id, price
            FROM catalog_product_variant
            WHERE id = ANY(${variantIds}::uuid[])
              AND company_id = ${site.company_id}::uuid
              AND enabled = true
          `
        : []
      const variantById = new Map(variants.map((v) => [v.id, v]))

      const resolvedLines = []
      for (const item of items) {
        const product = productById.get(String(item.productId))
        if (!product) {
          return c.json({ error: 'Uno o mas productos ya no estan disponibles' }, 400)
        }
        let unitPrice = product.price
        if (item.variantId) {
          const variant = variantById.get(String(item.variantId))
          if (!variant || variant.product_id !== product.id) {
            return c.json({ error: 'Una variante seleccionada ya no esta disponible' }, 400)
          }
          unitPrice = variant.price
        }
        resolvedLines.push({ name: product.name, price: Number(unitPrice), currency: product.currency, qty: Number(item.qty) })
      }

      // Currency comes from each product — all items in a session must share the same currency
      const currencies = [...new Set(resolvedLines.map((i) => i.currency).filter(Boolean))]
      if (currencies.length === 0) return c.json({ error: 'Los productos no tienen moneda definida' }, 400)
      if (currencies.length > 1) return c.json({ error: 'Todos los productos del carrito deben usar la misma moneda' }, 400)
      const currency = currencies[0].toLowerCase()

      const secretKey = decryptPasswordImpl(site.stripe_secret_key)
      const stripe    = new StripeImpl(secretKey, { apiVersion: '2024-12-18.acacia' })

      const lineItems = resolvedLines.map((item) => ({
        price_data: {
          currency,
          product_data: { name: item.name },
          unit_amount:  Math.round(item.price * 100),
        },
        quantity: item.qty,
      }))

      const origin = c.req.header('Origin') ?? ''

      const session = await stripe.checkout.sessions.create({
        mode:        'payment',
        // Codes are validated and applied by Stripe on its page; the client never sends prices or discounts.
        allow_promotion_codes: true,
        line_items:  lineItems,
        success_url: `${origin}/gracias?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${origin}/`,
      })

      return c.json({ url: session.url })
    } catch (err) {
      // Provider errors can contain private configuration; keep them off the wire.
      return c.json({ error: 'No se pudo completar el pago.' }, 500)
    }
  })

  return app
}
