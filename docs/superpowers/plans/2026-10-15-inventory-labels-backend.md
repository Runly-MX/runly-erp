# Inventory Labels (Phase 2 backend) Implementation Plan

Spec: `docs/superpowers/specs/2026-10-15-inventory-labels-qr-design.md` (Phase 2). Backend only; the React UI is a separate task.
Conventions: same as `2026-10-15-inventory-folio.md` (commit only own files, `main`, no dev-server control).

## Tasks

- [ ] 1. Schema + forward migration `20261026000000_inv_label_tables`: `InvLabelTemplate`, `InvLabelPrinter`, `InvLabelPrint` (`inv_label_template|printer|print`), relations on `Company`, `UserProfile`, `InvItem`.
- [ ] 2. Pure rendering package `apps/api/src/services/inventory-labels/`:
  `layout.js` (presets, validation, field selection, quantity expansion), `geometry.js` (mm geometry shared by all renderers),
  `qr-content.js` (url | embedded content), `zpl.js` (native `^BQ`), `pdf.js` (pdfkit + `qrcode` matrix), `png.js` (SVG -> sharp), `index.js`.
- [ ] 3. `apps/api/src/services/inventory-label-service.js` (`createInventoryLabelService({ prisma, publicBaseUrl, resolveItemQrUrl })`): template/printer CRUD, lazy default templates, render, print log, history, per-item label stats.
- [ ] 4. Permissions `inventory.label.read|print|manage` (catalog, manifest permissions + acl) and routes `apps/api/src/routes/inventory/label-routes.js` mounted from `routes/inventory/index.js`; item list gets `labeled` filter and `labelPrintedAt`/`labelPrintCount`.
- [ ] 5. SDK `inventory.labels*` methods (`packages/sdk/src/domains/inventory-labels.js`).
- [ ] 6. Tests (`apps/api/src/services/__tests__/inventory-labels.test.js`, `inventory-label-service.test.js`).
- [ ] 7. Docs `docs/ai-context/inventory-labels.md`.

## Routes

| Route | Permission |
|---|---|
| GET/POST `/inventory/label-templates`, PUT/DELETE `/inventory/label-templates/:id` | read / manage |
| GET/POST `/inventory/label-printers`, PUT/DELETE `/inventory/label-printers/:id` | read / manage |
| POST `/inventory/labels/render` | print |
| POST `/inventory/labels/prints` | print |
| GET `/inventory/items/:id/labels` | read |
| GET `/inventory/items` (`labeled=true|false`) | item.read (existing) |

## Decisions

- QR URL comes from an injected `resolveItemQrUrl(item)`; default is the placeholder `<base>/app/p/inv/f-<folio>`. Phase 3 replaces it with the opaque token.
- Native ZPL `^BQ` QR; PDF/PNG draw the same `qrcode` module matrix so all outputs agree.
