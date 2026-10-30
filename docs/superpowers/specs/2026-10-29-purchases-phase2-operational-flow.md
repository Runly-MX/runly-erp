# runly.purchases phase 2: operational flow, closure, cancelled links, history

Status: implemented and verified locally (2026-10-29). Not pushed, not
deployed, no migration. Follows `2026-10-29-purchases-integrity-audit.md`
(phase 1, commit 78fa9400f). This phase is not the "individual payments"
phase of that plan; see the plan file for the renumbering.

## 1. Diagnosis

### 1.1 Receipt policy (INVENTORY) was ineffective

- The `goods-receipt` policy (`hasGoods → RECEIPT`) is evaluated by
  `policyBlockers` only before `PAYMENT` (invoice `pay`) and `CLOSE` (case
  `close`). INVENTORY has `payments` off, and case transitions required the
  `requests | quotes | approvals` gate (off). The policy blocked nothing a user
  could do.
- `receivedAll` required goods lines on every non-cancelled order: a
  services-only order, or an order still in draft, counted as "not received"
  forever, so the requirement could never be satisfied in mixed cases.
- Closing an order with goods still pending was allowed silently.

### 1.2 CLOSE unreachable in SIMPLE, BASIC, INVENTORY

`transitionCase` asserts the case gate, which those presets turn off; there
was no automatic close. The required CLOSE stage stayed pending forever.
Manual close (COMPLETE) only checked policies, so a case could be closed with
an issued order still open.

### 1.3 Cancelled order kept the item's single slot

`itemsWithOtherDocument` counted relations of cancelled documents. Effects:
an item could not take a new order after its order was cancelled; the
invoice→order cascade skipped it; the item card offered "Cambiar" (whose
`replace` deleted the historical link); the item form field showed the
cancelled document and clearing it deleted the history. The uniqueness
check also ran outside the write transaction, so two concurrent links could
both pass.

### 1.4 History hidden in the UI with a capability off

Phase 1 opened the API reads, but the UI still hid it: sidebar entries
(`PURCHASES_NAV_CAPABILITY`), list screens ("Esta sección no está activa"),
detail tabs (inventory/quotes gated by `caps.has`), actions not gated by the
document's capability, the item's Compras section (hidden entirely when
`inventoryRelations` was off), the item timeline (dropped disabled stages)
and MirAI search (`assertCapability`).

### 1.5 Phase 1 defect found by the new UI tests

`UnlinkRelationDialog` never passed `onConfirm` to `ConfirmDialog`: confirming
did nothing (the phase 1 UI test only clicked "Cancelar"). Fixed.

## 2. Decisions

### 2.1 Reception

- Pure helpers in `purchase-policies.js`: `orderReceiptState(order, lines)` →
  `NOT_APPLICABLE` (services only), `NOT_ISSUED`, `PENDING`, `PARTIAL`,
  `COMPLETE`, `CLOSED_SHORT`, `CANCELLED`, with Spanish labels
  (`RECEIPT_STATE_LABELS`) and `pendingLines`; `caseReceiptStatus(bundle)`.
- `receivedAll` = no issued goods order still waiting. Services-only and
  not-yet-issued orders never block. `CLOSED_SHORT` counts as resolved.
- Issuing an order never waits for a receipt.
- Validation point: **closing an order** (when the `receipts` capability is
  on) with goods pending answers `409 RECEIPT_PENDING`; the user may close
  short with `{ closeShort: true, comment }` (reason required, `400` without
  it). The audit stores `metadata.closedShort: [{ lineId, pending }]`. Also
  enforced, as before, before payment (policy) and at case close.
- Order detail exposes `receipt: { state, label, pendingLines }`. The ribbon
  shows RECEIPT as `skipped` when the live orders are services only.

### 2.2 Case closure (`services/purchase-case-closure.js`)

- Final documents: orders `CLOSED | CANCELLED`; invoices `PAID | CANCELLED`,
  or `PENDING` when the `payments` capability is off; requests `ORDERED |
  REJECTED | CANCELLED`; approvals not pending.
- `caseClosureCheck(workflow, bundle)` → `{ ready, outcome, openDocuments,
  blockers, automatic }`. Ready = at least one document, all final, no policy
  blocker before CLOSE. All documents cancelled → outcome `CANCELLED`.
- **Automatic** when the case gate is off (SIMPLE, BASIC, INVENTORY, CUSTOM
  without requests/quotes/approvals): inside the transaction of a document
  transition, the case row is locked (`FOR UPDATE`), the bundle reloaded with
  the transaction client, and the case closed or cancelled. Audit
  `purchase.case.auto_closed` / `auto_cancelled` with `metadata.trigger`.
  Broadcast `purchase.case.auto_closed`.
- **Manual** when the case gate is on (COMPLETE): the existing action, now
  also refusing open documents with `409 CASE_HAS_OPEN_DOCUMENTS` and one
  `reasons[]` entry per document. No automatic close in this mode.
- Reopen changes only the case (status, `closedAt`); documents are never
  touched (tested).
- Case detail exposes `closure`.

### 2.3 Live vs historical links (no migration)

- A link is **live** when its document is not `CANCELLED`; otherwise it is
  **history**. Derived from the document status, so no schema change and no
  data rewrite. Orders and invoices cannot be reactivated today (`CANCELLED`
  is terminal); if reactivation is ever added it must re-run the uniqueness
  check (documented risk).
- Uniqueness (`inventory-purchase-uniqueness.js`) counts live documents only.
  `lockItemLinks` takes per-item advisory locks in one ordered statement;
  `assertItemsFreeInTx` re-checks inside the write transaction (create
  relation, bulk, create document with items, item form).
- New links to a cancelled order/invoice, and invoices billed from a
  cancelled order, answer `409 DOCUMENT_CANCELLED`.
- "Cambiar" (`replace: true`) removes only live links of the other documents,
  detaches their derived copies, keeps cancelled links, and audits `before`.
- Item form fields and list columns show the live document only; changing or
  clearing them never removes history. The item card offers "Relacionar"
  again when the only order/invoice is cancelled.
- Cancel confirmation text explains that linked items keep the reference as
  history and become free.

### 2.4 History with a capability off

- `GET /purchases/capabilities` adds `history: { cases, requests, orders,
  receipts, invoices, payments }` (`purchaseHistoryFlags`, one indexed probe
  per kind in parallel, cached 60 s per company).
- `/runtime/modules` keeps a sidebar entry whose capability is off while the
  company has documents of that kind (`isPurchasesNavVisible(path, caps,
  history)`). The approvals inbox stays gated (action surface).
- List: read-only notice (`components/ReadOnlyNotice.jsx`), no create button.
- Detail: notice, no actions (`getDocumentActions` returns none when
  `capabilityEnabled === false`), attachments read-only, inventory/quotes tabs
  visible when they hold data but without add/unlink/manage.
- Editor of a disabled kind: unchanged "not available" state (verified).
- Item Compras section: when `inventoryRelations` is off, the timeline stays
  visible read-only (no create/link/unlink). The summary timeline keeps a
  disabled stage when it has documents (`enabled: false`).
- MirAI `purchases_search_documents` answers history with a `nota` instead of
  an error; MCP lists `purchases_spend_summary` regardless of capabilities.
  Permissions, company scoping and write gates are unchanged.

## 3. Flow matrix (as implemented)

| Preset | Capabilities | Main path | Receipt rule | Case close | Capability off |
|---|---|---|---|---|---|
| SIMPLE | invoices, inventoryRelations | invoice DRAFT → submit → PENDING | n/a (no orders) | automatic when the invoice is registered | orders/receipts/cases read-only if they have history |
| BASIC | + purchaseOrders | order → issue → close; invoice registered | none (receipts off) | automatic when orders are closed/cancelled and invoices registered (INVOICE required) | as above |
| INVENTORY | + receipts, goods-receipt policy | order → issue → receipts (partial/complete) → close (or close short with reason); invoice registered | close needs full reception or close short; services-only orders exempt | automatic once orders are closed and invoices registered | as above |
| COMPLETE (FULL) | all | request → quotes → approval → order → receipt → invoice → payment | close needs reception or close short; payment blocked by the policy until received | manual; refused with open documents or policy blockers | n/a (all on) |
| CUSTOM | any | per stages | receipt rule only if `receipts` on | automatic if requests, quotes and approvals are all off; manual otherwise | sections with history stay readable |

Invoice finality follows `payments`: with payments on, a registered invoice
waits for its payment before the case can close.

## 4. Verification (2026-10-29)

- `node --test` purchases suites (API services, purchases routes, documents
  kind, desktop purchases lib, inventory rule): **96/96 pass**. New:
  `services/__tests__/purchase-flow.test.js` (12), additions to
  `purchase-integrity.test.js`, `inventory-purchase-uniqueness.test.js`,
  `purchase-relation-cascade.test.js`, desktop `document-actions.test.js`,
  `inventory-purchase-meta.test.js`; `routes/purchases/__tests__/purchases-mirai.test.js`
  updated to the new history contract.
- Whole API suite: 2921/2928 pass; the 4 failing tests are
  `routes/calls/__tests__/call-transcript-analysis-service.test.js`,
  `contacts-proposal-module.test.js` and `module-runtime-catalog.test.js`,
  which import nothing from Compras (not re-run against the base commit).
- ESLint on all changed files: clean. Desktop `vite build`: OK.
- API E2E against the local API and the test company
  (`.e2e/purchases-phase2-e2e.mjs`, git-ignored): **34/34 PASS, twice**:
  issue without receipt; `RECEIPT_PENDING`; partial receipt; close short
  400/200 and `CLOSED_SHORT`; services-only `NOT_APPLICABLE` and skipped
  ribbon; auto-close on invoice registration; open case stays open; all
  cancelled → `CANCELLED`; manual close 409 then 200; reopen leaves documents
  untouched; second live order 409; relink after cancel; history kept; item
  field shows the live order; `DOCUMENT_CANCELLED`; concurrent links one 201
  one 409; replace keeps the cancelled link; history flags; sidebar keeps
  Órdenes; timeline keeps the disabled stage; create blocked; settings
  restored. Phase 1 E2E re-run: 25/25.
- UI (Chromium, `.e2e/purchases-phase2-ui.mjs`): **15/15 PASS, twice**:
  unlink from the inventory item page (confirm, data removed, section
  refreshed); impact error (message, confirm disabled), slow impact (confirm
  disabled while loading, then enabled); two browser contexts on one draft
  (A saves, B gets "El documento cambió…", A's change kept, B's text not
  lost); mobile 390 px (no horizontal scroll, dialog fits); read-only list,
  detail and sidebar with orders off; no editor for a disabled kind.
- Isolation: impact and delete of a relation of another company from the test
  company → 404, no change (read-only check on a real MIGRATED row).

Not verified: two different user accounts (both contexts used the E2E user);
a physical phone (Chromium emulation only); MCP tools end to end (unit level
only); automations consuming `purchase.case.auto_closed` (broadcast only, no
domain event added).

## 5. Compatibility and risks

- **Behaviour changes** (intended): closing an order with goods pending needs
  `closeShort` + reason when receipts are on; manual case close refuses open
  documents; cases auto-close in presets without the case gate; items whose
  only link is cancelled show an empty order/invoice field; MirAI search
  answers history instead of an error. API shapes only gained fields.
- Existing open cases are not closed retroactively: auto-close runs on the
  next document transition of the case. A one-off evaluation of all open
  cases would change production data and is **pending approval** (proposal:
  dry-run report first).
- If payments are enabled after a case auto-closed with `PENDING` invoices,
  the case stays closed while the invoice is paid later (not reopened).
- History flags are cached 60 s per process.
- Lock order is always document row → case row (transitions) or item
  advisory locks alone (links), so the new locks do not create cycles with
  each other; receipts lock only the order row.

## 6. Pending

- Dry-run report + approved backfill for open cases that are already final.
- Receipt reversal; individual payments and reversals; post-registration
  corrections; archive/restore (plan phases 3+).
- Audit findings still open: A.3 #10 (draft invoice changing order keeps
  inherited items), #13 (unlink permission), #14 (payable totals without
  payments).
- Domain event for automatic case closure if automations need it.
- Visual redesign (spec G of the audit; new states: read-only notice, close
  short, `RECEIPT_PENDING`, `CASE_HAS_OPEN_DOCUMENTS`, `DOCUMENT_CANCELLED`).
