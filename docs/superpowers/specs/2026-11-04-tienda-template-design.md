# Tienda template: catalog, cart and checkout (design)

## Findings (how store pages work today)
- `ProductsGridBlock` / `ProductCardBlock` fetch `GET /public/catalog/{products,products/:idOrSlug,categories}` in the browser
  using `window.RUNLY_CONFIG` (`apiUrl`, `company`, `siteId`). Supported query params: `limit`, `offset`, `search`, `categorySlug`.
- Publishing seals the page document; `productId` props are validated against `catalog_product` and recorded as dynamic
  bindings; all block props must be declared fields. Products themselves are NOT baked into the release; they load at view time.
- `POST /public/website/checkout` (checkout-routes.js, header `X-Site-Id`) re-derives price/currency/name server side from the
  published catalog and creates a Stripe Checkout session (needs Stripe configured on the site). Success URL is `<origin>/gracias`,
  cancel URL `<origin>/`. There was NO client cart and the template's `showAddToCart` / `categoryId` props were not declared fields.
- The `atlas-web-builder` commerce blocks (`ProductGridBlock`, `CartBlock`...) need host `resources` plus `useCart`; wiring them would
  mean a new resource-provider in the trusted runtime and new publish bindings. Rejected: it changes the publish/security model.

## Decision
Extend Runly's own blocks, no publish pipeline change; all data goes through the existing public endpoints.
1. `ProductsGridBlock` (backwards compatible): new declared fields `showSearch`, `showCategories`, `showAddToCart`, `detailHref`.
   Search + category chips are client side over the public endpoints; cards link to `<detailHref>?p=<slug>`; "Agregar" writes to the cart.
   When the site is not configured (editor, template preview) it draws placeholder cards with empty image slots.
2. New `ProductDetailBlock` (page `/producto`): reads `?p=` , loads the product, variant selector, quantity, add to cart.
3. New `CartPageBlock` (page `/carrito`, mode `thanks` for `/gracias`): localStorage cart (key per site), quantity edit, remove,
   estimated subtotal, "Pagar" posts only `{productId, variantId, qty}` to the checkout endpoint (price is never sent) and redirects to `https:` URL.
4. Decorative, asset-free blocks: `StoreHeroBlock`, `CollectionTilesBlock`, `TrustStripBlock` (CSS / inline SVG).
All new blocks belong to the `ecommerce` group.

## Not done
- Live cart count in the navbar (NavbarBlock is a package block with static props).
- Newsletter subscription (no public subscribe endpoint); the closing banner links to the Contacto form instead.
- Stock enforcement and discount codes (checkout endpoint does not support them); the old fake "BIENVENIDO" promo is removed.
- Packaging the package's `commerceBlocks` (see Decision).
