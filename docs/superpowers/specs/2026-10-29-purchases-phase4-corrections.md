# runly.purchases phase 4: audited corrections and receipt reversals

Status: implemented and verified on disposable databases (2026-10-29). Not
pushed, not deployed; the migration was never applied to the shared
development database or any real instance. Follows phases 1-3
(`78fa9400f`, `f2ce6d029`, `7249ffb0c`).

## A. Correction matrix

Drafts are edited with the normal editor (unchanged). Corrections apply to
REGISTERED documents (any status except `DRAFT`). Rules live in
`apps/api/src/services/purchase-corrections-rules.js`; the detail of an order
or invoice returns `correction: { fields, locked }` for its current status.

### Orders (permission `purchases.order.correct`)

| Field | Nature | Allowed in | Condition / effect |
|---|---|---|---|
| `number` | internal ERP folio | every status except DRAFT and CANCELLED | unique per company (`DUPLICATE_NUMBER`); the supplier may know the old folio (hint shown); `sequence` never changes |
| `supplierReference` | supplier's own reference | same | none (administrative) |
| `notes` | observations | every status except DRAFT | none |
| `expectedDate` | delivery promise | PENDING_APPROVAL, APPROVED, ISSUED, PARTIALLY_RECEIVED | only while deliveries are expected |
| `paymentTerms` | commercial terms | every status except DRAFT and CANCELLED | locked once any invoice billed from the order has payments (obligation executed) |
| supplier, currency, lines, quantities, amounts, taxes, issue date, status | financial / inventory / reporting | never | cancel and register again; status changes through its actions |

### Invoices (permission `purchases.invoice.correct`)

| Field | Nature | Allowed in | Condition / effect |
|---|---|---|---|
| `number` | folio printed by the supplier (not the ERP folio, not the CFDI UUID) | every status except DRAFT and CANCELLED, including PAID | capture-error correction; unique per supplier; must match the supplier's document |
| `notes` | observations | every status except DRAFT | none |
| `dueDate` | payment due date | PENDING_APPROVAL, PENDING, PARTIALLY_PAID | only while there is a balance |
| `fiscalUuid` (CFDI), XML, supplier, currency, lines, amounts, taxes, issue date, payments | fiscal / financial | never | the UUID identifies the supplier's fiscal voucher: cancel the invoice and register the right one; payments are recorded or reversed in the Pagos tab |

### Other documents

| Document | Decision |
|---|---|
| Requests | not extended: after submission they feed approvals and the order; corrections would need approval rules (pending, documented) |
| Receipts | not corrected: reversed (section F) |
| Cases | title/description are not financial; not part of this phase |

Cancelled documents accept `notes` only. Permissions are NOT granted to any
role by default (only administrators have them).

## B. Version and revision model

- `purchase_document_version (document_type, document_id, company_id,
  version, updated_at)`: one counter per order/invoice, outside the document
  tables (see C). Missing row = version 1.
- Every write bumps it in the same transaction: draft edit, every transition
  (submit, approve/reject, issue, close, cancel), approval decided from the
  inbox, receipt registration and reversal (order), payment and payment
  reversal (invoice), correction. `guardedUpdate` bumps automatically for
  orders and invoices; the receipt and approval paths call `bumpVersion`.
- `expectedVersion` is accepted by draft edit, transitions, payments,
  payment reversals and corrections, next to `expectedUpdatedAt`
  (older clients keep working). Mismatch → `409 STALE_DOCUMENT`.
- `purchase_document_revision`: `document_type`, `document_id`,
  `version_from`, `version_to`, `changes` (`{ field: { before, after } }`),
  `reason` (required, CHECK), `actor_id`, `created_at`; unique
  `(document_type, document_id, version_to)`; immutable (trigger). The
  correction locks the document row, checks the version, validates, updates,
  bumps and inserts the revision in ONE transaction, plus an audit row
  `purchase.order.corrected` / `purchase.invoice.corrected`. Earlier audits
  are never touched.

## C. Migration

`prisma/migrations/20261215120000_purchase_corrections` (after
`20261214120000_purchase_payments`): creates `purchase_document_version`,
`purchase_document_revision`, `purchase_receipt_reversal`,
`purchase_receipt_reversal_line`, CHECKs, FKs (`RESTRICT`) and the shared
`purchase_history_immutable` trigger (company purge allowed). It does not
alter `purchase_order`, `purchase_invoice` or `purchase_receipt` and writes
no row. Rollback: `scripts/purchases/corrections-rollback.sql`.

Design decision: a first draft added a `version` column to orders/invoices
and reversal columns to receipts. It was replaced because the regenerated
Prisma client selects every column, so any database without the migration
(the shared development database, or an instance whose code is deployed
before the migration) would fail on every order, invoice and receipt query.
With new tables only, the code detects them (`to_regclass`, cached 60 s) and
degrades: `version: null`, corrections `409 CORRECTIONS_UNAVAILABLE`,
reversals `409 REVERSALS_UNAVAILABLE`, history `available: false`. Verified
on the development API (not migrated).

## D. API, permissions, SDK, events

| Endpoint | Permission |
|---|---|
| `POST /purchases/orders/:id/corrections` `{ changes, reason, expectedVersion }` → `201 { document, version, revision }` | `purchases.order.correct` |
| `POST /purchases/invoices/:id/corrections` | `purchases.invoice.correct` |
| `GET /purchases/orders/:id/revisions` → `{ available, version, revisions }` | `purchases.order.read` (works with the capability off) |
| `GET /purchases/invoices/:id/revisions` | `purchases.invoice.read` |
| `GET /purchases/receipts/:id/reversal-preview` → `{ available, lines, reversals, blockers, warnings, fullyReversed }` | `purchases.receipt.read` |
| `POST /purchases/receipts/:id/reverse` `{ reason, lines?, reversedAt, idempotencyKey }` → `201 { reversal, orderStatus }` (200 on replay) | `purchases.receipt.reverse` |

Errors: `STALE_DOCUMENT`, `FIELD_NOT_CORRECTABLE` (422, with `field`),
`FIELD_LOCKED_IN_STATUS`, `DUPLICATE_NUMBER`, `NO_CHANGES`, `VALIDATION`
(reason), `INVALID_TRANSITION` (draft), `CAPABILITY_DISABLED`, `FORBIDDEN`,
`NOT_FOUND` (other company), `CORRECTIONS_UNAVAILABLE`; reversals:
`ORDER_CLOSED`, `CASE_CLOSED`, `RECEIPT_HAS_ASSETS` (with `dependencies`),
`NOTHING_TO_REVERSE`, `RECEIPTS_INCONSISTENT`, `IDEMPOTENCY_KEY_REUSED`,
`REVERSALS_UNAVAILABLE`.

New permissions (catalog + manifest): `purchases.order.correct`,
`purchases.invoice.correct`, `purchases.receipt.reverse`.
SDK: `correctDocument`, `listRevisions`, `receiptReversalPreview`,
`reverseReceipt`. Events (outbox, after commit, not on replays):
`purchases.order.corrected`, `purchases.invoice.corrected`
(`PURCHASE_FIELDS`), `purchases.receipt.reversed`
(`{ id, receiptId, orderId, caseId, orderStatus, number }`). Developer docs
updated and regenerated.

## E. Interface

- Order/invoice detail: action "Corregir datos" (visible with the permission,
  the capability on and allowed fields), dialog with only the allowed fields
  plus the locked ones explained, review step with before/after, required
  reason, conflict/duplicate/validation messages; tab "Correcciones" with the
  revision history (version, author, date, reason, each field before/after),
  readable with the capability off and by readers.
- Receipt detail: action "Reversar recepción", dialog with per line received
  / already reversed / reversible and an editable quantity (partial or
  total), blockers (no confirm button) and warnings, required reason; tab
  "Reversos" with the history.
- Field ids bind labels to inputs (accessibility; used by the UI tests).

## F. Receipt reversals and inventory effects

Findings: received quantities are cached per order line
(`purchase_line.received_quantity`) and itemised in
`purchase_receipt_line`; the order status (`ISSUED → PARTIALLY_RECEIVED →
RECEIVED`) follows goods lines; assets relate to a receipt through
`RECEIVED_IN` relations and to order lines through `purchase_allocation`
(created from a line, independent of reception); invoices bill orders, not
receipts.

Mechanism: `purchase_receipt_reversal` + lines (positive quantities that
compensate); the original receipt and its lines are never changed. One
transaction locks the order row (same lock as receipts), re-reads what was
already reversed, validates per line (≤ received − reversed, and ≤ the line's
received quantity), inserts the reversal, subtracts from
`received_quantity`, recomputes the order status (`RECEIVED` /
`PARTIALLY_RECEIVED` / `ISSUED`), bumps the order version and writes the
audit. Partial reversals per line are supported; several partial reversals
are allowed until nothing remains (`NOTHING_TO_REVERSE`). Idempotency key per
company. Invariant (tested): `received_quantity = Σ receipt lines − Σ
reversal lines`.

Dependencies:
- Blockers: assets linked to the receipt (`RECEIPT_HAS_ASSETS`, listed: the
  user unlinks them first; nothing is unlinked or deleted automatically);
  order closed or cancelled (`ORDER_CLOSED`: an ended order does not wait for
  deliveries); case closed or cancelled (`CASE_CLOSED`: reopen it first; it is
  never reopened automatically).
- Warnings (informative): assets created from the order lines; registered or
  paid invoices of the order (the reversal does not change invoices or
  payments).

## G. Tests and evidence (2026-10-29)

- Unit: `purchase-corrections-rules.test.js` (matrix per status, CFDI and
  amounts locked, validation, reversal planning); desktop
  `document-actions.test.js` (actions need the API plan and permissions).
  Purchases + engine + docs + manifests: 273/274 pass, 1 skipped (integration
  without URL).
- Integration on disposable `postgres:18` (`purchase-corrections.integration.test.js`):
  **9/9, two runs** (phase 3 integration 11/11 alongside): code without the
  migration (version null, `CORRECTIONS_UNAVAILABLE`); migration applied after
  the payments migration on existing data (fingerprint of orders, invoices,
  receipts and lines unchanged); rollback valid; version bumps on create,
  submit, issue, receipt, payment, `expectedVersion` on payments; allowed
  correction with revision before/after, reason, author, audit and one
  event; duplicate folio; forbidden field (422); missing reason; no changes;
  revision immutable; two concurrent corrections of the same version (one
  201, one 409, one revision); paid invoice (due date locked, folio allowed,
  payment ledger unchanged); closed order; capability off (history yes,
  writes no); reader vs `update` vs `correct`; other company 404; partial,
  replayed, concurrent double total and re-received reversals; assets /
  closed order / closed case blockers with nothing changed; quantity
  invariant.
- Full stack on a disposable Supabase stack (`.e2e/purchases-corrections-real.mjs`,
  git-ignored): **30/30**. Every migration except this one deployed, seed,
  then `prisma migrate deploy` applies it after the payments migration,
  `migrate status` up to date; real logins (corrector, reader, other
  company); UI: correction of folio + notes with review, required reason,
  API 201, revision persisted with before/after/reason/author, history tab;
  duplicate folio message with nothing saved; two sessions on one version →
  conflict message and a single extra revision; paid invoice offers neither
  due date nor UUID, folio corrected, payment ledger intact; partial receipt
  reversal (laptop 3 → 2, monitor unchanged, order PARTIALLY_RECEIVED,
  original lines kept), reversal history; receipt with a linked asset →
  blocker and no confirm button; reader has no action but reads history;
  390 px correction and reversal dialogs fit with no horizontal scroll;
  capability off → no action, history readable; quantity and payment
  invariants; no page errors or 5xx.
- Development API without the migration: details load (`version: null`),
  corrections 409 `CORRECTIONS_UNAVAILABLE`, revisions `available: false`,
  receipt `reversal.available: false`.
- Whole API suite: 2929/2936; the same 4 pre-existing failures documented in
  phase 3 (calls tests vs `4ee290770`, runtime catalog vs local
  `node_modules`), none new.

## H. Risks, limits and pending

- Deploy the code with or before the migration (both orders verified); grant
  the three new permissions deliberately.
- A corrected internal order folio differs from the one the supplier
  received; the UI warns. The internal `sequence` never changes.
- A reversal leaves registered or paid invoices as they were (by design,
  warned); the receipt policy may then block future payments of that case.
- Reversals of receipts in closed orders/cases are refused; an order cannot
  be reopened today, so such a correction needs a new receipt on another
  order or an accounting adjustment outside Compras.
- Assets created from order lines are not tied to a receipt, so they only
  produce a warning.
- The rollback SQL keeps the quantities already subtracted by reversals.
- Pending (later phases): archive/logical delete, multi-order invoices,
  corrections of requests and cases, reopening orders, the visual redesign,
  inventory custom-field duplicates, approval of the payments backfill.
