# runly.attendance — implementation plan

Spec: `docs/superpowers/specs/2026-10-11-attendance-design.md`. Each block is committed once verified.

- [x] Models + foundation migration + punch id default migration. Verified: 2026-10-11 (`prisma migrate status` up to date)
- [x] Pure rules (`attendance-core.js`) with unit tests. Verified: 2026-10-11 (`node --test attendance-core.test.js`, 7/7)
- [x] API: manifest, permissions, internal and public routers. Verified: 2026-10-11 (scripted end-to-end against a local API instance, all checks pass)
- [ ] Admin UI + SDK domain
- [ ] Public kiosk (offline outbox, QR/PIN/NFC) + service worker
- [ ] Phone-key enrollment page
- [ ] MirAI capabilities, Home widget, xlsx export
- [ ] Browser verification of kiosk offline flow
- [ ] Android native (HCE, NFC reader feed, BiometricPrompt, lock-task) — needs APK build and a real device
- [ ] Later: selfie evidence upload, BLE, geofence enforcement, optional face match
