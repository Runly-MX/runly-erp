# runly.inventory — Resguardos (custody records) with company templates

Date: 2026-10-13
Status: approved (autonomous roadmap mode)
Related: sinabe → Runly migration (plan `2026-10-13-sinabe-migration.md`, later phases)

## 1. Problem

`InvAssignment` records item → employee with dates only. Organizations that hand
equipment to staff need a formal *resguardo*: a numbered document listing the
items (type/brand, model, serial, asset tag, invoice, features), signed by the
employee who receives and the person who delivers, rendered in the company's own
format (Word/Excel template with logo, policy text, form code). The legacy
system being migrated (sinabe) already does this with a docxtemplater template
plus a 24 h public signing link; Runly must offer it generically so any company
can upload its own template.

## 2. Scope

In:
- Custody record lifecycle: DRAFT → PENDING_SIGNATURE → COMPLETED, CANCELLED.
  Kind `DELIVERY` (assigns items) and `RETURN` (returns items).
- Item snapshot at signing time (what was signed never changes).
- Signatures (receiver, deliverer) captured on canvas, stored as private PNG
  files (never base64 in the DB).
- Public signing link (token, expiry, minimal data, rate limited).
- Per-company document templates (`.docx` via docxtemplater, `.xlsx` via exceljs)
  with a documented placeholder contract; validation on upload.
- PDF conversion through Collabora `convert-to` when Office is configured;
  otherwise the filled DOCX/XLSX is the final document.
- Generated document stored as a FileAsset and linked to every item (InvItemFile)
  and to the custody record.
- Optional e-mail of the final document to the employee (existing SMTP service).
- Import hook for migrated records (`source = 'sinabe'`, `legacyId`, original
  PDF kept, no regeneration).

Out: multi-step approvals, bulk custody of hundreds of items (cap 200 per
record), editing completed records (only cancel + new record).

## 3. Data model (new forward migration)

`InvCustody` (`inv_custody`)
- id uuid7, companyId, folio (unique per company), sequence int
- kind `DELIVERY|RETURN`, status `DRAFT|PENDING_SIGNATURE|COMPLETED|CANCELLED`
- employeeId → HrEmployee (Restrict), delivererId → UserProfile? ,
  delivererName varchar(200)? (free text for migrated records / external staff)
- date (effective date), comments varchar(2000)?
- publicTokenHash char(64)? unique, tokenExpiresAt?
- receiverSignatureFileId?, delivererSignatureFileId?, receiverSignedAt?,
  delivererSignedAt?
- documentFileId?, templateId? → InvDocumentTemplate (SetNull)
- source `runly|sinabe` default runly, legacyId varchar(64)? (unique with companyId)
- createdById → UserProfile, completedAt?, cancelledAt?, cancelReason?
- createdAt, updatedAt

`InvCustodyItem` (`inv_custody_item`)
- id, custodyId (Cascade), itemId → InvItem (Restrict), assignmentId? → InvAssignment (SetNull)
- snapshot: typeBrand, model, serialNumber, assetTag, invoiceNumber, features
- sortOrder; unique (custodyId, itemId)

`InvDocumentTemplate` (`inv_document_template`)
- id, companyId, kind `custody` , format `docx|xlsx`, name, fileAssetId,
  placeholders Json (detected tags), isDefault, enabled, createdById, timestamps

Folio: `InstanceConfig`-free; per-company counter computed in a transaction with
`pg_advisory_xact_lock` (same pattern as purchases numbering,
`services/purchases-shared.js`). Format `RES-YYYY-NNNN` (`DEV-` for RETURN).

The public token is stored hashed (sha256); the clear token only appears in the
link returned to the creator.

## 4. Template contract

Placeholders use `{{ }}` delimiters (docxtemplater `delimiters: {start:'{{', end:'}}'}`).

| Tag | Value |
|---|---|
| `folio`, `date`, `kind` | record data (`date` formatted dd/mm/yyyy) |
| `receiverName`, `receiverEmployeeNumber`, `receiverDepartment`, `receiverJobTitle`, `receiverEmail` | employee |
| `delivererName` | user profile name or free text |
| `comments` | record comments |
| `{{#items}}…{{/items}}` with `typeBrand`, `model`, `serialNumber`, `assetNumber`, `invoiceNumber`, `features`, `index` | snapshot rows (padded to `minRows`, default 2) |
| `{{%receiverSignature}}`, `{{%delivererSignature}}` | signature images (220×88 px) |
| `company.name`, `company.legalName`, `company.taxId` | company |

XLSX: the engine scans cells; a row containing `{{#items}}` is the item row
template and is repeated; scalar tags replaced in place; signature tags insert
images anchored at the cell.

Unknown tags are reported as warnings at upload; malformed templates (docxtemplater
compile error) are rejected with a Spanish message.

Templates are tenant data. No company-specific template is committed to the repo;
tests use a synthetic template built in the test.

## 5. API

Authenticated (`/inventory/...`, permissions in manifest):
- `GET /inventory/custodies` (filters: status, employeeId, itemId, q) — `inventory.custody.read`
- `GET /inventory/custodies/:id` — read
- `POST /inventory/custodies` {kind, employeeId, date?, comments?, itemIds[], templateId?} — `inventory.custody.manage`
- `PATCH /inventory/custodies/:id` (DRAFT only)
- `POST /inventory/custodies/:id/signatures` {role: receiver|deliverer, pngBase64}
- `POST /inventory/custodies/:id/public-link` → {url, expiresAt} (moves to PENDING_SIGNATURE)
- `POST /inventory/custodies/:id/complete` → generates document, applies assignments/returns
- `POST /inventory/custodies/:id/cancel` {reason}
- `GET /inventory/custodies/:id/document` → signed URL of the final file
- `POST /inventory/custodies/:id/preview` → renders the document without completing
- `GET|POST|PATCH|DELETE /inventory/document-templates` — `inventory.template.manage` (read with custody.read)

Public (no auth, rate limited per IP, 24 h default expiry):
- `GET /public/inventory/custody/:token` → {folio, date, company name, receiver name, items (typeBrand, model, serial, assetTag), status}
- `POST /public/inventory/custody/:token/sign` {pngBase64} → stores receiver signature; token stays valid until completion or expiry

Complete rules: DELIVERY requires every item registered, enabled, and not
assigned to someone else (items already assigned to the same employee are
accepted and keep their assignment); RETURN requires every item currently
assigned to that employee. Requires receiver signature unless `allowUnsigned`
(permission manage + explicit flag, recorded in the audit log). Assignments are
created with `assignedAt = custody.date`.

## 6. UI (Spanish)

- Navigation entry "Resguardos" (`/inventory/custodies`).
- List screen (`PageHeader`, `RunlyTable`): folio, tipo, colaborador, artículos, estado, fecha.
- Editor sheet: employee combobox, kind, date, items picker (search by name/tag/serial), comments, template select; signatures section (canvas `SignaturePad` for deliverer and receiver, or "Enviar enlace de firma" with copy button); preview; "Completar" with `ConfirmDialog`.
- Detail: status, items snapshot, signatures, download document, cancel.
- Public page `/sign/custody/:token` (no shell): items list, policy note, signature pad, submit.
- Catalogs → "Plantillas" tab: upload .docx/.xlsx, default flag, warnings list, placeholder reference.
- Item detail and employee widget: list of custody records.

New `@runly/ui` component `SignaturePad` (canvas, pointer events, clear, toPng).

## 7. Security / privacy

- Public endpoint returns minimal data; no employee number/email; token hashed; expiry enforced; rate limit.
- Signature PNG ≤ 300 KB, validated PNG magic bytes.
- Files private bucket; downloads via signed URL.
- Audit log entries for create/complete/cancel/sign.

## 8. Verification

- Unit: template engine (docx + xlsx) with synthetic templates, no `{{` left; custody service transitions and conflicts; token expiry; folio sequence.
- Lint, build, boot smoke against the running API.
- Playwright: create → public sign → complete → download.

## 9. Revision 2 (2026-10-13, user feedback after first browser test)

1. **Templates without tags.** A template with zero `{{ }}` tags is accepted but
   carries the warning "La plantilla no contiene etiquetas {{…}}; el documento se
   generará sin datos." (computed at upload and when serializing existing rows).
   The templates table shows the detected tag count.
2. **Theme-aware signature pad, print-ready output.** The pad follows the app
   theme (surface/foreground tokens); the exported PNG is always re-rendered as
   dark strokes (`#111827`) on a transparent background so it prints correctly
   in the template.
3. **Richer public signing page.** Public GET adds `delivererName`,
   `receiverDepartment`, `receiverJobTitle`, `itemCount`, `companyLogoUrl`
   (signed, optional) and per item `invoiceNumber`, `features`, `index`.
   Employee number and e-mail stay private.
4. **Editable until completion.** The detail screen is the editor: while
   DRAFT or PENDING_SIGNATURE the user edits comments, date, employee,
   deliverer, template and items (add/remove) inline. `PATCH` is allowed in both
   states; changing kind, employee or items clears captured signatures (status
   stays PENDING_SIGNATURE if a link exists); comments/date/template do not.
   Creation is a minimal sheet (kind + employee) that lands on the detail.
5. **Deliverer is a Runly user.** `delivererId` defaults to the current user.
   Choosing another user requires the new permission
   `inventory.custody.deliver_on_behalf` ("Generar resguardos a nombre de otra
   persona"). `GET /inventory/custodies/deliverers` lists eligible users
   (company members, never bots) with `hasSavedSignature` and `allowDelegation`.
6. **Saved user signature (reusable across modules).** New table
   `UserSignature` (userProfileId unique, fileAssetId, allowDelegation,
   updatedAt). Endpoints `GET|PUT|PATCH|DELETE /profile/me/signature`
   (`PUT {pngBase64, allowDelegation?}`, `PATCH {allowDelegation}`; GET returns
   `{ signature: { url, allowDelegation, updatedAt } | null }`). Custody
   `POST /signatures {role:'deliverer', useSaved:true}` copies the deliverer's
   saved signature: allowed for one's own signature, or for another user's when
   the caller has `deliver_on_behalf` **and** that user enabled
   `allowDelegation`. Every use is audited ("firma aplicada por …").
7. **Send the link.** `POST /public-link {sendEmail?: true}` also e-mails the
   link to the employee (best effort) → adds `emailSent`.
