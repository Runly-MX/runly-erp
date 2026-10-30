# Plan: runly.purchases integrity (phases 1-7)

Spec: `docs/superpowers/specs/2026-10-29-purchases-integrity-audit.md`.

## Phase 1: concurrency, history, safe unlink (done)

- [x] Guarded writes (`guardedUpdate`, `assertFresh`) for order/invoice edit and transitions; `STALE_DOCUMENT` 409.
- [x] Conditional approval decision.
- [x] Order row lock in receipt creation.
- [x] Reads without capability gate; `capabilityEnabled` on lists and details.
- [x] Relation impact endpoint, protected relations, dependents keep/remove, reason in audit.
- [x] Cancel/reject comment stored in the transition audit.
- [x] Desktop: `expectedUpdatedAt` from editor, action bar and payment dialog; `UnlinkRelationDialog` in Relacionados, inventory tab and the item's Compras section.

Verified: 2026-10-29 (`node --test` purchases suites 65/65; ESLint clean on changed files; desktop `vite build` OK; `.e2e/purchases-integrity-e2e.mjs` 25/25 PASS twice against the local API and the E2E test company; `.e2e/purchases-unlink-ui.mjs` 4/4 PASS in Chromium).

## Phase 2: individual payments

- [ ] Migration `purchase_payment` + backfill of `paid_amount > 0` (spec E.1).
- [ ] `POST/GET /purchases/invoices/:id/payments`, `POST /purchases/payments/:id/reverse`; `transition('pay')` as alias.
- [ ] Idempotency key; `paid_amount` recomputed in the same transaction.
- [ ] Events `purchases.invoice.payment.recorded` / `.reversed`.

## Phase 3: corrections after registration

- [ ] `version` column + `purchase_document_revision` (spec E.2).
- [ ] Non-financial header corrections with reason and `purchases.<doc>.correct`.
- [ ] Receipt reversal (negative receipt).

## Phase 4: archive, restore, logical delete (spec B, E.3-E.4)

## Phase 5: multi-order invoices and line allocation (spec E.7, compatibility matrix first)

## Phase 6: inventory custom-field duplicates (spec A.6, E.6: census on the real instance, equivalences, backup, approval)

## Phase 7: backlog findings A.3 #7, #8, #10-#15, #17 and the UX items in spec G
