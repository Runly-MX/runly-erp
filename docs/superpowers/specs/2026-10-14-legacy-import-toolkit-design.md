# Legacy import toolkit (server-side helpers for faithful migrations)

Date: 2026-10-14
Status: approved (autonomous roadmap mode)
Context: phase 2 of the sinabe → Runly migration plan. The migrator script
(phase 3) needs to write historical data that the public APIs intentionally
refuse: items already deregistered on a past date, assignments that started
years ago, purchase orders already closed and invoices already paid, and signed
custody records whose original PDF must be kept byte for byte.

## 1. Principles

- Internal only: no HTTP endpoint exposes these helpers. They are called by a
  migration script that runs on the Runly server with the API's env.
- Idempotent: every created row is registered in a legacy reference table, so a
  rerun or a resume after a crash never duplicates anything.
- Faithful: original identifiers, dates, numbers, files and signatures are kept;
  nothing is regenerated (no new custody PDFs, no re-numbering of POs/invoices).
- Audited: each write leaves an audit entry with `source: '<source>'` and the
  legacy id, attributed to the migration actor profile.
- Source-agnostic naming (`source` = `'sinabe'` today) so other legacy systems
  can reuse it.

## 2. Legacy reference table

`LegacyRef` (`legacy_ref`): id uuid7, companyId, source varchar(40), entity
varchar(60), legacyId varchar(120), targetId uuid, createdAt.
Unique (companyId, source, entity, legacyId); index (companyId, targetId).
Service `createLegacyRefs({ prisma })`: `find`, `findMany`, `remember(tx, …)`,
`ensure(entity, legacyId, createFn)` (returns `{ id, created }`).

## 3. Helpers (apps/api/src/services/legacy-import/)

- `inventory-historical.js`
  - `importItem({ companyId, actorId, source, legacyId, data })`: creates an
    InvItem with any `adminStatus` (registered, registration_pending,
    deregistration_proposed, deregistered), the given `assetTag` verbatim (no
    auto tag; a duplicate tag is a reported conflict, never silently changed),
    `registeredAt`/`deregisteredAt`/`deregistrationReason`, purchase fields,
    custom field values, and InvItemAdminEvent rows with the original
    `effectiveDate` (actor null allowed, already supported by the schema).
  - `importAssignment({ itemId, employeeId, assignedAt, returnedAt, actorId })`
    using `assignItemTx`/`returnItemTx` (apps/api/src/services/inventory-assignment-tx.js).
  - `attachItemFile({ itemId, buffer, fileName, mimeType, isCover, label, legacyId })`
    → FileAsset (+ checksum) + InvItemFile; respects the 20-file cap by
    reporting overflow; files > 10 MB accepted up to a migration limit
    (default 50 MB) since they bypass `/files/upload`.
- `purchases-historical.js`
  - `importPurchaseOrder({ …, number, supplierId, issueDate, status: CLOSED|CANCELLED|ISSUED, totals?, lines? })`
  - `importPurchaseInvoice({ …, number, fiscalUuid?, supplierId, issueDate, status: PAID|PENDING|CANCELLED, totals?, purchaseOrderId? })`
  - Both create the PurchaseCase automatically (like the normal flow), skip
    approvals/policies, keep the typed number, record a stage/event "Importado
    desde <source>", and link to items with EntityRelation `PURCHASED_IN` /
    `INVOICED_ITEM` (reuse `relate()` in services/purchases-shared.js).
  - `attachPurchaseFile({ ownerType: 'purchase_order'|'purchase_invoice', ownerId, buffer, fileName, mimeType })`
    using the same metadata convention as the purchases UI attachments.
  - `extractCfdiUuid(xmlBuffer)`: reads `UUID` from `tfd:TimbreFiscalDigital`
    (no validation, plain attribute read).
- `custody-historical.js`
  - `importCustody({ companyId, actorId, source, legacyId, kind, employeeId, delivererId?, delivererName?, date, comments, status: COMPLETED|DRAFT|CANCELLED, items: [{ itemId, snapshot }], documentBuffer?, receiverSignaturePng?, delivererSignaturePng?, applyAssignments })`
    - folio allocated by the custody numbering for that date's year;
    - stores the original PDF as `documentFileId` and links it to each item;
    - signatures stored as custody signature files (PNG, from base64 in the source);
    - `applyAssignments` creates assignments with `assignedAt = date` only when
      requested (the migrator decides which custody reflects the current holder).
- `people-and-suppliers.js`
  - `matchOrCreateEmployee({ companyId, employeeNumber, email, firstName, lastName, department, jobTitle })`:
    match by employeeCode, then work/personal e-mail, then exact full name;
    creates the HrEmployee when no match; never updates existing HR data.
  - `matchOrCreateSupplier({ companyId, name })`: case/accent-insensitive name
    match on Contacts, else creates a company Contact (+ supplier profile).

## 4. Tests

Pure parts unit-tested (CFDI UUID extraction, employee matching order, status
mapping guards, idempotent ensure). One e2e script (git-ignored) that imports a
small synthetic legacy dataset twice and checks no duplicates.

## 5. Out of scope

The migrator itself (reading MySQL, batching, file transfer, reports) is phase 3.
