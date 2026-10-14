# sinabe → Runly migrator (phase 3)

Date: 2026-10-14
Status: approved (autonomous roadmap mode)
Depends on: legacy import toolkit (`apps/api/src/services/legacy-import/`, spec 2026-10-14-legacy-import-toolkit-design.md),
custody records (spec 2026-10-13-inventory-custody-design.md).

## 1. Goals and constraints

- Move a sinabe instance (MySQL + local `uploads/` folder) into one Runly company,
  faithfully and idempotently, in small batches, without ever scanning or
  stressing the source network.
- Source data never leaves the customer network; output reports contain only
  counts, internal ids and error codes — never serials, asset numbers, names,
  e-mails, signatures or file contents.
- No direct connection to sinabe's database: the migrator reads a `mysqldump`
  file the operator produced on the VPS. Files come from a local staging folder
  or are fetched one by one over sinabe's own nginx (`/api/uploads/...`) with a
  bandwidth cap.
- Runs where Runly runs: `node scripts/migrations/sinabe/cli.mjs …` from the
  repo, or inside the API container (all dependencies already present; no
  `npm install`, no internet).

## 2. Components (scripts/migrations/sinabe/)

| File | Role |
|---|---|
| `dump-reader.mjs` | Streaming parser for mysqldump output (`CREATE TABLE` column order + extended `INSERT INTO … VALUES (…),(…)`; strings with escapes, NULL, numbers, `_binary`/hex blobs). Returns `{ tables: { [name]: { columns, rows: object[] } } }`; ignores other statements. |
| `source.mjs` | Typed accessors over the parsed tables for the sinabe schema (Inventory, Model, InventoryType, InventoryBrand, InventoryLocation, Condition, InventoryCondition, CustomField, InventoryCustomField, Vertical, ModelVertical, PurchaseOrder, Invoice, File, Image, User, CustodyRecord, CustodyItem, AuditLog, Project, Deadline, DeadlineTask, ProjectMember, ProjectDocument, Event, EventAttendee, `_prisma_migrations`). Tolerates missing tables/columns (older schema) and reports them. |
| `files-listing.mjs` | Reads the operator's `find -printf '%s\t%TY-%Tm-%Td\t%p'` TSV; normalizes paths (leading slash, `uploads/` prefix, backslashes). |
| `file-fetcher.mjs` | `local` mode (staging dir) or `http` mode (base URL; concurrency 1–2, bytes/s cap, pause between batches, no aggressive retries: one retry then report). Computes sha256. |
| `census.mjs` | `census` command: aggregates only (counts per table, schema version from `_prisma_migrations`, DB↔disk cross-check: referenced-missing and orphan files, size histogram, >10 MB / >50 MB counts, MIME/extension mix, path format mix, duplicate serial/asset/folio COUNTS, users without employeeNumber, invoices without XML/PDF, custody records by status). Writes `census.json` + `census.md`. |
| `plan.mjs` | Builds the batch plan (items grouped by N, default 50; `--only <legacyIds file>` for a pilot) including each batch's files and bytes. |
| `migrate.mjs` | Ordered phases per batch using the toolkit; `--dry-run` (default), `--commit`, `--verify`. |
| `report.mjs` | `report.json` + `report.md` (counts, conflicts by code with legacy ids only, warnings, files transferred/bytes/checksums mismatches, duration). |
| `synthetic.mjs` | Generates a synthetic sinabe dataset: a mysqldump-like `.sql` for the CURRENT sinabe schema (read from `D:/RacoonDevs/sinabe/backend/prisma/schema.prisma` mapping or a fixed template), N inventories (default 5000) with realistic distributions (statuses, conditions, custom fields, OCs/invoices, custody records with base64 PNG signatures, audit logs, projects, events), plus an `uploads/` tree of dummy files (`--bytes-scale` to shrink sizes) and the matching listing TSV. Includes deliberate dirty data: duplicate serials, empty/duplicate asset numbers, missing files, odd paths, a >10 MB file. All names are obviously fake. |
| `cli.mjs` | `census | plan | migrate | verify | synthetic` with flags `--dump --listing --files-dir|--files-base-url --company --actor --batch-size --only --rate --out`. Env (Runly DB/storage) from the API `.env`. |

## 3. Mapping (from the approved migration plan)

Catalogs: InventoryType→InvCategory, InventoryBrand→InvBrand, Model→InvModel
(year null), InventoryLocation→InvLocation, Condition→InvCondition.
Conditions N:M → one InvCondition (priority table: Descompuesto > En Reparación
> En Mantenimiento > Usado > Semi Nuevo > Nuevo …) + custom field
"Condiciones (sinabe)" with the full list. Verticals → custom field "Vertical"
(from the model). CustomField/InventoryCustomField → InvCustomField/Value.
Inventory: activeNumber→assetTag (empty or duplicate → internalFolio as tag and
original kept in custom field "Número de activo (sinabe)"; conflicts reported);
internalFolio → custom field "Folio interno (sinabe)"; serialNumber kept even if
duplicated; status ALTA/PROPUESTA/BAJA → registered/deregistration_proposed/
deregistered with altaDate/bajaDate (missing dates → createdAt/updatedAt,
warning); receptionDate→purchaseDate; comments→notes; details JSON → custom
fields. Images (first = cover) and Files → attachItemFile (thumbnails skipped).
PurchaseOrder → importPurchaseOrder (CLOSED); Invoice → importPurchaseInvoice
(PAID) + PDF/XML attachments + fiscal UUID from XML; item links from
Inventory.invoiceId/purchaseOrderId (+ InvItem.invoiceNumber/vendorName).
Suppliers from OC/Invoice `supplier` text → matchOrCreateSupplier.
User (as custody receiver/deliverer) → matchOrCreateEmployee (receivers);
deliverers: map to a Runly user when the operator provides a mapping file
(email → profile), else `delivererName` free text. Actor for all writes: the
`--actor` profile.
CustodyRecord COMPLETADO → importCustody COMPLETED with original PDF (from the
File row) and signatures; BORRADOR → DRAFT; current holder = latest COMPLETED
custody per item (applyAssignments only for that one); public tokens never
migrated.
AuditLog (Inventory entity) → system comments on the item with original date
(phase 3e). Projects/Deadlines/Tasks → runly.projects; Events → calendar
(phase 3e).

## 4. Order of a commit run

catalogs + custom fields → suppliers → employees → purchase orders → invoices
(+files) → items (batch by batch: item, files, relations) → custody records
(in date order) → audit comments → projects → events. Each step is idempotent
through LegacyRef; a crash resumes where it stopped.

## 5. Verification

`verify` re-reads the dump and compares every migrated record field by field
(assetTag/serial/status/dates/invoice/PO/attachment count + sha256) and prints
mismatches by code. Goal: zero mismatches before cutover.

## 6. Testing locally

`synthetic` (5000 items, scaled files) → `census` → `migrate --dry-run` →
`migrate --commit --only pilot.txt` (50 items) → full `--commit` →
`verify` against the local test company. Unit tests for dump-reader and the
mapping functions with tiny fixtures.

## 7. Rollback

`rollback --source <source>` (or `--only`) removes what the migrator created,
driven by LegacyRef in reverse order (custody → items → purchases → suppliers/
employees it created → catalogs it created), deleting the stored files. Used to
reset local synthetic runs and, if ever needed, to undo a production pilot.
Records that existed before the migration (matched, not created) are never touched.
