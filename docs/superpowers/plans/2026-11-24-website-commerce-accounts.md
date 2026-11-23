# Website commerce and customer accounts: Implementation Plan

Spec: `docs/superpowers/specs/2026-11-24-website-commerce-accounts-design.md` (approved).

## Goal

Cart, account and order connections available to every template, with Website-owned order records, shipped in the same publication train.

## File Structure Map

### Create
- `prisma/migrations/20270113000000_website_orders/migration.sql`
- `apps/api/src/services/website-orders-service.js`, `apps/api/src/routes/website/orders-routes.js`
- tests: `apps/api/src/services/__tests__/website-orders.test.js`, `packages/studio-interchange/src/__tests__/website-commerce.test.js`
- `apps/desktop/src/modules/runly.website/screens/WebsiteOrdersScreen.jsx`

### Modify
- `prisma/schema.prisma` (2 models), `apps/api/src/routes/website/checkout-routes.js`, `apps/api/src/index.js` (mounts), `apps/api/src/permission-catalog.js`, `apps/api/src/manifests/official/feature-modules.js`, `apps/api/src/services/website-authorization-service.js`
- `packages/studio-interchange/src/website-template.js`, `website-requirements.js`
- `apps/api/src/services/marketplace/website-import-service.js`, `apps/desktop/src/website/MarketplaceWebsiteDialog.jsx`
- `packages/sdk/src/domains/website.js`, desktop module routes/navigation
- Hub `child.mjs` contract descriptors

## Tasks

1. **Templates carry markers.** Remove the three blocks from the excluded set, reject `CartBlock.siteId`, add `commerce` and `accounts` requirements. Validate: interchange suite.
2. **Orders data and service.** Migration, Prisma models, service (create pending, confirm, reconcile, list, mine) with injected Stripe. Validate: service tests with fake Stripe and Prisma stub.
3. **Checkout and routes.** Extend checkout, confirm route, customer route, admin routes, permissions, mounts. Validate: Hono route tests.
4. **Install option.** `accountsMode` in the import request, permission check, enable realm; dialog checkbox and Stripe notice. Validate: import service test, desktop tests.
5. **Desktop Pedidos + SDK.** Screen, SDK methods, navigation. Validate: unit tests and `build:web`.
6. **Hub contract.** `commerce` descriptor. Validate: Hub unit test.
7. **Verification.** Full suites, rehearsal gates, evidence update, push.

## Rollback Notes

See spec section 27.

## Verification Gate

Every acceptance criterion of the spec has an automated check; interchange, ERP touched suites, desktop build and Hub unit tests green; evidence file updated.
