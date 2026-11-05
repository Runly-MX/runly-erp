# Plan — POS venta directa: rediseño, calendario y cajas por enlace

Spec: `docs/superpowers/specs/2026-11-04-pos-direct-sale-redesign.md`. One commit per phase, each verified with tests + lint + web build.

## Phase 1 — Arranque y venta rápida
- [ ] Migration: `pos_order_line.custom_item`, `pos_settings.appointments_enabled`.
- [ ] `POST /pos/setup` in pos-settings-service + route + SDK; test.
- [ ] addLine accepts `customItem`; stockGate / ledger sale / reversal skip custom lines; test.
- [ ] Caja: quick setup card when there are no outlets; auto-choose single outlet/register; "Venta rápida" tile + dialog.

## Phase 2 — Rediseño "Clara y suave"
- [ ] SellablePanel cards/chips, CartPanel with thumbnails, PosOperationBar with "Más" menu, SessionOpenPanel, SaleCompletePanel, ChargeDialog polish.
- [ ] Administración General: mode tiles instead of the select.

## Phase 3 — Calendario y citas
- [ ] `pos-calendar-bridge.js` (two calendars: Agenda, Cortes) following the fleet bridge contract.
- [ ] Hook session close → corte event; reservation create/update/cancel → event.
- [ ] PosAppointment model + service + routes + SDK + tests; bridge events.
- [ ] Citas screen + nav entry (filtered by appointmentsEnabled) + toggle in Administración; Caja `?cita=` preload and completion.

## Phase 4 — Cajas por enlace y PIN
- [ ] PosDeviceLink + PosOperatorPin models; device service (pairing as attendance kiosk), operator token sign/verify; tests.
- [ ] Auth middleware accepts `posop.` tokens on `/pos/v2/*` only.
- [ ] Admin UI: links per register (copy, approve code, reset, revoke) and cashier PINs.
- [ ] Public `/app/p/pos/:link` screen: pairing → PIN pad → RetailCaja in device mode.
