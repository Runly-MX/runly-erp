# runly.attendance — implementation plan

Spec: `docs/superpowers/specs/2026-10-11-attendance-design.md`. Each block is committed once verified.

- [x] Models + foundation migration + punch id default migration. Verified: 2026-10-11 (`prisma migrate status` up to date)
- [x] Pure rules (`attendance-core.js`) with unit tests. Verified: 2026-10-11 (`node --test attendance-core.test.js`, 7/7)
- [x] API: manifest, permissions, internal and public routers. Verified: 2026-10-11 (scripted end-to-end against a local API instance, all checks pass)
- [x] Admin UI + SDK domain. Verified: 2026-10-12 (Playwright: all six screens render, no console errors, navigation seeded)
- [x] Public kiosk (offline outbox, PIN, QR scanner, NFC) + service worker. Verified: 2026-10-12 (Playwright on a production build: pair, approve, online punch, wrong PIN, offline punch and sync, cold start offline). Camera QR scan and Web NFC not exercised (no hardware)
- [x] Phone-key enrollment page. Verified: 2026-10-12 (Playwright: enroll through the UI, rotating QR rendered; signed-QR verification covered by the API end-to-end script)
- [x] MirAI capabilities (unit test) and Home widget (Playwright). Verified: 2026-10-12. xlsx export not done; reports export CSV
- [x] Browser verification of kiosk offline flow. Verified: 2026-10-12
- [ ] Android host NFC tags feed the kiosk (`native.device.nfcRead` loop -> `runly:nfc-card`). Code written, not built or run on a device
- [ ] Android native (HCE, BiometricPrompt, lock-task) — needs APK build and a real device
- [ ] Later: selfie evidence upload, BLE, geofence enforcement, optional face match

## Round 2 (design and HR link), 2026-10-12
- [x] Animated colored `ChipTabs` (@runly/ui) with per-tab descriptions and tab persisted in the URL and localStorage. Verified: 2026-10-12 (Playwright: selected tab restored after reload and without the URL param)
- [x] "Crear otro" in person, catalog and kiosk sheets, same footer as the Module Builder field sheet. Verified: 2026-10-12 (Playwright: sheet stays open and resets after save)
- [x] `DateRangeFilter` / `DatePickerField` for punches and reports, range kept in the URL
- [x] HR link: suggestions while typing, link/unlink, create from HR, one person per employee, HR detail section. Verified: 2026-10-12 (API end-to-end script `attendance-hr-e2e.mjs`; Playwright: suggestion shown, person created linked, HR detail renders the section)
- [x] People import with template and column mapping (generic `ColumnMappingStep` in @runly/ui). Verified: 2026-10-12 (API: parse, preview, commit, template round trip; Playwright: mapping step with detected columns)
- [x] Layout pass over all screens; no horizontal overflow at 390px. Verified: 2026-10-12
- [x] Help views per screen, MirAI person-status tool, module notes in `docs/ai-context/attendance-module.md`

## Round 3 (write less, views, pending items), 2026-10-12
- [x] Site form: timezone dropdown, single "Dirección o lugar" search that fixes the point (geocode proxy), "usar mi ubicación", radius presets. Verified: 2026-10-12 (Playwright: site saved with timezone, coordinates and a 200 m radius)
- [x] Shift/quota/person/kiosk forms with pickers, chips, steppers, suggested names/codes, PIN generator
- [x] Table/cards switch (DataTable `renderCard`, `viewModes`) on people, punches, kiosks, catalogs, reports; kiosk filters; "?" popover instead of the always-on banner. Verified: 2026-10-12 (Playwright)
- [x] Geofence: server flags `outside_geofence`; kiosk sends coordinates. Verified: 2026-10-12 (API script and Playwright with a mocked position)
- [x] Selfie evidence: kiosk captures, uploads after sync, admin sees thumbnail. Verified: 2026-10-12 (Playwright with Chromium's fake camera: punch carries a signed selfie URL)
- [x] xlsx exports (people, punches, hours). Verified: 2026-10-12 (API script; Playwright downloads an .xlsx from each screen)
- [x] Pairing hand-off recovery (device token re-fetchable until the first authenticated call). Verified: 2026-10-12 (API script)
- [ ] Still pending: Android HCE / BiometricPrompt / lock-task (needs APK build), BLE, optional face match, real-device checks (camera QR, Web NFC, geolocation prompt on phones)

## Round 4 (QR integrity, privacy, mini app, filters), 2026-10-12
- [x] "Scan with your phone": kiosk shows an HMAC challenge QR, the enrolled phone signs it and posts it (the key never leaves the phone; a forwarded screenshot cannot punch for someone else). Verified: 2026-10-12 (API script: valid scan, replay 409, wrong key 403, expired/wrong MAC 400, direction toggle; Playwright: kiosk tab renders the QR, greets the person from a phone scan and attaches the evidence photo with Chromium's fake camera)
- [x] Photo policy: `no_photo` flag for QR/card punches without a captured photo (company setting, default on). Verified: 2026-10-12 (API script)
- [x] Evidence retention: selfies and punch coordinates auto-deleted after the company's window (default 30 days) by a worker tick; evidence files belong to the punch so Files never lists them; General tab in Configuración. Verified: 2026-10-12 (unit test of the purge with fakes; settings via API script and Playwright). The worker tick itself was not run against the live database.
- [x] Phone page is an installable mini app ("Checador", own manifest, install button, iOS steps) with the scan flow. Verified: 2026-10-12 (Playwright: own manifest linked, standalone and start_url without the invite code, home shows Escanear kiosko / Mostrar mi QR). Not verified: real install on Android/iOS and camera scan on a phone
- [x] Runly watermark on kiosk and phone screens
- [x] `FilterMenu` (left categories, right options; bottom sheet in two steps on mobile) + removable chips, wired into DataTable and the attendance screens. Verified: 2026-10-12 (Playwright desktop and 390 px)
- [ ] Still pending: Android HCE / BiometricPrompt / lock-task (needs APK build), BLE, optional face match, real-device checks

## Round 5 (hours, overtime, requests, "Mis horas"), 2026-10-12
- [x] Flexible shifts (per-weekday hours + break), daily hours engine (overtime vs the shift of that day, late, early leave, absence), optional overtime approval, rounding, company timezone; hours only. Verified: 2026-10-12 (unit tests of the engine incl. 9 h x4 + short Friday; API script; Playwright shift editor, daily report, approval)
- [x] Forgotten-punch requests from the phone (signed with the enrolled key) approved/rejected in Solicitudes; "Mis horas" in the phone app. Verified: 2026-10-12 (API script incl. forged/stale/tampered requests; Playwright phone flow and admin list)
- [ ] Not covered: weekly overtime cap, holidays/vacations calendar, real-device checks
