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
