# runly.purchases phase 3: individual payments, history and reversals

Status: implemented and verified on disposable databases (2026-10-29). Not
pushed, not deployed. The migration was never applied to the shared
development database or any real instance; no historical data was converted.
Follows `2026-10-29-purchases-phase2-operational-flow.md`.

## A. Diagnosis of the previous payment model

- `PurchaseInvoice` held the payment as accumulated fields: `paidAmount`
  (DECIMAL 14,2), `paidAt`, `paymentReference`, `paymentMethod`. Each `pay`
  transition added a positive amount to `paidAmount` and **overwrote** the
  date, reference and method with the last payment's. Partial payments existed
  (`PARTIALLY_PAID`) but only their sum survived; the per-payment trace was an
  audit row (`metadata.amount`). There was no way to undo a payment.
- Money was computed with JavaScript numbers (`Math.round(x * 100) / 100`).
- Balance = `total - paidAmount`, computed in five places (detail, list,
  dashboard, suppliers, MirAI assistant context).
- Status: `PENDING → PARTIALLY_PAID → PAID` by amount; `pay` allowed from
  `PENDING | PARTIALLY_PAID`; cancel only before any payment.
- Event `purchases.invoice.paid` when the invoice becomes `PAID`.
- Consumers of the accumulated fields (all kept working): purchase listing
  (`balance`), dashboard payables, supplier summary (`_sum.paidAmount`),
  MirAI assistant context (overdue balance), chat entity card ("Pagado"),
  invoice columns/cards/hero in the UI, the legacy import (`purchases-historical.js`
  writes `paidAmount` for PAID imports), the case policy (`paid` flag).
  No automation reads them besides the `paid` event payload.

## B. Model and contract

### B.1 Entity

`purchase_payment` (Prisma `PurchasePayment`), one immutable row per movement:

| Column | Meaning |
|---|---|
| `id` | uuidv7 |
| `company_id`, `invoice_id` | tenant and invoice (FK `ON DELETE RESTRICT`) |
| `kind` | `PAYMENT`, `OPENING` (legacy accumulated amount without detail), `REVERSAL` |
| `amount` | DECIMAL(14,2), **signed**: positive for PAYMENT/OPENING, negative for REVERSAL |
| `currency` | the invoice currency |
| `paid_at` | effective date (null for OPENING: never invented) |
| `recorded_at` | when it was recorded |
| `method`, `reference` | as typed; null for OPENING |
| `origin` | `MANUAL`, `MIGRATED`, `IMPORT`, `INTEGRATION` |
| `reverses_id` | REVERSAL → the reversed movement (unique: one reversal per movement) |
| `reason` | required for REVERSAL |
| `idempotency_key` | unique per company |
| `created_by_id` | responsible profile |
| `metadata` | e.g. `legacySnapshot` of an OPENING |

Database guarantees: CHECK constraints on kind, origin, sign/reason
consistency and currency; unique `reverses_id`; unique `(company_id,
idempotency_key)`; trigger `purchase_payment_immutable` refuses UPDATE and
DELETE except inside the company-deletion purge (`runly.lifecycle_purge`).

### B.2 Amounts and status

- paid = `SUM(amount)`; `purchase_invoice.paid_amount` stays as the cache
  every consumer reads and is updated in the same transaction as each
  movement. Invariant (tested): for every invoice with movements,
  `paid_amount = SUM(amount)`.
- balance = `total - paid` (0 when cancelled).
- status from paid: 0 → `PENDING`, < total → `PARTIALLY_PAID`, ≥ total → `PAID`.
- `paidAt`, `paymentReference`, `paymentMethod` on the invoice = those of the
  latest payment still in force; after reversing every manual payment of a
  legacy invoice, the values the invoice had before (its `legacySnapshot`).
- Money is integer cents (`purchase-money.js`), parsed from decimal strings;
  amounts with more than two decimals are refused.

### B.3 Legacy amounts (no invented movements)

An invoice paid before the ledger has `paid_amount > 0` and no rows. It is
shown as "pagado histórico sin desglose" (`summary.unrecordedLegacy`) and is
recorded as **one** `OPENING` movement (origin `MIGRATED`, no date, method or
reference; the invoice's own values are copied into
`metadata.legacySnapshot`) either:
1. the first time a payment or reversal touches that invoice (same
   transaction, audited as `purchase.invoice.payment.opening_recorded`), or
2. by the reviewed backfill (`scripts/purchases/payments-reconciliation.mjs
   --apply`), pending approval.

Invoices whose status and amounts disagree are reported, never fixed.

### B.4 Reversal

A `REVERSAL` row with the negative amount, `reverses_id`, a required reason,
the responsible profile and its own effective date (today unless given). The
original row is never modified. A reversal cannot be reversed. Only invoices
`PARTIALLY_PAID | PAID` (not cancelled). If the invoice's case is `CLOSED`,
the reversal is allowed (financial correction) but the case is **not**
reopened; the response carries a warning and the UI shows it. No bank refund
or transfer happens.

### B.5 Concurrency and idempotency

Every payment and reversal locks the invoice row (`FOR UPDATE`) and re-reads
it, validates the balance and inserts the movement in the same transaction;
the invoice write is also guarded by status + version (phase 1).
`expectedUpdatedAt` is honoured (`STALE_DOCUMENT`). An `idempotencyKey`
(8–100 chars `[A-Za-z0-9:_-]`) makes a retry return the movement already
created (`200`, `replayed: true`, no second event); the same key on another
operation answers `409 IDEMPOTENCY_KEY_REUSED`. A unique violation from a
concurrent retry is resolved to the replay. Double reversal is impossible
(lock + unique index).

### B.6 API

| Endpoint | Permission | Notes |
|---|---|---|
| `GET /purchases/invoices/:id/payments` | `purchases.invoice.read` | `{ summary, payments }`; works with the payments capability off |
| `GET /purchases/invoices/:id/balance` | `purchases.invoice.read` | the summary only |
| `POST /purchases/invoices/:id/payments` | `purchases.payment.manage` | `{ amount, paidAt, method, reference, idempotencyKey, expectedUpdatedAt }` → `201 { invoice, payment, replayed }` (200 on replay) |
| `GET /purchases/payments/:id` | `purchases.invoice.read` | one movement with its reversal |
| `POST /purchases/payments/:id/reverse` | `purchases.payment.reverse` (new) | `{ reason, effectiveAt, idempotencyKey, expectedUpdatedAt }` → `201 { invoice, reversal, warnings }` |
| `POST /purchases/invoices/:id/transition { action: 'pay' }` | unchanged | compatibility alias: records a movement, returns the invoice as before |

Errors: `CAPABILITY_DISABLED` (writes with payments off), `INVALID_TRANSITION`
(cancelled, already paid, reversal of a reversal), `VALIDATION` (amount,
reason, key), `STALE_DOCUMENT`, `IDEMPOTENCY_KEY_REUSED`,
`PAYMENT_ALREADY_REVERSED`, `PAYMENTS_INCONSISTENT` (ledger above the cache:
reconcile first), `PAYMENTS_LEDGER_UNAVAILABLE` (table not migrated yet),
`NOT_FOUND` (including another company's ids), `FORBIDDEN`.

Events (outbox, after commit, never on a replay):
`purchases.invoice.payment.recorded`, `purchases.invoice.payment.reversed`
(`{ id, invoiceId, caseId, kind, amount, currency, invoiceStatus, paidAmount,
balance }`), plus the existing `purchases.invoice.paid`. Realtime broadcasts:
`purchase.invoice.pay`, `purchase.invoice.payment_reversed`.

New permission `purchases.payment.reverse` ("Reversar pagos"): granted to
nobody by default except administrators; give it to the roles that may correct
payments.

## C. Migration

`prisma/migrations/20261214120000_purchase_payments/migration.sql`: creates
the table, constraints, indexes, FKs and the immutability trigger. It does
not alter `purchase_invoice` and writes no rows. Rollback:
`scripts/purchases/payments-rollback.sql` (+ `prisma migrate resolve
--rolled-back`), safe while the table holds nothing to keep.

### Compatibility before the migration

The code detects the table (`to_regclass`, cached 60 s). Without it, `list`
returns `ledgerAvailable: false` and the legacy entry, payments accumulate as
before, and reversals answer `PAYMENTS_LEDGER_UNAVAILABLE`. Verified on the
local development API, whose database was not migrated.

## D. Implementation

- `apps/api/src/services/purchase-money.js`, `purchase-payments-ledger.js`
  (pure rules), `purchase-payments-service.js`, `routes/purchases/payments-routes.js`;
  `purchase-documents-service.js` delegates `pay`; `route-helpers.js`
  `createHandler` accepts a status function.
- Prisma model, manifest + catalog permission, event catalog entries,
  SDK methods (`listPayments`, `invoiceBalance`, `recordPayment`,
  `getPayment`, `reversePayment`), developer docs (`servicios-y-eventos.md`,
  regenerated `developer-docs.json`).
- Desktop: invoice tab "Pagos" (`PaymentsPanel`: total, paid, balance, legacy
  note, chronological history with who/when/reason, reverse dialog with a
  required reason), `PaymentDialog` on the new endpoint with an operation key
  per opening (double click and network retries are safe; a conflict
  regenerates it).

## E. Compatibility report

| Consumer | Effect |
|---|---|
| Invoice lists, cards, hero, dashboard, suppliers, MirAI context, chat card | unchanged: read the `paid_amount` cache, kept exact in the same transaction |
| `transition('pay')` (UI before this phase, any API client) | same request and response; now records a movement |
| `purchases.invoice.paid` event | unchanged; also fired by the new endpoint, once |
| Case auto-close (phase 2) | runs after a payment exactly as with `pay` |
| Legacy import (`purchases-historical.js`) | unchanged: writes `paid_amount`; such invoices appear as legacy and get an OPENING on first touch or backfill |
| MCP / MirAI actions | no payment action exists; reads unchanged |
| Company deletion purge | allowed by the trigger (`runly.lifecycle_purge`); its nullable-FK step updates `reverses_id` under that flag |
| sinabe `wipe.mjs` (rehearsal tool) | would now fail on invoices that have payment rows (FK + trigger); pending adjustment if rehearsals record payments |
| Orders, receipts, inventory, cases | never modified by a payment or reversal (case only through the existing auto-close after a payment) |

## F. Simulated reconciliation

`scripts/purchases/payments-reconciliation.mjs` (explicit `--database-url`,
never `.env`): dry run in a READ ONLY transaction with per-invoice
classification (`NO_PAYMENTS`, `RECORDED`, `LEGACY_UNRECORDED`,
`LEDGER_MISMATCH`) and issues (`PAID_EXCEEDS_TOTAL`, `CANCELLED_WITH_PAYMENT`,
`STATUS_WITHOUT_PAYMENT_BUT_PAID`, `PARTIAL_STATUS_MISMATCH`,
`PAID_STATUS_BELOW_TOTAL`); totals before/after; `--apply` only with
`--confirm-database <name>`, batches of 200 per transaction, re-checks each
invoice under lock, key `backfill:<invoiceId>` (re-runs insert nothing),
verifies cached total unchanged and recorded total + backfill. Recovery: a
failed batch is rolled back and the run stops; re-running continues.

## G. Test results (2026-10-29)

- Unit: `purchase-payments-ledger.test.js` (money, status, cache fields,
  reconciliation). Purchases + module-engine + developer docs + manifests:
  267/268 pass, 1 skipped (the integration test without its URL).
- Integration on a disposable `postgres:18` container
  (`purchase-payments.integration.test.js`, `PURCHASES_TEST_DATABASE_URL`):
  11/11, three runs: migration on existing invoices (fingerprint unchanged),
  rollback SQL valid, dry run writes nothing, apply only clean invoices (3),
  idempotent re-run (0), immutability (UPDATE/DELETE refused, purge allowed),
  CHECK constraints, partial/full/exceeding/zero/negative/3-decimal amounts,
  same-key concurrent retries (one movement, one event), 6 concurrent payments
  of 30 on 100 (exactly 3), partial/full/double/concurrent reversals,
  payment + reversal at once, legacy first touch, cancelled invoice,
  capability off (read yes, write no), read vs write vs reverse permissions,
  other company 404, legacy `pay` transition, ledger invariant.
- Full stack on a disposable Supabase stack (`.e2e/purchases-payments-real.mjs`,
  git-ignored; Postgres + GoTrue + Kong in Docker, API and web of the working
  tree on their own ports, real logins): **29/29, two consecutive runs**.
  `prisma migrate deploy` of every earlier migration, legacy invoices written
  like the old code, then `prisma migrate deploy` of the payments migration on
  that data (rows unchanged, `migrate status` up to date); reconciliation dry
  run (2 legacy, 1 exception, 400.00 to backfill, nothing written); API:
  201 + idempotent 200 replay, reader 403 on writes, other company 404/403;
  UI: legacy note, payment on a legacy invoice recorded as OPENING 400 +
  PAYMENT 150 with a double click recorded once, reversal with required
  reason persisted (-150, link, original kept) and invoice recalculated, full
  payment → PAID → reversed → PENDING, lost response + retry = one movement,
  two sessions → conflict message and one movement, reader on a 390 px screen
  sees history without actions and no horizontal scroll, capability off →
  read-only, ledger invariant, no page errors or 5xx.
- Problems found and fixed during these runs: a lost response showed a
  generic network message (now it says retrying is safe); timestamps were
  formatted with their UTC day ("30 oct" for an evening payment on 29 oct in
  Mexico City; `formatDate` now uses the local day); the legacy entry said
  "Registró" (now "Pasado al historial por"). Test-side issues: the currency
  field reads typed digits as cents; a fresh Supabase stack needs the Notes
  bucket guard created by the storage owner before the API boots.
- Development API without the migration: list 200 (`ledgerAvailable: false`),
  payment accumulates, legacy `pay` works, reversal 409
  `PAYMENTS_LEDGER_UNAVAILABLE`.
- The four failures of the whole API suite reported in phase 2 are not caused
  by Compras: `contacts-proposal-module.test.js` (2) and
  `call-transcript-analysis-service.test.js` (1) fail because commit
  `4ee290770` (2026-10-14) made `company-module-service` call
  `runlyModule.findMany`, which those test doubles lack; the runtime catalog
  test fails because the local `node_modules` has newer react/react-dom
  (19.3.1), @tanstack/react-query (5.104.4) and lucide-react (1.59.0) than the
  committed catalog. `git diff ae7bbeb95 HEAD` (before phase 1 → now) is
  empty for those tests, their sources and every package manifest/lockfile,
  so they failed identically before phase 1.

## H. Risks and deployment guide

1. Deploy the code first or together with the migration: without the table
   the code runs in compatibility mode (verified).
2. Apply `20261214120000_purchase_payments` with `prisma migrate deploy` in
   the normal release (additive; no rewrite; instant on large tables because
   it only creates a new one).
3. Grant `purchases.payment.reverse` to the roles that should correct payments
   (seed adds the permission; no role receives it automatically).
4. Run the reconciliation **dry run** against the instance and review the
   exceptions with the business owner. Do not fix them automatically.
5. Only with approval: `--apply --confirm-database <name>` during a quiet
   window; keep the JSON report. Without it, legacy invoices are recorded one
   by one on first touch, which is also correct.
6. Rollback: before any manual payment exists, run the rollback SQL and mark
   the migration rolled back; afterwards, keep the table (the invoices'
   `paid_amount` stays valid either way).

Risks: the sinabe `wipe.mjs` rehearsal tool cannot delete invoices that have
payment rows; reversals in closed cases leave a closed case with a balance
(by design, with a warning); `paid_amount` remains the cache and must only be
written through the payments service (a direct SQL update would break the
invariant; the reconciliation reports it as `LEDGER_MISMATCH`).

Pending: invoice corrections, archive/logical delete, visual redesign, the
backfill approval, an automation template for the new events.
