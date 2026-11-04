# Mercado template (department-store ecommerce)

## Goal
A built-in website template `atlas-mercado` for multi-category stores: deep green, warm off-white, serif display
headings, coral sale accents. Inspired by a reference mockup the user shared (layout ideas only: no copied brand,
copy or imagery). Every visible element is editable from the atlas-web-builder property panel.

## Pages
Inicio, Productos (search + category chips), Producto (`?p=`), Carrito, Gracias, Nosotros, Contacto. The shop pages
reuse the live store blocks (ProductsGridBlock, ProductDetailBlock, CartPageBlock).

## New blocks (apps/desktop/src/website/runlyBlocks/mercado*.jsx, category `atlas-ecommerce`)
- MercadoHeaderBlock: announcement bar (rotating messages), logo image or brand, search box (GET /productos?q=),
  account / wishlist links, cart link with live count, category bar with "Todas las categorías" + links, sticky,
  mobile drawer.
- MercadoHeroBlock: up to 3 slides (text lines + image1..3), autoplay crossfade with Ken Burns zoom, dots, pause on
  hover/focus, sale seal, trust row. Without images it draws an illustrated still life.
- MercadoCategoriesBlock: circle icon tiles from `Nombre | icono | /ruta` lines, built-in icon set, hover lift.
- MercadoPicksBlock: horizontal snap carousel over the public catalog (live products, add to cart); sample cards with
  discount badge, rating and struck price only in the editor/preview.
- MercadoPromoTilesBlock: three tinted tiles with optional images, hover zoom.
- MercadoReviewsBlock: rating summary + review carousel with initials avatars and verified mark.
- MercadoNewsletterBlock: dark band with a `children` slot holding the `@newsletter` ContactFormBlock.
- MercadoServicesBlock: four icon service promises.
- MercadoFooterBlock: brand, social icons, link columns (SiteFooterBlock DSL), app store badges, legal links.

## Builder integration
- Branding on apply also fills `brand` of MercadoHeaderBlock / MercadoFooterBlock and the logo of the header.
- ProductsGridBlock reads `?q=` and `?c=` so header search and category links land on a filtered catalog.
- No atlas-web-builder package change: every need is covered by existing field types (text, textarea, image, link,
  select, toggle), slots and validated `_*` effects. Known gap kept for later: a repeater field for per-item images.

## Verification
Block catalog regenerated; website-template-conform test passes; SSR render of every page of the template.
