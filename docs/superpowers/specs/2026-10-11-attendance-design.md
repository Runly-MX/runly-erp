# runly.attendance — Time clock with public offline kiosks (design)

Date: 2026-10-11. Status: approved by the product owner ("take the best decisions"), implementation in progress.

## 1. Problem
Track entries and exits of internal staff, contractors and visitors, independent from `runly.hr`. Contractors must meet minimum headcounts per trade; kiosks must work offline and be shared by public link on any device.

## 2. Scope
In: people (internal / contractor / visitor), groups (contractor companies), categories (trades), sites, shifts, quotas, kiosks, punches, reports, phone-key credential, card credential, PIN.
Out (first version): USB fingerprint readers, automatic face matching, selfie upload pipeline (field `selfieFileId` reserved), BLE proximity, native HCE/BiometricPrompt (needs an APK build).

## 3. Data model (Prisma, `att_*`)
`AttSite`, `AttGroup`, `AttCategory`, `AttShift`, `AttPerson` (optional `hrEmployeeId`), `AttCredential` (`card` | `device_key`), `AttKiosk`, `AttPunch` (client-supplied UUID v7 id = idempotency key), `AttQuota`. No FK to company (same convention as canvas). Shift assignment is `AttPerson.shiftId` (no join table).

## 4. Identification
| Method | Where it works | Offline |
|---|---|---|
| Employee code + PIN (PBKDF2 hash shipped to the paired kiosk) | everywhere | yes |
| NFC card / tag (UID) | Android Chrome (Web NFC, NDEF read) or the APK | yes |
| Phone key: ECDSA P-256, non-extractable, rotating signed QR `RA1.<personId>.<ts>.<sig>` | any phone with a PWA; kiosk needs a camera | yes (public keys cached) |
| Phone as NFC card (HCE) | APK only (future) | yes |
Biometrics: the phone's fingerprint/face only unlocks the signing key (WebAuthn / BiometricPrompt, future). Android does not allow identifying a person with the device sensor.

## 5. Kiosk security
The public link only starts pairing: kiosk shows a 6-digit code, an admin approves it, the kiosk receives a device token once (stored hashed). Roster and sync need `Authorization: Kiosk <token>`. Admin can reset (new link, forget device) or revoke. Public endpoints are rate limited. Phone enrollment needs an admin-issued single-use invite (48 h) plus the person's own employee code.
Known risk: PIN hashes are shipped to paired kiosks for offline checks, so a stolen kiosk allows offline brute force of 4-8 digit PINs; mitigation: per-kiosk `allowPin`, approval gate, revocation, throttling on the kiosk.

## 6. Offline sync
Kiosk stores roster + outbox in IndexedDB; every punch is queued first (UUID v7), then `POST /public/attendance/kiosk/:link/sync` in batches of <= 200. The server is idempotent by id, computes `offsetMs = serverNow - deviceNow`, corrects the punch time and flags `clock_skew` when the offset exceeds 2 minutes, flags `future_time`, `sequence` (same direction twice), `proof_failed` (bad card / bad QR signature), `replay` (QR timestamp reused). Flagged punches are kept (status `flagged`) for review, never dropped.

## 7. Quotas and reports
Quota = (group?, category?, site?, minCount, weekdays). Compliance = people currently inside (last non-voided punch in the last 24 h is `in`) vs `minCount`, plus distinct attendees in a range. Hours = in/out sessions per person; open sessions are reported. Presence counts by kind / group / category.

## 8. API
Internal (`/attendance/*`, permissions `attendance.view | people.manage | punch.manage | config.manage`): catalogs CRUD, people, HR import, enroll invite, cards, credential revoke, punches (+ manual, void), summary, reports (presence, hours, compliance), kiosks (CRUD, approve, reset, revoke).
Public (`/public/attendance/*`): kiosk info, pair, pair-status, roster, sync, enroll.

## 9. UI
Admin: Resumen (live presence, quota progress, kiosk status), Personas, Checadas, Kioskos, Reportes, Configuración. Public: `/app/kiosk/:link` dark full-screen kiosk with large clock, keypad, QR scanner, NFC; `/app/attendance/phone` phone key with rotating QR. Service worker caches the shell for offline cold starts; never caches API calls.

## 10. Verification
Unit tests for the pure rules; scripted end-to-end run against a local API (`.e2e/attendance-e2e.mjs`, git-ignored): pairing, approval, idempotent retry, skewed offline punch, bad proof, phone enrollment, signed QR, replay, reports, revocation.
