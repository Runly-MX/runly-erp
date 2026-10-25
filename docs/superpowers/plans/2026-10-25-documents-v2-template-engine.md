# Documents v2: the template engine for every module

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. First action when executing: copy this file to `docs/superpowers/plans/2026-10-25-documents-v2-template-engine.md`.

**Goal:** `runly.documents` becomes the single engine that other modules (inventory custody, LMS certificates, HR, purchases, fleet, Growth, any Builder module) call to manage and fill templates. Users UPLOAD their own Word, Excel, PowerPoint or PDF as the template; the engine detects fields, lets the user map them, and fills them. Output is whatever the module asks for (same format, or PDF).

**Architecture:** Three layers.
1. Engine (in `apps/api/src/services/document-templates/*`, already shared by inventory and LMS): docx/xlsx/pptx fill, `suggestDocxTagsWithLabels`, PDF field detection (`pdf-text-items.js` + the LMS `lms-cert-pdf-layout.js` approach, to be lifted out of LMS), `pdf-convert.js`.
2. Hub (`runly.documents`): owns template storage (files, versions, detected fields, mapping), generation history (`GeneratedDocument`) and the management UI.
3. Template kinds: each consuming module registers a *kind* (a contract) instead of building its own template feature. A kind declares: key (`inventory.custody`, `lms.certificate`, `growth.lead`...), allowed input formats, field schema (tags with labels, types, loops, image fields such as signatures), label vocabulary for auto-tagging, a built-in default template, a data loader, and a permission. The existing `document-provider-registry` (`sourceType`, `permissionKey`, `getSchema()`, `load()`) is the seed; it is extended into the kind registry.

Modules call `documentsEngine.generate({ kind, templateId?, data|sourceId, output })` and embed a shared `TemplateManager` UI component (a kind-scoped version of the hub screen) inside their own settings, so users never leave inventory/LMS to manage templates, matching the existing `AttachmentsPanel` rule.

**Tech Stack:** Node/Hono, Prisma (forward migrations only), docxtemplater/exceljs/pizzip/pdf-lib/pdfjs, Collabora (convert and visual editing), React + `@runly/ui`, `node --test`.

---

## Decision

Redesign, do not delete and do not build per-module template features. Evidence: Documents' only consumer is Growth; its block builder outputs PDF only and is the wrong model. Meanwhile the good template work was built twice in modules (inventory `InvDocumentTemplate`, LMS `LmsCertificateTemplate`) on a shared engine folder. The fix is to give that engine an owner (Documents), a kind registry, one storage model, and one UI.

## Scope and phasing

Each phase ships working software and is its own commit series. Phases 1 and 2 are the core; 3-5 can follow in separate sessions.

- Phase 1: Hub storage, kind registry, upload (docx/xlsx/pptx/pdf), detection, mapping, generate, hub UI.
- Phase 2: Inventory custody adopts the hub (first real consumer, the proven flow).
- Phase 3: LMS certificates adopt the hub (docx/pptx/pdf sources; the `design` source stays in LMS).
- Phase 4: Growth moves to a kind; new kinds (hr.employee, purchases.order, fleet.vehicle, contacts.contact, manual).
- Phase 5: Automation service `documents.generate`, Builder modules can register kinds, MirAI/MCP hooks.

## File structure

| File | Responsibility |
|---|---|
| `prisma/migrations/<ts>_documents_engine/migration.sql` (new) | Template file/version/mapping columns, kind column |
| `prisma/schema.prisma` (modify ~1823-1895) | `DocumentTemplate`, `DocumentTemplateVersion`, `GeneratedDocument` |
| `apps/api/src/routes/documents/kinds/kind-registry.js` (new, from `document-provider-registry.js`, 90 lines) | Register/lookup kinds, validate contract |
| `apps/api/src/routes/documents/kinds/*.js` (new) | One file per kind (inventory-custody, lms-certificate, growth-lead, ...) |
| `apps/api/src/services/document-templates/pdf-template.js` (new) | PDF source: detect labels, field boxes, fill with pdf-lib (lifted from LMS) |
| `apps/api/src/routes/documents/document-file-template-service.js` (new) | Upload, replace, blank, scan, suggest, mapping, versions |
| `apps/api/src/routes/documents/document-engine.js` (new) | `generate()` / `preview()`: pick template, load data, fill by format, convert, store, record |
| `apps/api/src/routes/documents/document-template-routes.js` (260) | Upload/suggest/mapping/default routes, kind-filtered listing |
| `apps/desktop/src/modules/runly.documents/screens/*` | Hub screen |
| `packages/ui/src/components/TemplateManager.jsx` (new, export in `index.js`) | Kind-scoped template manager for embedding in modules |
| `packages/sdk/src/domains/documents.js` (128) | Client calls |
| `docs/ai-context/rme3-runtime-capabilities.md`, `docs/developers/*.md` | Document the new component and kind contract |

## Phase 1: the engine and hub

### Task 1: Data model
- [ ] Read `prisma/schema.prisma` lines ~1823-1895 and `InvDocumentTemplate` (~4264), `LmsCertificateTemplate` to align field names.
- [ ] Add to `DocumentTemplate`: `kind String`, `format String` (`blocks|docx|xlsx|pptx|pdf`), `isDefault Boolean`, `scopeKey String?` (optional sub-scope, e.g. a course id).
- [ ] Add to `DocumentTemplateVersion`: `fileAssetId String? @db.Uuid`, `placeholders Json @default("[]")`, `mapping Json @default("{}")`, `layout Json?` (PDF field boxes).
- [ ] Add to `GeneratedDocument`: `outputFormat String @default("pdf")`, `kind String?`.
- [ ] Backfill existing Growth templates: `kind = 'growth.lead'`, `format = 'blocks'`, in the migration SQL with `UPDATE ... WHERE kind IS NULL`.
- [ ] New migration only (never edit applied SQL), `pnpm db:migrate`, `pnpm db:generate`.
- [ ] `node --test apps/api/src/routes/documents/__tests__/` passes. Commit.

### Task 2: Kind registry
- [ ] Test first (`__tests__/kind-registry.test.js`): registering a kind without `key`, `schema`, `permissionKey` or `load` throws a Spanish error; `getKind('x')` returns it; duplicate keys throw; `schema` entries require `tag`, `label`, `type` in `text|number|date|image|list`.
- [ ] Implement `kind-registry.js` generalizing `document-provider-registry.js` (keep `sourceType` as an alias of `kind` so Growth keeps working).
- [ ] Register `growth-lead` via the new registry from `documents-router.js`. Tests pass, commit.

### Task 3: Template service (upload any format)
Pattern to copy: `apps/api/src/services/inventory-document-template-service.js` (`upload`, `replaceFile`, `suggestTags`) and `services/document-templates/template-tags.js`.
- [ ] Tests first: uploads of docx, xlsx, pptx, pdf create a template with a draft version; docx/xlsx/pptx scan `{{tags}}` and flag tags not in the kind schema; pdf runs label detection and returns proposed field boxes; a file above 10 MB or another extension is rejected; wrong kind is rejected.
- [ ] Implement `createDocumentFileTemplateService({ prisma, files })` (all functions inside the factory): `upload`, `createBlank` (via `minimal-docx.js` / `minimal-pptx.js`, exceljs for xlsx), `replaceVersionFile` (rescan after Collabora edit), `suggest` (docx via `suggestDocxTagsWithLabels(buffer, { labels: kind vocabulary })`, pdf via the new `pdf-template.js` detection, xlsx/pptx return a clear Spanish message), `saveMapping`, `setDefault` (one default per `(company, kind, scopeKey)`), `publishVersion`.
- [ ] Commit.

### Task 4: PDF as a template source
- [ ] Read `routes/lms/lms-cert-pdf-layout.js` and `pdf-text-items.js` (+ worker). Extract the generic part (find label text items -> field boxes with x, y, width, font size; fill with pdf-lib incl. images) into `services/document-templates/pdf-template.js`; leave LMS behavior identical (LMS imports from the new file).
- [ ] Test: fixture PDF with a "Nombre:" label -> `detectFields` returns one box; `fillPdf` output contains the value text; LMS certificate tests still pass.
- [ ] Commit.

### Task 5: Engine `generate` / `preview`
- [ ] Tests first: `generate({kind:'x', templateId, data})` for each format returns a stored FileAsset and a `GeneratedDocument` row; when no template is chosen it uses the company default, then the kind's built-in default; `output:'pdf'` calls `pdf-convert.js` when Office is configured, otherwise returns the native file with a `converted:false` flag; image fields (signatures) are placed in docx, xlsx and pdf; list fields repeat table rows (xlsx loop row, docx loop).
- [ ] Implement `document-engine.js` as `createDocumentEngine({ prisma, files, kinds })`, delegating to `docx-template.js`, `xlsx-template.js`, `pptx-template.js`, `pdf-template.js`; apply `mapping` (tag -> data path) before filling; permission-check through the kind's `permissionKey` as the acting user.
- [ ] Expose via `app.locals`/service container the same way other services are exposed to routers (check `index.js:110` pattern) so modules can import it without HTTP.
- [ ] Commit.

### Task 6: Routes and SDK
- [ ] Routes: `GET /documents/kinds`, `GET /documents/templates?kind=&scopeKey=`, `POST /documents/templates/upload` (multipart), `POST .../blank`, `POST .../versions/:vid/suggest`, `PUT .../versions/:vid/file`, `PATCH .../versions/:vid/mapping`, `PATCH .../default`, `POST /documents/generate`, `POST /documents/preview`. Reuse `documents.templates.*` permissions; module screens additionally allowed through the kind permission.
- [ ] Route tests, SDK methods and updated `documents-domain` test. Commit.

### Task 7: UI (hub and embeddable manager)
Follow the UI-first policy (`Dialog` md+ with `DialogHeader` icon, `PageHeader`, `EmptyState`, `ConfirmDialog`, `SelectField`/`ComboboxField`). Lift `TemplatesPanel.jsx`, `TemplateSuggestDialog.jsx`, `TemplatePlaceholderReference.jsx` from inventory into `packages/ui` as the base.
- [ ] `TemplateManager` (props: `kind`, `scopeKey?`, `canManage`): list, upload (docx/xlsx/pptx/pdf, drag and drop), "Documento en blanco", download, replace, set default, delete (soft), field reference, suggest tags, mapping table (tag -> data field from the kind schema), "Editar documento" opening the file in the existing Collabora viewer, "Probar con datos de ejemplo" preview.
- [ ] PDF mode in the manager: show the detected boxes and let the user confirm/adjust (reuse the LMS layout editor pieces if they exist; otherwise confirm-only first).
- [ ] Hub screens in `runly.documents`: Plantillas (all kinds, grouped by module, using `TemplateManager`) and Generados. Retire the block editor for new templates (legacy block templates stay listable and generable).
- [ ] Export in `packages/ui/src/index.js`; document in `docs/ai-context/rme3-runtime-capabilities.md`.
- [ ] `pnpm build:web`; run the 14-aspect checklist `docs/ai-context/ui-screen-audit-checklist.md`. Commit.

## Phase 2: inventory custody adopts the hub

- [ ] Read `inventory-document-template-service.js`, `inventory-custody-service.js` (568 lines), `custody-routes.js`, `custody-template-data.js`.
- [ ] Register kind `inventory.custody` using the existing tag contract in `custody-template-data.js` (scalars, `items` loop, `receiverSignature` / `delivererSignature` images) and the existing `LABELS`/`ITEM_COLUMNS` vocabulary; built-in default = existing default docx.
- [ ] Migration with idempotent SQL: copy each `InvDocumentTemplate` into `DocumentTemplate` (+ version pointing to the same `fileAssetId`, same `placeholders`, `isDefault`); add `InvCustody.documentTemplateId`, backfilled from the old reference. Do not drop old tables in this phase.
- [ ] Replace `resolveForCustody` and the render path with `documentEngine.generate({kind:'inventory.custody', ...})`; keep the public signing-link flow (`/public/inventory/custody/:token`) and `InvItemFile` linking unchanged.
- [ ] Replace `TemplatesPanel` in `InventoryCatalogsScreen` with `<TemplateManager kind="inventory.custody" />`; keep `/inventory/document-templates` routes as thin deprecated proxies for one release.
- [ ] Regression: the existing custody tests (backend T1-T4, T6) must pass untouched; real run: create custody, sign via public link, download PDF.
- [ ] Commit. A later cleanup plan drops the old table.

## Phase 3: LMS certificates adopt the hub

- [ ] Read `routes/lms/lms-cert-templates.js`, `lms-cert-docx-suggest.js`, `lms-cert-pptx-suggest.js`, `lms-cert-pdf-layout.js`.
- [ ] Register kind `lms.certificate` (schema: student, course, date, folio, score...; vocabulary from the suggest files). `LmsCertificateTemplate.source = 'design'` stays in LMS; `docx|pptx|pdf` sources move to the hub with `scopeKey = courseId` where templates are per course.
- [ ] Backfill migration like Phase 2; certificate issuing calls `documentEngine.generate`; LMS embeds `TemplateManager` for the file sources next to its design editor.
- [ ] Regression: LMS certificate tests (`lms-cert-*`) pass; real run: issue a certificate from each source type.
- [ ] Commit.

## Phase 4: Growth and new kinds

- [ ] Growth: `growth.lead` kind stays; `GenerateDocumentDialog` switches to `documents.generate`; lead attachments query (`growth-lead-service.js:328`) unchanged.
- [ ] Add kinds one commit each, starting with `hr.employee` and `contacts.contact`, then `purchases.order`, `fleet.vehicle`; plus `manual` (caller supplies values) usable from any form.
- [ ] Per kind: permission-denied test, schema labels test, `load()` shape test.

## Phase 5: platform hooks

- [ ] Module Service `documents.generate({ kind, templateId?, sourceId|values, output })` for Automation Studio (registered like `communication-services.js`); output is a file id usable by the send-email attachment block.
- [ ] Builder (RME3) modules can declare a template kind in their manifest (schema + permission); update `docs/developers/*.md`, run `node scripts/generate-module-developer-docs.mjs` and the developer-docs test.
- [ ] MirAI/MCP: tool to list kinds/templates and generate (prepare/approve/commit pattern).
- [ ] `docs/TASKS.md` entries with `Verified: YYYY-MM-DD (...)` evidence; spec saved as `docs/superpowers/specs/2026-10-25-documents-v2-design.md` from this plan's architecture section.

## Verification

- `node --test apps/api/src/routes/documents/ apps/api/src/services/document-templates/` plus the inventory custody and `lms-cert-*` suites after their phases.
- Real API checks with `$RUNLY_TOKEN` against the already running dev API (do not start/stop servers): upload each of docx/xlsx/pptx/pdf, suggest, map, generate; compare output.
- Manual QA by the user: upload a real Word form, an Excel sheet and a PDF form in inventory; issue an LMS certificate from a pptx; open a template in the office editor and regenerate.

## Risks

- The inventory and LMS migrations touch live flows: dual-read and kept old tables reduce the risk; each phase is independently revertible.
- Auto-tagging is dictionary-based (not AI) and docx-only; xlsx/pptx rely on manual `{{tags}}`, pdf on label detection.
- PDF output needs Collabora configured; otherwise the native file is returned (current inventory behavior).
- The working tree has unrelated uncommitted automations changes: stage only files from this plan.
