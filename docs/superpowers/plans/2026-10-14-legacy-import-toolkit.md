# Plan — legacy import toolkit (sinabe migration phase 2)

Spec: `docs/superpowers/specs/2026-10-14-legacy-import-toolkit-design.md`

1. Prisma `LegacyRef` model + forward migration (RLS/revokes like other internal tables); `services/legacy-import/legacy-refs.js`.
2. `inventory-historical.js` (item with any admin status + dated admin events, assignments with dates, item files with checksum and migration size limit).
3. `purchases-historical.js` (closed/paid PO and invoice with auto case, no approvals, typed numbers, relations to items, attachments, CFDI UUID extraction).
4. `custody-historical.js` (completed custody with original PDF + signatures, optional dated assignments).
5. `people-and-suppliers.js` (match-or-create employee and supplier).
6. Unit tests for pure parts; git-ignored e2e importing a synthetic dataset twice (no duplicates, dates and statuses preserved).
7. Verification: node --check, focused tests, lint, db:migrate/generate; dev API untouched.
