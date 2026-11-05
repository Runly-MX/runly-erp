# POS venta directa: rediseño, calendario y cajas por enlace

## 1. Feature title
POS venta directa (Tienda) — rediseño visual, arranque guiado, venta por monto, integración con calendario y cajas abiertas por enlace y PIN.

## 2. Status
Complete (approved by the owner 2026-11-04: calendar = cortes + reservaciones + citas; link access = cashiers without ERP login; visual direction = "Clara y suave").

## 3. Context
`runly.pos` grew around restaurant service (mesas, comandero, cocina). A retail register exists (`retail/`, commerce contracts C0-C8) but owners could not reach it: the business mode was ignored (fixed in 8a6d3543d) and the screens read as configuration-heavy. Owners want a direct-sale POS for shops (abarrotes, boutique, servicios) that is visual, quick to set up and usable from any counter device.

## 4. Problem
1. First use requires creating outlet, register and mode in Administración before selling.
2. With one outlet and one register the cashier still picks both every time.
3. Items not in the catalog cannot be charged.
4. The register looks utilitarian; cards, cart and charge flow do not feel like a modern POS.
5. POS activity (cortes, reservations, appointments) is invisible in the calendar; service businesses cannot book and then charge an appointment.
6. A counter tablet needs a full ERP login per cashier.

## 5. Goals
1. A company without outlets sets up the POS in one step ("¿Cómo vendes?" + sucursal + caja) from the Caja screen.
2. One outlet + one register opens straight into the session/sale.
3. "Venta rápida": charge a free amount with a concept, with default tax.
4. "Clara y suave" redesign of the Caja (products, cart, charge, completion, opening), Órdenes header and Administración General.
5. Calendar: closed sessions (cortes), table reservations and appointments mirror into the company calendar.
6. Appointments ("Citas") for service businesses: book client + services + time, and "Cobrar" loads them into the register.
7. Registers opened by link: the device pairs once with a 6-digit code approved by an admin; each cashier enters with a PIN; only the register is reachable.

## 6. Non-goals
1. Customer self-checkout or ordering by QR.
2. Offline sales (no change to the "no hay ventas sin conexión" rule).
3. Two-way calendar sync (editing the calendar event does not change the POS record).
4. Staff schedules/availability for appointments (no double-booking prevention beyond a warning).
5. Restaurant screen redesign (Comandero, Cocina) in this version.

## 7. User stories
1. As an owner, I want to choose "Tienda" and name my store once so that I can sell right away.
2. As a cashier, I want the register to open directly so that I start selling without choosing menus.
3. As a cashier, I want to charge an amount that is not in the catalog so that no sale is lost.
4. As a manager, I want each corte in the calendar so that I see daily sales at a glance.
5. As a receptionist, I want to book an appointment with services and charge it later from Caja.
6. As an owner, I want to give a counter tablet a link so that cashiers use only the register with their PIN.

## 8. UX requirements
- Visual direction "Clara y suave": light background (`--background`), white cards (`--card`) rounded-2xl, soft border, large product photo (aspect 4/3), category chips (rounded-full), brand primary for selection and the primary action, cart at the right on >=1024 px with line thumbnails and +/- steppers, one large "Cobrar $X" button. Inputs keep rounded-md (radius identity). No emojis. All text in Spanish.
- Operation bar: outlet + register + cashier on the left, status chip, a single "Más" menu for cash in/out, orders, change register and close.
- Quick setup card: three large mode tiles (Tienda / Restaurante / Ambos) with icon and one-line explanation, then name of sucursal and caja (prefilled "Sucursal principal", "Caja 1").
- Venta rápida: a tile at the start of the product grid ("Venta rápida · monto libre") opens a dialog with a large amount keypad (`CurrencyField`) and concept (default "Venta rápida").
- Citas: day agenda (list grouped by hour) with date navigation, "Nueva cita" dialog (cliente with `CreatableComboboxField` over contacts or free name, phone, fecha/hora, duración, servicios from catalog, notas), status chips, actions Cobrar / Llegó / No asistió / Cancelar.
- Device link: Administración > Cajas y pagos > "Acceso por enlace" lists links per register (copy link, QR, pending pairing code to approve, revoke). Cashier PINs (4-6 digits) per user in the same section. Public screen: brand header, pairing code in large digits while waiting, then a PIN pad (large keys), then the register; "Salir" returns to the PIN pad.

## 9. Routes/screens
- `/app/m/runly.pos/pos/caja` (RetailCajaScreen, redesigned; quick setup when no outlets; `?cita=<id>` preloads an appointment).
- `/app/m/runly.pos/pos/citas` (new PosAppointmentsScreen).
- `/app/m/runly.pos/pos/admin` (General + Cajas y pagos with "Acceso por enlace" and "PIN de cajeros").
- `/app/p/pos/:link` (new PosDeviceScreen, public shell, no ERP login).

## 10. Data model
- `PosSettings.appointmentsEnabled Boolean @default(false)`.
- `PosOrderLine.customItem Boolean @default(false)`: free-amount line, no product, no stock.
- `PosAppointment`: id, companyId, outletId, contactId?, customerName, customerPhone?, startsAt, durationMinutes (default 60), items Json `[{productId, variantId?, name, price}]`, notes?, status `SCHEDULED|ARRIVED|COMPLETED|CANCELLED|NO_SHOW`, orderId?, createdById, timestamps.
- `PosDeviceLink`: id, companyId, terminalId, name, linkToken (unique), deviceTokenHash?, pairingCode?, pairingSecretHash?, pairingLabel?, pairingRequestedAt?, approvedAt?, pairingTokenEnc?, pairedAt?, lastSeenAt?, revokedAt?, createdById, timestamps.
- `PosOperatorPin`: id, companyId, userId, pinHash (HMAC of companyId:pin), failedAttempts, lockedUntil?, timestamps; unique (companyId, userId) and (companyId, pinHash).

## 11. Prisma impact
Modified: PosSettings, PosOrderLine. New: PosAppointment, PosDeviceLink, PosOperatorPin, enum PosAppointmentStatus. One forward migration per phase.

## 12. API contract
- `POST /pos/setup` (pos.settings.manage or admin): `{mode, outletName, terminalName}` → `{settings, outlet, terminal}`; 409 when outlets already exist.
- `POST /pos/v2/orders/:id/lines` accepts `{expectedVersion, customItem:{name, unitPrice}, quantity}` instead of `productId` (exactly one of both).
- `GET /pos/v2/context` adds `appointmentsEnabled`.
- `GET /pos/appointments?from&to&outletId`, `POST /pos/appointments`, `PATCH /pos/appointments/:id`, `POST /pos/appointments/:id/status` `{status, orderId?}` — read: pos.caja.read|pos.comandas.read; write: pos.caja.operate|pos.orders.create.
- Admin (pos.admin.update): `GET|POST /pos/device-links`, `POST /pos/device-links/:id/approve {code}`, `POST /pos/device-links/:id/reset`, `DELETE /pos/device-links/:id` (revoke); `GET /pos/operator-pins`, `PUT /pos/operator-pins/:userId {pin}`, `DELETE /pos/operator-pins/:userId`.
- Public: `GET /public/pos/devices/:link` (name, company, branding), `POST /public/pos/devices/:link/pair {label}` → `{code, pollSecret}`, `GET /public/pos/devices/:link/pair?secret=` → `{status, deviceToken?}`, `POST /public/pos/devices/:link/operator {pin}` + `X-Pos-Device-Token` → `{operatorToken, expiresAt, profile, companyId, terminalId, outletId}`; 401 bad device, 423 locked after 5 failed PINs (5 min).
- Operator token `posop.<payload>.<hmac>` is accepted as Bearer only on `/pos/v2/*`; it resolves to the cashier's own user and permissions, requires a matching `X-Runly-Company-Id`, and dies when the link is revoked or reset.

## 13. SDK contract
`runly.pos.setup`, `runly.pos.appointments.{list,create,update,setStatus}`, `runly.pos.deviceLinks.{list,create,approve,reset,revoke}`, `runly.pos.operatorPins.{list,set,remove}`, `runly.pos.device.{info,pair,pairStatus,operator}`; `runly.commerce.addLine` passes `customItem`.

## 14. Validator contract
Zod schemas live in `apps/api/src/routes/pos/pos-contracts.js` / `validators.js` (module-local, as today). No `@runly/validators` change.

## 15. Module manifest impact
`runly.pos` navigation gains "Citas" (`/app/m/runly.pos/pos/citas`, icon CalendarClock, permissionKey pos.caja.read), shown only when `appointmentsEnabled`. Entities list adds the new tables. Version bump.

## 16. Navigation impact
"Citas" as above, between Caja and Órdenes. Hidden when appointments are off (frontend filter, same mechanism as restaurant paths).

## 17. Blueprint impact
N/A.

## 18. RBAC/permissions
No new keys. Appointments: read pos.caja.read|pos.comandas.read, write pos.caja.operate|pos.orders.create. Setup: pos.settings.manage|pos.admin.update. Device links and PINs: pos.admin.update. Operator tokens never grant more than the cashier's membership.

## 19. Multi-company behavior
Every new row carries companyId; every query filters by the request company. Device links resolve their company from the link; the operator token embeds it and must match the request header. PIN uniqueness is per company.

## 20. Files/storage impact
N/A.

## 21. Export/import requirements
N/A.

## 22. Audit log requirements
pos.setup.create, pos.order_line.create (existing, custom lines included), pos.appointment.create|update|status, pos.device_link.create|approve|reset|revoke, pos.operator_pin.set|remove, pos.device.operator_login (actor = cashier).

## 23. Edge cases
1. Quick setup races with another admin: 409 and reload.
2. Custom lines skip stock gate, stock sale and stock reversal; refunds of custom lines refund money only.
3. Appointment items whose product was disabled: Cobrar adds what it can and lists the skipped ones.
4. Appointment charged: status COMPLETED with orderId; cancelling a completed appointment is refused.
5. Calendar module not installed: bridges are no-ops and never fail the POS write.
6. Device link reset while a cashier is mid-sale: next request 401, screen returns to pairing; the open order stays on the server.
7. Wrong PIN 5 times: 423 for 5 minutes per link.
8. Cashier PIN belongs to a user without POS permissions: login works, register shows "No tienes acceso a la caja".

## 24. Risks
1. Operator token on a shared device — mitigated: 12 h expiry, "Salir" clears it, revocation checked per request (30 s cache).
2. 4-digit PINs are guessable — mitigated: lockout, per-device pairing required first.
3. Scope creep into restaurant screens — explicitly out of scope.

## 25. Acceptance criteria
1. Given a company with no outlets, when an admin picks Tienda and confirms, then settings, outlet (RETAIL) and register exist and the Caja shows "Abrir caja".
2. Given one outlet with one register, when a cashier opens Caja, then no selection screen is shown.
3. Given an open sale, when the cashier adds "Venta rápida" $50, then the order total includes $50 and charging it succeeds without stock errors.
4. Given a session is closed, then the "Punto de venta · Cortes" calendar has an event on that date with the sales total.
5. Given a reservation or appointment is created, moved or cancelled, then its calendar event follows it.
6. Given an appointment with two services, when "Cobrar" is pressed, then Caja opens with both lines and, once paid, the appointment is COMPLETED.
7. Given an unpaired link, when the device requests pairing and an admin approves the code, then the device shows the PIN pad; a valid PIN opens the register and any non-`/pos/v2` API call with that token is 401.

## 26. Verification plan
`node --test` on new/changed service tests; `pnpm lint`; `vite build` in apps/desktop; `pnpm db:migrate` on the local instance; API smoke with curl against the running dev API where possible.

## 27. Rollback plan
Revert the commits. Migrations only add nullable/defaulted columns and new tables, so old code keeps working with them in place; no rollback migration required.

## 28. Future enhancements
Customer self-checkout/QR ordering; staff availability and online booking for appointments; two-way calendar sync; restaurant screens redesign; per-terminal server-side enforcement of the device's register.
