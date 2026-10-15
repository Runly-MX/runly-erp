# Inventory scan kiosk "Escanear" (Phase 3, kiosk)

Spec: `docs/superpowers/specs/2026-10-15-inventory-labels-qr-design.md`, "Phase 3 - Public page and kiosk" (Kiosk bullet). Builds on the public item token (`docs/superpowers/plans/2026-10-15-inventory-public-page.md`).

## Steps

1. API: `services/inventory-scan-service.js` `resolveCodes(companyId, codes)`. A Runly QR URL (`/app/p/inv/<token>`) resolves through the public token (new `publicService.itemIdForToken(companyId, token)`, scoped to the caller company, revoked = no match); any other code is an exact, trimmed, case-insensitive match on folio, serial or asset tag among enabled items of the company. Max 50 codes per call. Returns `{ code, item | null, matchedBy }` with id, name, folio, serialNumber, assetTag, status, adminStatus, location, type, brand and cover image file id.
2. Routes (`routes/inventory/scan-routes.js`): `POST /inventory/scan/resolve` and `POST /inventory/scan/export` (XLSX via the existing API `exceljs`; CSV is built client-side). Permission `inventory.item.read`. SDK `client.inventory.scan.*`.
3. Desktop: `lib/scan-session.js` (code normalization + token extraction, session reducer with duplicate detection, sessionStorage persistence, CSV builder); a reusable inventory `ScanCamera` (zxing, continuous, torch, camera switch, native camera permission in the APK); screen `InventoryScanScreen.jsx` at `/inventory/scan` (nav "Escanear", `inventory.item.read`). Desktop: camera left, list right; phone: collapsible camera on top, list below, sticky action bar.
4. Bulk actions on matched rows: "Imprimir etiquetas" (Etiquetas with `labelItems`), "Crear resguardo" (`buildNewCustodyPath`), "Cambiar estado" (existing admin bulk transitions via `InventoryAdminTransitionDialog`). "Cambiar ubicación" is skipped: no bulk location update API exists.
5. Attendance scanners stay untouched (their UX differs: front camera, kiosk styling); the inventory scanner is module-local.
6. Focused tests (API service + desktop pure lib), docs (`docs/ai-context/inventory-labels.md`, help page `escanear.md`), `pnpm lint`, `pnpm build:web`.
