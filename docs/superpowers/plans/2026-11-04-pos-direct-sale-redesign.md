# Plan — POS venta directa: rediseño, calendario y cajas por enlace

Spec: `docs/superpowers/specs/2026-11-04-pos-direct-sale-redesign.md`. One commit per phase, each verified with tests + lint + web build.

Verified: 2026-11-04 (node --test POS service/contract/device/appointment suites; scripts/test-commerce-postgres.mjs incl. the free-amount sale, only the unrelated website release_managed failure; vite build; .e2e/pos-direct-sale-ui.mjs 13/13 and .e2e/pos-device-link-ui.mjs 13/13 on disposable stacks). Commits e7c39a966, 7949db9ac, 0ccdc0da9, 2446057f0.

Not done: contact picker in the appointment dialog (free name + phone only), company branding on the public device screen, restaurant screens redesign.

## Phase 1 — Arranque y venta rápida
- [x] Migration: `pos_order_line.custom_item`, `pos_settings.appointments_enabled`.
- [x] `POST /pos/setup` in pos-settings-service + route + SDK; test.
- [x] addLine accepts `customItem`; stockGate / ledger sale / reversal skip custom lines; test.
- [x] Caja: quick setup card when there are no outlets; auto-choose single outlet/register; "Venta rápida" tile + dialog.

## Phase 2 — Rediseño "Clara y suave"
- [x] SellablePanel cards/chips, CartPanel with thumbnails, PosOperationBar with "Más" menu, SessionOpenPanel, SaleCompletePanel, ChargeDialog polish.
- [x] Administración General: mode tiles instead of the select.

## Phase 3 — Calendario y citas
- [x] `pos-calendar-bridge.js` (two calendars: Agenda, Cortes) following the fleet bridge contract.
- [x] Hook session close → corte event; reservation create/update/cancel → event.
- [x] PosAppointment model + service + routes + SDK + tests; bridge events.
- [x] Citas screen + nav entry (filtered by appointmentsEnabled) + toggle in Administración; Caja `?cita=` preload and completion.

## Phase 4 — Cajas por enlace y PIN
- [x] PosDeviceLink + PosOperatorPin models; device service (pairing as attendance kiosk), operator token sign/verify; tests.
- [x] Auth middleware accepts `posop.` tokens on `/pos/v2/*` only.
- [x] Admin UI: links per register (copy, approve code, reset, revoke) and cashier PINs.
- [x] Public `/app/p/pos/:link` screen: pairing → PIN pad → RetailCaja in device mode.
