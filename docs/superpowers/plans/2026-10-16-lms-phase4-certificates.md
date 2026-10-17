# runly.lms Phase 4 (certificates) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Certificate templates, automatic issue on course completion, manual issue/revoke, PDF with QR, learner downloads and a public verification page.

**Architecture:** Forward migration (`lms_certificate_template`, `lms_certificate`, `lms_course.certificate_template_id`); pure rules in `lms-cert-core.js`; `lms-cert-service.js` (issue/revoke/list, called from `setLessonOutcome`), `lms-cert-pdf.js` (pdfkit + qrcode), `lms-cert-routes.js` (internal) and `lms-public.js` (public, rate limited, mounted like `createAttendancePublicRouter`). Desktop: Certificados screen, course settings select, Alumnos tab column, learner section, public page under `/app/p/lms/cert/:token`. Spec: `docs/superpowers/specs/2026-10-16-lms-design.md` §13.

**Tech Stack:** Prisma 7, Hono, pdfkit, qrcode, Node test runner, React + `@runly/ui`.

**Precondition:** phases 1-3 committed (phase 3 is not required technically; only `setLessonOutcome` from phase 2 is). Read `apps/api/src/services/inventory-labels/pdf.js` (pdfkit usage), `apps/api/src/services/company-brand-service.js` (brand: `{ name, logoUrl, primaryColor }`), `apps/api/src/routes/attendance/attendance-public.js` (public router + `createTokenBucketLimiter`), `resolveAppBaseUrl` in `apps/api/src/services/email-templates.js`, and `AppEntry.jsx` `/app/p/*` routes.

---

## API contract

Template: `{ id, name, title, body, signerName, signerTitle, signatureFileId, signatureUrl, accentColor, showLogo, enabled, courseCount, createdAt, updatedAt }`.
Certificate: `{ id, folio, token, verifyUrl, learner: { id, displayName }, courseId, courseTitle, learnerName, hours, issuedAt, issuedBy, revokedAt, revokeReason }`.

| Method | Path | Permission | Body | Returns |
|---|---|---|---|---|
| GET / POST | `/lms/certificate-templates` | lms.course.manage | template fields | Template[] / Template (201) |
| PATCH / DELETE | `/lms/certificate-templates/:id` | lms.course.manage | partial | Template / Template disabled; 409 `IN_USE` |
| GET | `/lms/certificate-templates/:id/preview.pdf` | lms.course.manage | — | `application/pdf` with sample data |
| POST | `/lms/enrollments/:id/certificate` | lms.enrollment.manage | — | Certificate (201); 409 `NOT_COMPLETED`, 409 `NO_TEMPLATE`, 409 `ALREADY_ISSUED` |
| POST | `/lms/certificates/:id/revoke` | lms.enrollment.manage | `{ reason }` | Certificate |
| GET | `/lms/courses/:id/certificates` | lms.enrollment.manage | — | Certificate[] |
| GET | `/lms/certificates/:id/pdf` | lms.enrollment.manage | — | PDF |
| GET | `/lms/my/certificates` | lms.access | — | Certificate[] (own, including revoked flagged) |
| GET | `/lms/my/certificates/:id/pdf` | lms.access | — | PDF (own only) |
| GET | `/public/lms/certificates/:token` | none (rate limited) | — | `{ folio, learnerName, courseTitle, hours, issuedAt, companyName, logoUrl, revoked, revokedAt }`; 404 |
| GET | `/public/lms/certificates/:token/pdf` | none (rate limited) | — | PDF (also for revoked, stamped "REVOCADO") |

Course payload gains `certificateTemplateId`. Enrollment serializer gains `certificate: { id, folio, revokedAt } | null`. My-courses items gain `certificateId`.

SDK (token last): `listCertificateTemplates()`, `createCertificateTemplate(data)`, `updateCertificateTemplate(id, data)`, `disableCertificateTemplate(id)`, `certificateTemplatePreviewUrl(id)` (returns the path; the UI fetches it as a blob with auth), `issueCertificate(enrollmentId)`, `revokeCertificate(id, reason)`, `listCourseCertificates(courseId)`, `downloadCertificate(id)` (blob), `listMyCertificates()`, `downloadMyCertificate(id)` (blob), `getPublicCertificate(token)` (no auth), `publicCertificatePdfUrl(token)`. Check how other SDK domains download PDFs/blobs (e.g. inventory labels or ledger export) and reuse that helper.

## Workstream A — Backend
- [ ] Migration (timestamp after the latest folder): tables per spec §13.1, partial unique `(enrollment_id) WHERE revoked_at IS NULL`, unique `(company_id, folio)`, unique `token`, `lms_course.certificate_template_id` FK `ON DELETE SET NULL`. Prisma models, `migrate diff` empty, `pnpm db:migrate`.
- [ ] `lms-cert-core.js` (TDD, `__tests__/lms-cert-core.test.js`): `normalizeTemplateInput` (name/title required, hex color, body <= 2000), `renderTemplateText(body, vars)` (replaces the 6 placeholders, unknown placeholders left as-is, no HTML), `formatFolio(year, seq)` -> `2026-000123`, `nextSequence(lastFolio, year)`, `certificateHours({ estimatedMinutes, lessonDurationsSeconds })` (round to 0.5, minimum 0.5 when there is any content), `newToken()` (24 url-safe chars from `crypto.randomBytes(18)`), `formatIssueDate(date)` ("16 de octubre de 2026", Spanish month names, no Intl dependency on server locale).
- [ ] `lms-cert-service.js`: `issueCertificate(tx, { enrollment, issuedById = null })` (no-op when the course has no template or a valid certificate exists; advisory lock; snapshots; returns the row), wired into `setLessonOutcome` so it runs in the same transaction the moment the enrollment turns completed; manual issue/revoke/list; template CRUD with `IN_USE` check; learner list/download ownership checks.
- [ ] `lms-cert-pdf.js`: `renderCertificatePdf({ certificate, template, brand, verifyUrl, logoBuffer, signatureBuffer })` -> Buffer. Letter landscape, accent-colored border, logo top center (only PNG/JPEG buffers — detect by magic bytes, skip others), title, learner name large, rendered body, hours + date, signer line + optional signature image, folio and QR bottom right (`QRCode.create(verifyUrl, { errorCorrectionLevel: 'M' })` drawn as rects like inventory labels), "REVOCADO" diagonal stamp when revoked. Fetch logo/signature buffers in the service (signed URL -> `fetch` with a 5 s timeout, failures ignored). Test: renders a non-empty buffer starting with `%PDF` for valid and revoked certificates without images.
- [ ] Routes: internal in `lms-cert-routes.js` registered from `createLmsRouter`; public `createLmsPublicRouter({ prisma, ... })` in `lms-public.js` with `createTokenBucketLimiter({ capacity: 30, refillPerSecond: 0.5 })` per client IP, mounted in `apps/api/src/index.js` next to the attendance public router. `verifyUrl` uses `resolveAppBaseUrl(process.env)`; when null, use a relative `/app/p/lms/cert/<token>` in the payload and skip the QR in the PDF.
- [ ] Manifest: navigation `{ label: 'Certificados', path: '/certificates', icon: 'Award', permissionKey: 'lms.course.manage' }`, ownedEntities += 2, version bump. Help overview gains Certificados. SDK methods.
- [ ] Route tests: public 404 for unknown token, rate limiter returns 429 after capacity, learner cannot download someone else's certificate (fake service). Run `node --test apps/api/src/routes/lms/__tests__/`, `node --check`, `pnpm lint`.

## Workstream B — Desktop
- [ ] `LmsCertificates.jsx` `/certificates`: `PageHeader` "Certificados", template table (name, cursos, estado) + "Nueva plantilla"; `CertificateTemplateSheet.jsx` (wide, fixed header/footer): fields + placeholder chips that insert into the body, signature upload via `runly.files.upload` (`moduleKey: 'runly.lms'`, `entityType: 'LmsCertificateTemplate'`), accent color input, `CheckboxField` "Mostrar logotipo", live preview iframe from a blob URL refreshed (debounced 1 s) after save.
- [ ] `CourseSettingsForm.jsx`: Certificado `SelectField`.
- [ ] `EnrollmentsPanel.jsx`: certificate column (folio link downloads PDF, "Emitir" button when completed without a valid certificate, revoke action with a Dialog requiring a reason).
- [ ] Learner: `LmsHome.jsx` Certificados section (`MyCertificates.jsx` cards: course, folio, date, Descargar, Copiar enlace de verificación); player completion banner with "Descargar certificado" when `certificateId`.
- [ ] Public page `apps/desktop/src/modules/runly.lms/public/CertificateVerifyScreen.jsx` registered under `/app/p/lms/cert/:token` in `AppEntry.jsx` (lazy, Suspense, no shell, no login): logo, status pill (Certificado válido / Certificado revocado), data list, PDF download link, Runly footer with `RUNLY_EDITION_NAME` not required. Works signed out.
- [ ] Register `runly.lms:/certificates` in `ModuleOutlet.jsx` + resolver. `node --test apps/desktop/src/modules/runly.lms/lib/`, `pnpm lint`, `pnpm build:web`.

## Task C: End-to-end
- [ ] `.e2e/lms-cert-e2e.mjs` (temporary API on another port, test company): template create; course with template and one text lesson; assign + complete -> certificate issued automatically with folio `YYYY-######`; my certificates lists it; my PDF starts with `%PDF`; public JSON by token valid, PDF `%PDF`; unknown token 404; revoke -> public shows revoked; manual re-issue -> new folio and token, old token still resolves as revoked; template delete while in use -> 409 IN_USE; preview PDF ok. Archive the course and disable the template at the end.
- [ ] `docs/TASKS.md` entry with evidence; commit per verified block.
