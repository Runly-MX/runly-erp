# Tienda: cart count navbar, newsletter signup, discount codes

Status: approved (autonomous). Follows `2026-11-04-tienda-template-design.md` and `2026-11-04-template-contact-form-design.md`.

## Scope
1. `StoreNavbarBlock` (ecommerce group): brand, links (`Label | /path`), variant light/dark, sticky, "Carrito" link with a live count badge
   read through `useCartLines` (same `runly-cart-change` event + `storage` as the cart/grid blocks). Hamburger under 768px
   (`aria-expanded`, Escape closes and refocuses the toggle). No logo support (use `NavbarBlock` for that); branding name still applies.
2. Newsletter: placeholder `@newsletter` on a `ContactFormBlock` creates/reuses a site form "Newsletter" (one required email field,
   createsLead, success "Gracias por suscribirte."). Placeholder table generalizes `@contact`. `ContactFormRenderer` lays out
   single-field forms inline. Tienda home and Productos carry a newsletter section above the footer.
3. Discount codes: Stripe Checkout Session gets `allow_promotion_codes: true`; prices stay server-derived and the client can never send
   a discount. `CartPageBlock.promoNote` (text, empty hides) shows "¿Tienes un código? Lo ingresas al pagar.".

## Out of scope
Public subscribe endpoint, coupon management UI, logo in the store navbar.
