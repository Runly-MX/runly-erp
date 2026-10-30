# runly.purchases: UX/UI handoff for the visual redesign (phases 1-4)

Audience: whoever redesigns the Compras screens. Supersedes section G of
`2026-10-29-purchases-integrity-audit.md`. Business rules live in the API;
the screens only reflect them. Restyle freely, but keep every contract,
state and action listed here working. All UI text in Spanish; build on
`@runly/ui` (Dialog, ConfirmDialog, TextField/TextareaField/DateField with an
`id` so labels bind, Alert, DataTable, Tabs, EmptyState, ErrorState).

## 1. Routes and screens

Base `/app/m/runly.purchases/purchases`:
- `/` dashboard; `/cases`, `/requests`, `/approvals`, `/orders`, `/receipts`,
  `/invoices`, `/payments`, `/suppliers`, `/settings` lists;
- `/{kind}/:id` detail (`PurchaseDocumentDetail`), `/{orders|invoices|requests}/new`
  and `/:id/edit` editor (`PurchaseDocumentEditor`).
- Inside Inventario: the item's "Compras relacionadas" section
  (`InventoryPurchaseSection`) and the order/invoice fields of the item form.

## 2. Components to keep wired

| Component | Contract |
|---|---|
| `DocumentActionBar` + `lib/document-actions.js` | actions from status, capabilities and permissions; two visible buttons, the rest in "Más acciones"; sends `expectedUpdatedAt` (+ `expectedVersion` where available) |
| `TransitionConfirmDialog` | `confirm.comment`, `commentRequired`, `payload` (close short) |
| `ReadOnlyNotice` | lists and details whose capability is off |
| `RelatedDocumentsPanel`, `InventoryRelationsPanel`, `UnlinkRelationDialog` | unlink always previews the impact first |
| `PaymentsPanel`, `PaymentDialog` | invoice payments ledger (phase 3) |
| `CorrectionDialog`, `RevisionsPanel` | corrections of registered orders/invoices (phase 4) |
| `ReceiptReversalDialog`, `ReceiptReversalsPanel` | receipt reversals (phase 4) |
| `PolicyAlerts`, `DocumentHero`, `LinesPanel`, `ReceiveOrderDialog` | unchanged contracts |

## 3. Fields the API returns for the screens

| Where | Field | Use |
|---|---|---|
| any list / detail | `capabilityEnabled` | false → read-only (notice, no create/actions) |
| `GET /purchases/capabilities` | `history.{cases,requests,orders,receipts,invoices,payments}` | keep a disabled section reachable when it has documents |
| order/invoice detail | `version` (null before the migration), `updatedAt` | optimistic lock: send `expectedVersion` and `expectedUpdatedAt` |
| order detail | `receipt: { state, label, pendingLines }` | reception badge; "Cerrar con faltantes" when goods are pending |
| order/invoice detail | `correction: { fields: [{ field, label, type, max, value, note }], locked: [{ field, label, reason }] }` | the correction form; empty fields → no "Corregir datos" |
| case detail | `closure: { ready, outcome, openDocuments, blockers, automatic }` | why a case can or cannot close |
| receipt detail | `reversal: { available, lines, reversals, blockers, warnings, fullyReversed }` | reversal dialog and history |
| `GET /purchases/invoices/:id/payments` | `summary { total, paid, balance, unrecordedLegacy, capabilityEnabled, ledgerAvailable, version }`, `payments[]` | payments tab |
| `GET /purchases/{orders|invoices}/:id/revisions` | `{ available, version, revisions[] }` | corrections tab |
| `GET /purchases/relations/:id/impact` | `{ protected, reason, dependents, dependentsModes }` | unlink dialog |

## 4. States every screen must render

- Loading (skeletons), error with retry (`ErrorState`), empty (`EmptyState`).
- Read-only with the capability off: data visible, a notice, no create or
  write actions (history tabs stay).
- Conflict `409 STALE_DOCUMENT`: "El documento cambió mientras trabajabas en
  él / Otra persona cambió este documento…" with reload; never retry
  automatically; keep what the user typed.
- Network error without HTTP status on payments/reversals: "Puedes reintentar
  sin riesgo de duplicarlo" (same operation key).
- Policy `POLICY_BLOCKED` with `reasons[]`; `RECEIPT_PENDING`;
  `CASE_HAS_OPEN_DOCUMENTS` with `reasons[]`; `DOCUMENT_CANCELLED`;
  `ITEM_LINK_EXISTS`; `RELATION_PROTECTED`; `RELATION_HAS_DEPENDENTS`;
  `FIELD_NOT_CORRECTABLE` / `FIELD_LOCKED_IN_STATUS` (with `field`);
  `DUPLICATE_NUMBER`; `NO_CHANGES`; `PAYMENT_ALREADY_REVERSED`;
  `IDEMPOTENCY_KEY_REUSED`; `ORDER_CLOSED`, `CASE_CLOSED`,
  `RECEIPT_HAS_ASSETS` (with `dependencies[].items`), `NOTHING_TO_REVERSE`;
  `*_UNAVAILABLE` (instance not migrated yet: explain, no action).
- The server messages are already user-facing Spanish; show them as given.

## 5. Actions and rules by document (what the UI offers)

| Document | Actions (each also needs its permission) |
|---|---|
| Order | Enviar, Aprobar/Rechazar, Emitir, Registrar recepción, Registrar factura, Cerrar / Cerrar con faltantes (reason), Cancelar (reason), Editar borrador, Corregir datos |
| Invoice | Registrar, Aprobar/Rechazar, Registrar pago, Reversar pago (reason), Cancelar (reason), Editar borrador, Corregir datos |
| Receipt | Reversar recepción (partial or total, reason) |
| Case | Cerrar (manual mode), Cancelar, Reabrir; closes by itself in presets without the case capability |
| Relations | Relacionar, Cambiar (keeps cancelled links as history), Quitar relación (impact first) |

Corrections allowed after registration: order folio, supplier reference,
notes, expected date (while waiting for deliveries), payment terms (no
payments yet); invoice supplier folio, notes, due date (while there is a
balance). Never: supplier, currency, lines, quantities, amounts, taxes,
issue date, CFDI UUID, payments.

## 6. Scenarios to design and test

1. Draft edited in two tabs; correction of the same version by two people.
2. Double click and lost connection on "Registrar pago" and on reversals.
3. Partial payments, payment reversal, legacy "Pagado histórico sin desglose".
4. Partial receipt, close short with reason, partial and total receipt
   reversal, reversal blocked by a linked asset, closed order or closed case.
5. Capability off with history (SIMPLE preset with old orders): sidebar
   entry, list, detail, tabs and item timeline read-only.
6. Item whose order was cancelled: field empty, history kept, "Relacionar"
   offered again.
7. Correction of a paid invoice (folio only) and of a closed order.
8. Reader permissions (history visible, no actions), 390 px phone, dark mode.

## 7. Evidence available

Disposable-stack UI scripts (git-ignored, under `.e2e/`):
`purchases-payments-real.mjs` (29 checks) and `purchases-corrections-real.mjs`
(30 checks); dev-server scripts `purchases-phase2-ui.mjs`,
`purchases-unlink-ui.mjs`; screenshots under `.e2e/shots/`. Re-run them after
the redesign: they use roles, labels and field ids, not styles.
