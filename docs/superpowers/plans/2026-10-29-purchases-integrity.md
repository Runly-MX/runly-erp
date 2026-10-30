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

## Phase 2: operational flow, case closure, cancelled links, history in the UI (done)

Spec: `docs/superpowers/specs/2026-10-29-purchases-phase2-operational-flow.md`.

- [x] Receipt state per order (goods vs services); close short with reason; `RECEIPT_PENDING`.
- [x] Case closure check; automatic close/cancel without the case gate; manual close refuses open documents.
- [x] Live vs historical links (cancelled documents free the item); in-transaction uniqueness with per-item locks; `DOCUMENT_CANCELLED`.
- [x] History flags, sidebar, lists, details, tabs, item section and timeline read-only with a capability off; MirAI/MCP reads.
- [x] Fix: `UnlinkRelationDialog` confirm did nothing.

Verified: 2026-10-29 (purchases `node --test` 96/96; ESLint clean; desktop `vite build` OK; `.e2e/purchases-phase2-e2e.mjs` 34/34 twice; `.e2e/purchases-integrity-e2e.mjs` 25/25; `.e2e/purchases-phase2-ui.mjs` 15/15 twice in Chromium desktop + 390 px).

## Phase 3: individual payments

- [ ] Migration `purchase_payment` + backfill of `paid_amount > 0` (spec E.1).
- [ ] `POST/GET /purchases/invoices/:id/payments`, `POST /purchases/payments/:id/reverse`; `transition('pay')` as alias.
- [ ] Idempotency key; `paid_amount` recomputed in the same transaction.
- [ ] Events `purchases.invoice.payment.recorded` / `.reversed`.

## Phase 4: corrections after registration

- [ ] `version` column + `purchase_document_revision` (spec E.2).
- [ ] Non-financial header corrections with reason and `purchases.<doc>.correct`.
- [ ] Receipt reversal (negative receipt).

## Phase 5: archive, restore, logical delete (spec B, E.3-E.4)

## Phase 6: multi-order invoices and line allocation (spec E.7, compatibility matrix first)

## Phase 7: inventory custom-field duplicates (spec A.6, E.6: census on the real instance, equivalences, backup, approval)

## Phase 8: backlog findings A.3 #10, #11, #13-#15 and the pending items of phase 2 and the UX items in spec G
