# runly.purchases: integrity audit, lifecycle and evolution plan

Status: phase 1 implemented and verified locally (2026-10-29); phases 2-7 are
proposals. Builds on `2026-09-30-purchases-core-redesign-design.md` and
`2026-10-15-inventory-purchase-fields-design.md`. Nothing here was deployed,
pushed or run against production data.

Evidence levels used below:
- **Verified**: read in code and exercised by a test or a local run.
- **Read**: read in code, not exercised.
- **Hypothesis**: plausible from code, not confirmed with data.

## A. Audit

### A.1 Inventory of the module

| Layer | Files |
|---|---|
| Prisma models | `prisma/schema.prisma` (`PurchaseWorkflow`, `PurchaseCase`, `PurchaseRequest`, `PurchaseQuote`, `PurchaseApproval`, `PurchaseReceipt`, `PurchaseReceiptLine`, `PurchaseSupplierProfile`, `PurchaseOrder`, `PurchaseInvoice`, `PurchaseLine`, `PurchaseStageRecord`, `EntityRelation`, `PurchaseAllocation`, `PurchaseFile`) |
| Migrations | `20260929130000_core_purchases`, `20260930120000_purchases_redesign`, `20261001120000_purchases_numbering` |
| Services | `apps/api/src/services/purchases-service.js` (workflow, capabilities, dashboard), `purchases-shared.js`, `purchase-documents-service.js` (orders, invoices), `purchase-procurement-service.js` (cases, requests, quotes, approvals), `purchase-receipts-service.js`, `purchase-relations-service.js`, `purchase-relation-cascade.js`, `purchase-relation-hydration.js`, `purchase-policies.js`, `purchase-case-bundle.js`, `purchase-listing.js`, `purchase-inventory-bridge.js`, `purchase-suppliers-service.js`, `purchase-approval-chat-service.js`, `inventory-purchase-links.js`, `inventory-purchase-uniqueness.js`, `legacy-import/purchases-historical.js` |
| Routes | `apps/api/src/routes/purchases/{index,settings-routes,documents-routes,procurement-routes,relations-routes,route-helpers,mirai-actions,mirai-capabilities,purchases-mirai-queries}.js` |
| SDK | `packages/sdk/src/index.js` (`purchases` domain) |
| Desktop | `apps/desktop/src/modules/runly.purchases/**` (screens, detail panels, editor, hooks, lib), plus `InventoryPurchaseSection.jsx` rendered inside the inventory item detail |
| Integrations | Chat entity cards (`routes/chat/chat-entity-extra-types.js`), approval cards in chat (`purchase-approval-chat-service.js`), Files visibility (`services/files/visibility.js`), Projects/tasks (`RecordTasks` on orders, `relation-targets-service.js`), automations events (`packages/module-engine/src/event-catalog.js`), module services (`module-services/work-services.js`: `runly.purchases:requests.create`), MCP (`mcp/adapters/purchases.js`, `purchases-import.js`), MirAI capabilities, global search providers, inventory form/detail blueprints (`packages/ui/src/integrations/inventory/*`) |
| Tests (before this work) | 53 node tests in `services/__tests__/purchase*`, `inventory-purchase*`, `routes/documents/__tests__/purchases-order-kind.test.js`, `desktop/.../runly.purchases/lib/__tests__` |

### A.2 The observations in the brief, checked

| Observation | Result | Evidence |
|---|---|---|
| Module has requests, quotes, approvals, orders, receipts, invoices, payments, suppliers, cases, workflows, policies, EntityRelation | Confirmed, with nuance: "payments" is a capability flag plus accumulated fields on `PurchaseInvoice`, not an entity | schema; `purchases-service.js` `CAPABILITY_KEYS` |
| Order and invoice editor only allows DRAFT | Confirmed | `purchase-documents-service.js` `update`: `if (before.status !== 'DRAFT') throw invalidTransition(...)`; same for requests in `updateRequest` |
| RelatedDocumentsPanel cannot unlink though `DELETE /purchases/relations/:id` exists | Confirmed (fixed in phase 1) | `components/detail/RelatedDocumentsPanel.jsx` had no action; route in `relations-routes.js` |
| InventoryPurchaseSection can unlink | Confirmed; so can `InventoryRelationsPanel` (document side, inventory tab) | both called `deleteRelation(id)` directly |
| Payment accumulated on PurchaseInvoice | Confirmed | `paidAmount`, `paidAt`, `paymentReference`, `paymentMethod` overwritten on each `pay`; the only per-payment trace is the audit row `metadata.amount` |
| Invoice admits one order by validation | Confirmed, enforced in three places | `validateOrderIds` (`Una factura solo puede relacionarse con una orden de compra.`), `createRelation` (`INVOICE_HAS_ORDER`), and readers that assume one order (`orderOfInvoice`, `searchDocuments.order`, `purchase-relation-cascade.js`) |
| Legacy purchase data, official relations and inventory custom fields coexist | Confirmed (three mechanisms, see A.6) | `inv_item.purchase_date/purchase_price/vendor_name/invoice_number`; `EntityRelation` `PURCHASED_IN`/`INVOICED_ITEM`; `inv_custom_field` |
| Disabling capabilities blocks reading history | Confirmed (fixed in phase 1) | every `GET` list/detail called `workflow.assertCapability(...)` → 409 `CAPABILITY_DISABLED` |
| Integrations with Chat, Files, Inventory, Contacts, Projects/tasks, Documents, automations | Confirmed; see A.7 for which are contracts and which are only proposals | |

### A.3 Findings by severity

Critical (data integrity, money):

1. **Lost update on payments** (verified, fixed). `transition('pay')` read the
   invoice outside the transaction, computed an absolute `paidAmount` and wrote
   it with `update({ where: { id } })`. Two concurrent payments both read
   `paidAmount = 0`; the second overwrote the first while both audit rows
   claimed a payment. Reproduced in principle by the E2E (two parallel `pay`
   of 60): with the fix exactly one is applied and the other answers
   `409 STALE_DOCUMENT`.
2. **Over-reception race** (verified, fixed). `receipts.create` checked the
   order status outside the transaction and read the lines inside it without a
   lock (READ COMMITTED). Two concurrent receipts of the full pending quantity
   could both pass `planReceipt` and write absolute `receivedQuantity` values.
   The comment claimed protection that the code did not give.
3. **All status transitions were last-writer-wins** (verified, fixed). Approve
   vs. cancel, or two submits, could interleave because `resolveTransition`
   validated a status read before the write.
4. **Double approval decision** (verified, fixed).
   `decideApproval` checked `status !== 'PENDING'` outside the transaction and
   then `update`d unconditionally.

High:

5. **History hidden when a capability is turned off** (verified, fixed). See
   A.2. Chat entity cards and files still opened, so the behaviour was also
   inconsistent.
6. **Unlinking deleted relations blindly** (verified, fixed). `deleteRelation`
   removed any purchases relation, including structural `CONTAINS` (case
   membership) and `RECEIVED_BY` (order to receipt), and left `INHERITED`
   copies with a dangling `sourceRelationId`.
7. **Policies with no reachable gate in the INVENTORY preset** (read). The
   `goods-receipt` policy blocks only `pay` (payments capability off in that
   preset) and case `close` (case transitions require the `requests | quotes |
   approvals` capability, off in that preset). The policy therefore blocks
   nothing a user can do.
8. **CLOSE stage unreachable in SIMPLE, BASIC and INVENTORY** (read).
   `transitionCase` asserts the case capability gate, so the required CLOSE
   stage stays pending forever in those presets.
9. **Cancel reason discarded** (verified, fixed). The confirm dialog asks for a
   comment on cancel/reject; the service ignored `payload.comment` for the
   audit. Now stored in the transition audit `metadata.comment`.

Medium:

10. **Changing the order of a draft invoice keeps inherited items** (read).
    `linkOrders` deletes the previous `BILLED_FROM` but leaves
    `INVOICED_ITEM` rows inherited from the old order.
11. **Replace and item-form flows delete relations without looking at
    dependents** (read). `createRelation({ replace: true })` and
    `preparePurchaseLinks` use `deleteMany`; derived rows keep a dangling
    `sourceRelationId`. Cascade-created `PURCHASED_IN` rows
    (`linkItemsToInvoiceOrder`, origin AUTOMATIC) carry no `sourceRelationId`,
    so the impact preview cannot list them as dependents of a `BILLED_FROM`.
12. **Cancelled documents still occupy an item's single order/invoice slot**
    (read). `itemsWithOtherDocument` ignores the document status, so after
    cancelling an order the user must unlink each item before relinking.
13. **Unlinking needs only `purchases.relation.manage`** (read): a user without
    `purchases.invoice.update` can change the evidence of a paid invoice.
14. **Payable totals in presets without payments** (read). With `payments`
    off, invoices stay `PENDING` forever and the dashboard reports them as
    payable.
15. **No receipt reversal** (read). `STATUSES.receipt` lists `CANCELLED` but no
    endpoint exists; a wrong receipt cannot be corrected.

Low:

16. Inventory capability is not asserted on unlink while it is on link
    (deliberately kept, to let users clean up after turning it off).
17. `purchases-mirai-queries.js` still gates reads by capability (MirAI
    answers "deshabilitado" for history).
18. `updated_at` is `TIMESTAMPTZ` (microseconds) and is read back truncated to
    milliseconds; any exact-equality version check would fail on rows written
    by SQL defaults. The phase 1 guard uses a 1 ms window for this reason.

### A.4 Real flows per preset

Presets are `SIMPLE`, `BASIC`, `INVENTORY`, `COMPLETE` (the brief's FULL) and
`CUSTOM` (`purchases-service.js` `PURCHASE_PRESETS`).

- **SIMPLE** (invoices + inventory relations). Invoice create (DRAFT, opens a
  case automatically) → `submit` → `PENDING`. No `pay` action (payments off),
  so an invoice never reaches `PAID`. Items are linked from the invoice
  inventory tab or the item form. Case close is not available (gate).
- **BASIC** (+ orders). Order DRAFT → `submit` → `APPROVED` (no approvals) →
  `issue` → `ISSUED` → `close`. "Registrar factura" from an issued order
  creates an invoice billed from it (`BILLED_FROM`, optional `inheritItems`).
  No receipts, so orders never reach `RECEIVED`.
- **INVENTORY** (+ receipts, goods-receipt policy). As BASIC plus partial
  receipts (`ISSUED → PARTIALLY_RECEIVED → RECEIVED`), "crear activos desde un
  concepto" (allocations). The receipt policy has no reachable gate (A.3 #7).
- **COMPLETE**. Request → (quotes) → approval → order (convert) → receipt →
  invoice → payment → case close. `REQUEST` is REQUIRED: an order created
  directly, without an approved request in its case, is blocked at `issue`
  with `POLICY_BLOCKED`. Policies: >50,000 needs approval, >10,000 needs 3
  quotes, goods need receipt.

Without external modules: Contacts is a hard dependency (suppliers).
Inventory is optional (`inventoryAvailable` degrades candidates to
`available: false`; creating items from a line answers 409). Files, Chat,
Projects and automations are optional consumers.

### A.5 Draft edits and post-registration corrections

Today the only mutation after `DRAFT` is a transition. There is no way to fix
a typo in a fiscal UUID, a due date or a supplier reference of a registered
invoice or issued order, and no way to reverse a payment or a receipt. Users
work around it by cancelling and recreating, which breaks relations and
history. Section C defines which corrections are safe; section D the API.

### A.6 Why order and invoice fields appear duplicated in Inventory custom fields

Three independent mechanisms can hold the purchase data of one item:

1. **Legacy columns** on `inv_item` (`purchase_date`, `purchase_price`,
   `vendor_name`, `invoice_number`), shown read-only as "Datos de compra
   heredados" when `hasLegacyPurchaseData`
   (`packages/ui/src/integrations/inventory/{form,detail}-blueprint.js`).
2. **Official relations** (`EntityRelation` `PURCHASED_IN` / `INVOICED_ITEM`),
   shown as the "Orden de compra" and "Factura" fields of Identificación
   (`purchaseOrderLink` / `purchaseInvoiceLink`) and in "Compras relacionadas".
3. **Custom fields** (`inv_custom_field` / `inv_custom_field_value`), shown in
   "Campos personalizados".

The duplication is (3) holding the same information as (1) or (2). The code
paths that create purchase-like custom fields:

- **sinabe migrator** (`scripts/migrations/sinabe/mapping/custom-fields.mjs`,
  `fieldDefinitions` + `migrate-catalogs.mjs`): every sinabe `CustomField` is
  copied verbatim as `sinabe_cf_<id>` and every key of the item `details` JSON
  as `sinabe_d_<key>`, with no exclusion list. At the same time the item's
  sinabe `invoiceId` / `purchaseOrderId` become official relations and
  `invoiceNumber` (`mapping/index.mjs`). A sinabe field or details key named
  like "Factura" or "OC" therefore lands twice.
- **Spreadsheet import** (`inventory-item-import-service.js`
  `ITEM_IMPORT_FIELDS`): "factura" maps to the legacy `invoiceNumber`, but
  there is no base field for a purchase order, so an "Orden de compra" column
  can only be mapped to a custom field.
- **Manual custom fields** created before the 2026-10-15 first-class fields,
  and the MCP/legacy inventory import (`legacy-import/inventory-historical.js`,
  `customValues` by `fieldKey`).

Which of these produced the duplicates in a given company is a
**hypothesis** until checked with that company's data. The local test
database does not reproduce it (one field `tiene_factura` with one value, no
legacy invoice numbers, no purchase item relations). Read-only census to run
on the affected instance (aggregates only):

```sql
SELECT f.field_key, f.label, f.enabled, f.category_id IS NULL AS global,
       COUNT(v.id) AS "values"
FROM inv_custom_field f
LEFT JOIN inv_custom_field_value v ON v.field_id = f.id
WHERE f.company_id = :company
  AND (f.label ~* '(factura|invoice|orden|o\.?c\.?\b|compra|proveedor|cfdi|uuid)'
       OR f.field_key ~* '(factura|invoice|orden|oc|purchase|compra)')
GROUP BY 1, 2, 3, 4 ORDER BY 5 DESC;
```

A `sinabe_cf_` / `sinabe_d_` prefix in the result identifies the migrator.
Nothing is hidden, merged or deleted until the equivalence inventory in E.6 is
done, backed up and approved.

### A.7 Integrations: existing contracts vs proposals

| Integration | Exists today | Proposed |
|---|---|---|
| Inventory | Relations, item form fields, summary timeline, create items from a line, allocations, one order + one invoice per item | Ignore cancelled documents in the uniqueness rule (A.3 #12) |
| Contacts | Supplier = Contact; `PurchaseSupplierProfile` adds terms/code | none |
| Files | Attachments per document (`PurchaseFile` + Files `entityType`), visibility by read permission | none |
| Chat | Entity cards for case/order/invoice; approval cards in a configured channel (`purchase-approval-chat-service.js`) | Post a card on `STALE_DOCUMENT`-free payment / reversal |
| Projects/tasks | `RecordTasks` on orders; relation targets search `purchase_order` | none |
| Documents | `routes/documents/kinds/purchases-order-kind.js` (PDF of an order) | invoice kind |
| Automations | Events `purchases.request.created`, `order.approved/updated/issued/cancelled`, `invoice.paid`; service `runly.purchases:requests.create` | `invoice.payment.recorded`, `invoice.payment.reversed`, `relation.removed` |
| MCP / MirAI | Request create, approval decide, documents import (drafts + relations), read queries | Read history with capability off (A.3 #17) |
| Notes | No purchase-specific contract found | none (out of scope) |

## B. Lifecycle model

Four independent axes per document; today only the first exists.

1. **Status** (business state, existing): see `purchase-policies.js`
   `STATUSES`/`TRANSITIONS`. `CANCELLED` is terminal and means "this purchase
   did not happen"; it never deletes data or relations.
2. **Version** (phase 1: `updatedAt` as optimistic token; phase 3: integer
   `version` + revision rows). Every write is conditional on the version read.
3. **Archive** (phase 4, proposed): `archivedAt`, `archivedById`. Only final
   documents (`CLOSED`, `CANCELLED`, `PAID`, `RECEIVED` receipts). Archived
   documents leave default lists and pickers, stay readable, linkable from
   history, restorable.
4. **Logical delete** (phase 4, proposed): `enabled = false` (project
   soft-delete convention) only for `DRAFT` documents with no dependents
   (no receipts, payments, approvals decided, inventory relations or files).
   Anything else must be cancelled instead.

Capability off = read-only: the document, its relations and its activity stay
visible; every write answers `CAPABILITY_DISABLED`.

## C. Action matrix

`U` = `purchases.<doc>.update`, `C` = `create`, `D` = `purchases.approval.decide`,
`P` = `purchases.payment.manage`, `R` = `purchases.receipt.create`,
`M` = `purchases.relation.manage`, `X` = proposed `purchases.<doc>.correct`.
Every action also requires the capability of its document (except reads).

### Orders

| Status | Allowed today | Proposed additions | Never |
|---|---|---|---|
| DRAFT | edit (U), submit (U), issue (U, policy), cancel (U) | delete (U, no dependents) | |
| PENDING_APPROVAL | approve/reject (D), cancel (U) | | edit |
| APPROVED | issue (U, policy), cancel (U) | | edit |
| ISSUED | receive (R), register invoice (invoice C), close (U), cancel (U) | correct non-financial header (X, reason); cancel only without active invoices | edit lines |
| PARTIALLY_RECEIVED | receive (R), register invoice, close (U) | reverse a receipt (R + X, reason) | cancel |
| RECEIVED | register invoice, close (U) | reverse a receipt (R + X) | cancel |
| CLOSED | read | archive/restore (U) | any write but archive |
| CANCELLED | read | archive/restore (U) | reopen |

### Invoices

| Status | Allowed today | Proposed additions | Never |
|---|---|---|---|
| DRAFT | edit (U), submit (U), cancel (U) | delete (U, no dependents) | |
| PENDING_APPROVAL | approve/reject (D), cancel (U) | | edit |
| PENDING | pay (P), cancel (U) | correct non-financial header (X) | edit lines |
| PARTIALLY_PAID | pay (P) | reverse a payment (P + X, reason) | cancel |
| PAID | read | reverse a payment (P + X); archive (U) | cancel, edit |
| CANCELLED | read | archive (U) | |

Non-financial header = `notes`, `dueDate`, `fiscalUuid`, `paymentTerms`,
`supplierReference`, `expectedDate`. Financial fields (supplier, lines,
totals, currency) after registration: cancel and recreate, or a phase 3
correction that writes a revision and re-validates receipts/payments.

### Requests, quotes, receipts, cases

Unchanged today (`TRANSITIONS`). Proposed: receipt `reverse` (creates a
negative receipt, never edits the original), case `close` available whenever
the case's documents are final, independent of the case capability (A.3 #8).

### Relations

| Relation | Unlink | Rule |
|---|---|---|
| `CONTAINS` (case → doc) | never | `RELATION_PROTECTED` (implemented) |
| `RECEIVED_BY` (order → receipt) | never | `RELATION_PROTECTED` (implemented) |
| `BILLED_FROM` (invoice → order) | M | impact preview; proposed: reason required when the invoice is PAID |
| `PURCHASED_IN` / `INVOICED_ITEM` / others | M | impact preview; dependents need `keep` or `remove` (implemented) |

## D. API contracts

Implemented in phase 1 (all company-scoped, permission-checked on the server):

- Optimistic version on writes. `PATCH /purchases/{orders|invoices}/:id` and
  `POST /purchases/{orders|invoices}/:id/transition` accept
  `expectedUpdatedAt` (the `updatedAt` the client read). A different version
  or a concurrent writer → `409 { code: 'STALE_DOCUMENT' }`. Without
  `expectedUpdatedAt` the write is still atomic against concurrent writers.
- Transition audit carries `metadata.comment` (cancel/reject reason) and
  `metadata.amount` (pay).
- `POST /purchases/approvals/:id/decide`: a decision on a no-longer-pending
  approval → `409 INVALID_TRANSITION`.
- `POST /purchases/receipts`: serialised per order (row lock).
- Reads with the capability off: `GET /purchases/{orders,invoices,receipts,
  requests,quotes,cases}` and their `/:id` answer 200 with
  `capabilityEnabled: false`. Writes keep `409 CAPABILITY_DISABLED`. The
  approvals inbox stays gated (it is an action surface).
- `GET /purchases/relations/:id/impact` (`purchases.relation.read`) →
  `{ data: { relation, protected, reason, dependents: [{ id, sourceType,
  sourceId, targetType, targetId, relationType, origin, label }],
  dependentsModes: [] | ['keep', 'remove'] } }`.
- `DELETE /purchases/relations/:id?dependents=keep|remove&reason=...`
  (`purchases.relation.manage`) → `{ success, data: { deleted, dependents:
  { mode, count } | null } }`; `409 RELATION_PROTECTED`;
  `409 RELATION_HAS_DEPENDENTS` when dependents exist and no mode is given.
  `keep` clears `sourceRelationId` on the copies (they stay linked); `remove`
  deletes them in the same transaction. Audit `purchase.relation.deleted`
  with `before` and `metadata { reason, dependents, dependentIds }`.
- SDK: `purchases.deleteRelation(id, token, { dependents, reason })`,
  `purchases.relationImpact(id, token)`.

Proposed (not implemented):

- `POST /purchases/invoices/:id/payments { amount, paidAt, method,
  reference, idempotencyKey }` → payment movement; `GET .../payments`;
  `POST /purchases/payments/:id/reverse { reason }` → compensating movement.
  `transition('pay')` stays as a compatibility alias that creates a movement.
- `POST /purchases/{orders|invoices}/:id/corrections { expectedVersion,
  changes, reason }` → revision row; `GET .../revisions`.
- `POST /purchases/receipts/:id/reverse { reason, lines? }`.
- `POST /purchases/{kind}/:id/archive`, `.../restore`, `DELETE
  /purchases/{kind}/:id` (drafts without dependents only).
- `GET /purchases/{kind}?archived=include|only`.

## E. Migration plan (no data loss)

All forward-only, new migration folders; applied migrations are never
edited. Each step ships with a read-only verification query and is applied
locally first.

1. **Payments** (`purchase_payment`): `id uuidv7`, `company_id`,
   `invoice_id`, `amount numeric(14,2)` (negative for reversals),
   `paid_at date`, `method`, `reference`, `reverses_id uuid null`,
   `idempotency_key varchar(80) null` unique with `company_id`, `origin`
   (`MANUAL | BACKFILL | IMPORT`), `created_by_id`, `created_at`. Backfill: one
   `BACKFILL` row per invoice with `paid_amount > 0` (amount = `paid_amount`,
   `paid_at`, `payment_reference`, `payment_method`). `purchase_invoice.paid_amount`
   stays as a cache recomputed in the same transaction as each movement.
   Reversible: drop the table; the cache was never removed.
2. **Versions and revisions**: `version int not null default 1` on
   `purchase_order` and `purchase_invoice`; table `purchase_document_revision`
   (`document_type`, `document_id`, `version`, `before jsonb`, `after jsonb`,
   `reason`, `actor_id`, `created_at`). Reversible: drop column/table.
3. **Archive**: `archived_at`, `archived_by_id` on orders, invoices, receipts,
   requests, cases. Default-null, reversible.
4. **Logical delete**: `enabled boolean default true` on the same tables;
   list queries add `enabled: true`. Reversible.
5. **Relation lineage**: set `source_relation_id` on new cascade-created rows
   (code change, no DDL). Old AUTOMATIC rows are left as they are.
6. **Inventory custom fields**: no DDL. (a) census query (A.6) on the real
   instance; (b) an equivalence inventory per field: target (order relation /
   invoice relation / legacy `invoice_number` / none), and per item whether
   the value equals the related document's folio; (c) backup export of the
   field values; (d) only with approval, set `enabled = false` on fields
   whose values are fully covered. Values are never deleted.
7. **Multi-order invoices / line allocation**: nullable `order_line_id` on
   `purchase_line` (invoice lines) and a workflow setting
   `multiOrderInvoices`. Compatibility matrix before enabling it:
   `validateOrderIds`, `createRelation` (`INVOICE_HAS_ORDER`),
   `orderOfInvoice` and `linkItemsToInvoiceOrder` (pick one order),
   `searchDocuments.order`, `purchase-listing` `orderNumbersOfInvoices`,
   `LinkedOrdersField`, MCP import, legacy import, help pages. Each reader
   must be changed to a list before the validation is relaxed.

## F. Phase 1 implementation (done locally, not pushed)

| Change | Files |
|---|---|
| `staleDocument`, `assertFresh`, `guardedUpdate` (status + 1 ms version window) | `services/purchases-shared.js` |
| Guarded draft edit and transitions, `capabilityEnabled` in detail, cancel/reject comment in audit | `services/purchase-documents-service.js` |
| Conditional approval decision; `capabilityEnabled` in case/request/quote detail | `services/purchase-procurement-service.js` |
| Order row lock in receipts; receipt detail readable with capability off | `services/purchase-receipts-service.js` |
| Relation impact, protected relations, dependents choice, reason | `services/purchase-relations-service.js`, `routes/purchases/relations-routes.js` |
| Reads without capability gate + `capabilityEnabled` in lists | `routes/purchases/documents-routes.js`, `routes/purchases/procurement-routes.js` |
| SDK `deleteRelation(id, token, options)`, `relationImpact` | `packages/sdk/src/index.js` |
| Desktop: send `expectedUpdatedAt` (editor captures the version at load, action bar, payment dialog); unlink with impact from Relacionados, the document inventory tab and the item's Compras section | `screens/PurchaseDocumentEditor.jsx`, `components/detail/{DocumentActionBar,PaymentDialog,RelatedDocumentsPanel,InventoryRelationsPanel,UnlinkRelationDialog}.jsx`, `components/InventoryPurchaseSection.jsx`, `hooks/usePurchases.js` |
| Tests | `services/__tests__/purchase-integrity.test.js` (new, 10 tests); `purchases-core-contract.test.js` (capability test now asserts readable history + blocked writes) |

Verification (2026-10-29):
- `node --test` over all purchases/inventory-purchase/order-kind/desktop
  purchases tests: 65/65 pass (53 before, +10 new, 1 rewritten, +1 inventory
  rule test included in the run).
- ESLint on every changed file: clean. `vite build` of the desktop app: OK.
- Local API + test company E2E (`.e2e/purchases-integrity-e2e.mjs`, git
  ignored), run twice, 25/25 PASS: stale PATCH 409; concurrent PATCH one
  wins; concurrent receipts of the full quantity → one 201, received 2 not
  4; concurrent payments of 60 → one applied, `paidAmount` 60; `CONTAINS`
  unlink 409; impact lists the inherited invoice link; unlink without choice
  409; `keep` leaves the inherited link; order list/detail and receipt detail
  readable with the capabilities off (`capabilityEnabled: false`); write 409;
  settings restored.
- Playwright UI check (`.e2e/purchases-unlink-ui.mjs`): invoice detail →
  Relacionados shows exactly one unlink button (the order; the case link is
  protected), the dialog loads the impact, cancelling keeps the link, no
  console or API errors.

Not verified: two real users in two browsers; mobile layout of the dialog;
behaviour of MirAI/MCP reads with capabilities off (unchanged, still gated).

## G. UX handoff (for the visual redesign)

Business rules live in the API; the client only reflects them. Keep these
contracts and states when redesigning.

Routes (`/app/m/runly.purchases`): `/purchases` (dashboard),
`/purchases/{cases,requests,approvals,orders,receipts,invoices,payments,
suppliers,settings}`, details `/purchases/{kind}/:id`, editors
`/purchases/{orders|invoices|requests}/new` and `/:id/edit`.

Components to keep wired (restyle freely): `PurchaseDocumentDetail`,
`DocumentHero`, `DocumentActionBar` (actions from `lib/document-actions.js`),
`PolicyAlerts`, `LinesPanel`, `InventoryRelationsPanel`,
`RelatedDocumentsPanel`, `UnlinkRelationDialog`, `ReceiveOrderDialog`,
`PaymentDialog`, `TransitionConfirmDialog`, `PurchaseDocumentEditor`,
`InventoryPurchaseSection` (inside the inventory item detail).

States the screens must render:
- `capabilityEnabled === false` on a list or detail: show the data read-only
  with a notice ("Esta función está desactivada en el flujo de compras; el
  historial sigue disponible"). Today the navigation still hides the section
  (`PURCHASES_NAV_CAPABILITY`) and the detail tabs `inventory`/`quotes` are
  hidden by `caps.has(...)`; the redesign should show them read-only instead.
- `409 STALE_DOCUMENT`: "El documento cambió mientras trabajabas en él" with a
  reload action; do not retry automatically. Always send `expectedUpdatedAt`
  = the `updatedAt` the user saw (editor: the version loaded into the form).
- `409 POLICY_BLOCKED` with `reasons[]`, `409 INVALID_TRANSITION`,
  `409 CAPABILITY_DISABLED`, `403 FORBIDDEN`.
- Unlink: always open `UnlinkRelationDialog` (or an equivalent that calls
  `relationImpact` first). `protected: true` → explain `reason`, no confirm.
  `dependents.length > 0` → require a keep/remove choice. Optional reason
  (max 500).
- Cancel/reject: the comment field is now stored; label it "Motivo".

Scenarios to design and test: draft edited in two tabs; double click on
"Registrar pago"; partial payments; partial receipts; capability turned off
with history present (SIMPLE preset with old orders); invoice linked to an
order then unlinked; item whose order is cancelled; item with legacy purchase
data + relations + purchase-like custom fields; user with
`purchases.relation.read` but not `manage`; company without Inventory.

## H. Status summary

| Item | Implemented | Tested | Notes |
|---|---|---|---|
| Lost-update protection on payments and transitions | yes | unit + E2E | |
| Receipt serialisation per order | yes | E2E | |
| Approval double decision | yes | unit | |
| Historical reads with capability off | yes (API) | unit + E2E | navigation and tabs still hidden in the UI (G) |
| Relation impact / protected / dependents | yes | unit + E2E + UI | |
| Unlink from both ends in UI | yes | UI (document side) | item-side dialog not exercised in a browser |
| Cancel/reject reason in audit | yes | unit | |
| Individual payments and reversals | no | | phase 2 (E.1) |
| Post-registration corrections and revisions | no | | phase 3 (E.2) |
| Archive / restore / logical delete | no | | phase 4 (E.3, E.4) |
| Custom field duplication | diagnosed in code | | needs census on the real instance (A.6, E.6) |
| Multi-order invoices, line allocation | no | | phase 5 (E.7) |
| Findings A.3 #7, #8, #12, #17 and UI history (G) | yes (2026-10-29) | unit + E2E + UI | see `2026-10-29-purchases-phase2-operational-flow.md` |
| Findings A.3 #10, #11, #13-#15 | no | | backlog |
