# Plan — runly.inventory resguardos (custody) with templates

Spec: `docs/superpowers/specs/2026-10-13-inventory-custody-design.md`

## Tasks

### T1 — Dependencies, schema, migration
- Root `package.json` + `apps/api/package.json`: `docxtemplater`, `pizzip`, `docxtemplater-image-module-free`.
- `prisma/schema.prisma`: `InvCustody`, `InvCustodyItem`, `InvDocumentTemplate` + back-relations (Company, HrEmployee, UserProfile, InvItem, InvAssignment, FileAsset as needed).
- New forward migration `prisma/migrations/20261019000000_inventory_custody/` (never edit applied ones). `pnpm db:migrate` + `pnpm db:generate`.
- `files-service.js` `ALLOWED_FILE_ENTITY_TYPES`: add `InvCustody`, `InvDocumentTemplate`.

### T2 — Template engine `apps/api/src/services/document-templates/`
- `docx-template.js`: `renderDocx(buffer, data, { images })`, `inspectDocx(buffer)` → tags.
- `xlsx-template.js`: `renderXlsx(buffer, data, { images })`, `inspectXlsx(buffer)`.
- `pdf-convert.js`: `convertToPdf(buffer, filename)` via Collabora `POST {internalUrl}/cool/convert-to/pdf` using `readOfficeConfig`; returns `null` when Office disabled/unavailable.
- `custody-template-data.js`: builds the data object from a custody record (spec §4).
- Tests `__tests__/document-templates.test.js` with synthetic templates generated in-test (PizZip for docx, exceljs for xlsx).

### T3 — Custody service `apps/api/src/services/inventory-custody-service.js` (+ `inventory-custody-helpers.js` if > 600 lines)
- Folio with advisory lock; snapshot builder; create/update/sign/publicLink/complete/cancel/preview; public get/sign by token hash.
- Extract assignment write from `inventory-service.js` `assignItem/returnItem` into tx helpers accepting `assignedAt/returnedAt` (also used by migrator, phase 2).
- `complete`: transaction for assignments + status; document render/upload outside tx then link (InvItemFile label "Resguardo <folio>", record `documentFileId`); best-effort e-mail via `smtp-service.js`.
- Tests with a fake prisma or focused pure functions (lean).

### T4 — Routes, manifest, mounting
- `apps/api/src/routes/inventory/custody-routes.js` (authenticated) mounted in `routes/inventory/index.js`.
- `apps/api/src/routes/inventory/custody-public-routes.js` mounted at `/public/inventory/custody` in `apps/api/src/index.js` (one line + import), with in-memory per-IP rate limit.
- Manifest `core-modules.js` runly.inventory: permissions `inventory.custody.read`, `inventory.custody.manage`, `inventory.template.manage`; navigation `/inventory/custodies`; permission-catalog entries if required; seed/role defaults following existing inventory permissions.

### T5 — UI
- `packages/ui/src/components/SignaturePad.jsx` + export + doc row in `docs/ai-context/rme3-runtime-capabilities.md`.
- SDK methods in `packages/sdk` (inventory.custodies.*, inventory.documentTemplates.*).
- Screens in `apps/desktop/src/modules/runly.inventory/`: `InventoryCustodyScreen.jsx`, `components/custody/*` (editor sheet, detail, signatures section, items picker), templates tab in catalogs, custody list in item detail + employee widget, route registration.
- Public sign page (no shell) at `/sign/custody/:token`, following the existing public-page routing pattern in the desktop app.
- Follow `docs/ai-context/ui-screen-audit-checklist.md`, modal structure (fixed header/footer), radius rules.

### T6 — Docs
- Help: `apps/api/src/manifests/official/help/runly.inventory/views/resguardos.md` (+ plantillas reference with placeholder table).
- `docs/TASKS.md` entry.

### T7 — Verification
- `node --test` new tests + existing inventory tests; `pnpm lint`; `pnpm build:web`; `node --check` on new API files; curl smoke against running API (4010, do not restart); Playwright flow if time permits.
