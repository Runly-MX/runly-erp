# Website commerce and customer accounts for templates

## 1. Feature title

Cart, checkout, orders and customer accounts as connections any Website template can carry, for every Runly instance.

## 2. Status

Implemented and rehearsed, not published (2026-11-24; approved by the owner: "todo de una vez", accounts available to any template, templates connect but do not create data).

## 3. Context

The ERP Website module already has: a product catalog linked per site, cart blocks (client cart in the browser), a public `POST /checkout` that builds a Stripe Checkout session from server-side prices, and customer accounts (External Identity realm `runly.website`: signup, email verification, sessions, a `runly.contacts` customer record, admin management). A `PosOrder` exists but belongs to the POS module, which an instance may not have installed.

## 4. Problem

1. Templates exclude `CartBlock`, `CartPageBlock` and `AccountPortalBlock`, so a storefront template (such as KYNTRA) cannot carry a cart or an account page.
2. A paid checkout leaves no record in Runly: the session is created and nothing is stored, so the business has no order list, no customer link and no way to know a payment succeeded.
3. Installing a template cannot enable customer accounts; each site has to find the setting later.
4. A signed-in customer cannot see their orders.
5. Requirement reporting does not mention commerce or accounts, so an older installation cannot explain the incompatibility.

## 5. Goals

1. Templates may include the cart, cart page and account portal blocks. They are markers: a template never carries a destination, key, site id or data.
2. Every checkout records a Website order (header and lines, prices from the server catalog, currency snapshot) before redirecting to Stripe, and marks it paid after the payment is confirmed with Stripe using the site key.
3. The order links to the customer: the signed-in account when present, otherwise the `runly.contacts` customer matched or created by the paid email.
4. Staff list, open and reconcile orders from the Website module; a signed-in customer lists their own orders.
5. Installing a template can enable customer accounts for the site in the same step (explicit option, permission checked); nothing else is created at install.
6. Reported template requirements include `commerce` and `accounts`; Hub contract advertises the new markers.
7. Works on any instance: Website-owned tables only, no dependency on POS or any optional module.

## 6. Non-goals

1. Stock decrement, shipping, taxes beyond Stripe, refunds UI, coupon management (Stripe promotion codes stay).
2. Posting to accounting or creating POS/ledger documents (future bridge on the order's stable shape).
3. Stripe webhooks (reconciliation is on return and on demand; webhook is a future enhancement).
4. Requiring login to buy (guest checkout stays; the order links the account when one is signed in).
5. Creating products, accounts or orders when a template is installed.

## 7. User stories

1. As a designer, I want my storefront template to include cart and account pages so that installing it gives a working shop once payments are configured.
2. As a shop owner, I want every paid checkout to appear as an order with its lines and customer so that I can fulfil it.
3. As a customer, I want to sign in and see my orders.
4. As an installer, I want to switch customer accounts on while installing a template.

## 8. UX requirements

Spanish. Website admin gets a "Pedidos" screen (list with status filter, detail with lines and customer, "Verificar pago" for pending orders). The install dialog gets a checkbox "Activar cuentas de clientes en este sitio" shown only when the template uses accounts, and a notice when it uses the cart but the site has no Stripe key ("Configura Stripe para cobrar; el carrito se muestra pero no podrá pagar"). The account portal gains an "Mis pedidos" list when signed in.

## 9. Routes/screens

Desktop: `runly.website` Pedidos list and detail (`/website/orders`, `/website/orders/:orderId`). Public: `POST /public/website/checkout` (existing, extended), `GET /public/website/checkout/confirm`, `GET /public/website/orders/mine`.

## 10. Data model

`website_order`: id (uuidv7), company_id, site_id, order_number (per site), status (`pending|paid|cancelled`), currency, subtotal_amount, total_amount, stripe_session_id (unique), customer_email, customer_name, contact_id, external_account_id, paid_at, created_at, updated_at. `website_order_line`: id, order_id, company_id, product_id, variant_id, name, unit_price, quantity, currency.

## 11. Prisma impact

Two new models and one forward migration `20270113000000_website_orders`. No existing table changes.

## 12. API contract

- `POST /public/website/checkout` (header `X-Site-Id`): unchanged request; creates the pending order, returns `{ url, orderNumber }`. Optional account cookie links the account.
- `GET /public/website/checkout/confirm?session_id=` (header `X-Site-Id`): retrieves the session with the site key, marks the order paid when `payment_status=paid`, fills customer data, links the contact; idempotent; 404 for unknown sessions or other sites.
- `GET /public/website/orders/mine` (account cookie): the account's orders, newest first, bounded.
- `GET /website/sites/:siteId/orders?status=&limit=&cursor=`, `GET .../orders/:orderId`: permission `website.orders.read`.
- `POST /website/sites/:siteId/orders/:orderId/verify`: reconciles a pending order with Stripe; permission `website.orders.manage`.
- Errors: `order_not_found` 404, `stripe_not_configured` 400, `payment_unconfirmed` 409.

## 13. SDK contract

`runly.website`: `listOrders(siteId, query, token)`, `getOrder(siteId, orderId, token)`, `verifyOrder(siteId, orderId, token)`.

## 14. Validator contract

Website template reader: `CartBlock`, `CartPageBlock`, `AccountPortalBlock` allowed; `CartBlock.siteId` must be empty (`prop_invalid`); requirement features `commerce` and `accounts`.

## 15. Module manifest impact

`runly.website` manifest: permissions `website.orders.read`, `website.orders.manage`; navigation entry "Pedidos".

## 16. Navigation impact

"Pedidos" under Website, icon shopping-bag, permissionKey `website.orders.read`.

## 17. Blueprint impact

N/A.

## 18. RBAC/permissions

`website.orders.read` (maps to `website.site.read`), `website.orders.manage` (maps to `website.site.update`); catalog entries beside `website.accounts.*`.

## 19. Multi-company behavior

Every query is scoped by `company_id` and `site_id`; the public routes resolve the company from the site; a session id of another site is a 404.

## 20. Files/storage impact

None.

## 21. Export/import requirements

Templates carry markers only. Install option `accountsMode: 'enable' | 'keep'` (default keep). No orders, products or accounts are exported or created.

## 22. Audit log requirements

`website.order.paid` (system), `website.order.verify` (actor), `template.marketplace.imported` metadata gains `accountsMode`.

## 23. Edge cases

1. Client sends prices or a currency: ignored, as today.
2. Stripe confirms twice or two tabs: one order, one paid transition, no duplicate contact.
3. Mixed currencies: rejected before any order is stored.
4. Stripe unreachable on confirm: the order stays pending, 409 `payment_unconfirmed`, staff can verify later.
5. Paid email matches an existing contact: linked, never overwritten.
6. Account cookie of another site: ignored.
7. Template with `CartBlock.siteId` filled: rejected.
8. Customer reads `/orders/mine` without a session: 401.

## 24. Risks

1. Orphaned pending orders: harmless, listed as pending, never counted as sales.
2. Trusting the return URL for payment: mitigated by always asking Stripe with the secret key.
3. Instances without Stripe: checkout answers `stripe_not_configured`; the dialog warns at install.

## 25. Acceptance criteria

1. Given a template with cart and account blocks, then inspection succeeds and requirements list commerce and accounts; with `siteId` set it fails.
2. Given a checkout, then a pending order with server-priced lines exists before the redirect, and mixed currencies create none.
3. Given Stripe reports paid, when confirm runs twice, then exactly one paid order, one contact and one `paidAt`.
4. Given a signed-in account buys, then the order carries its account id; `/orders/mine` returns it and not another account's.
5. Given install with `accountsMode: 'enable'` and permission, then the realm is enabled; without permission the request is refused; with `keep` nothing changes.
6. Given staff without `website.orders.read`, then the list is 403.

## 26. Verification plan

Interchange and ERP service tests with a fake Stripe, route tests through Hono, a disposable-DB migration check by running the SQL against the schema, desktop unit tests, `pnpm --filter desktop build:web`, and the Phase 3 rehearsal gates.

## 27. Rollback plan

Revert the commits; the migration only adds two tables (drop them if desired). Templates using the markers are then rejected by older readers with `block_unknown`.

## 28. Future enhancements

Stripe webhooks, stock reservation, refunds, accounting/POS bridge, order emails, require-login checkout, abandoned carts.
