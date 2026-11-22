# runly.lms standalone evaluations — implementation plan

Spec: `docs/superpowers/specs/2026-11-21-lms-standalone-evaluations-design.md` (revision 2, approved direction
2026-11-21). Work on `main`, small commits, each phase closed with evidence. No production deploy, no
production data migration. Migrations are applied locally only with `prisma db execute --file` +
`prisma migrate resolve --applied` (never `db:migrate` while another session has a pending migration).

Shared verification commands:
- `node --test apps/api/src/routes/lms/__tests__/` and `node --test apps/api/src/mcp/__tests__/lms-*.test.js`
- `node --test apps/desktop/src/modules/runly.lms/lib/`
- `pnpm lint`; `pnpm build:web` for UI phases
- E2E regression (local test company only): `.e2e/lms-e2e.mjs`, `.e2e/lms-eval-e2e.mjs`,
  `.e2e/lms-share-e2e.mjs`, `.e2e/lms-intake-e2e.mjs`, plus the new `.e2e/lms-assessment-*.mjs`

---

## Phase 1 — Foundation: evaluation container, activities, security hardening

Depends on: spec rev. 2. Risk: a course code path that reads lessons by `course_id` without the kind guard.

### Tasks

1.1 Migration `20270109000000_lms_assessment_foundation`
- `lms_course.kind` (CHECK course/assessment), `lms_course.settings` JSONB, index `(company_id, kind, status)`.
- `lms_lesson.section_id DROP NOT NULL`, partial index `(course_id, position) WHERE section_id IS NULL`.
- Trigger functions: lesson parent invariant (insert/update of `section_id`/`course_id`), section only under
  `kind='course'`, `kind` immutable.
- `prisma/schema.prisma`: `kind`, `settings`, `sectionId String?`, `section LmsSection?`. `pnpm db:generate`.
- Apply locally; verify with a read-only script that the trigger rejects both invalid shapes.

1.2 Security
- `scripts/lms-rls-audit.mjs` (read-only; per table RLS flag, owner, `anon`/`authenticated` privileges, current
  role bypass; no row data).
- Migration `20270109100000_lms_rls_hardening`: `ENABLE ROW LEVEL SECURITY` + `REVOKE ALL FROM PUBLIC, anon,
  authenticated` on all `lms_*` tables (loop, bookings pattern). Apply locally, rerun the audit, run all LMS
  suites and E2E regression, check `SET ROLE anon` cannot select.

1.3 Course guards (pure helper `courseKindWhere` in `lms-core.js`)
- Listings filter `kind: 'course'`: `lms-service.js listCourses`, `lms-learn-service.js` catalog/my courses,
  search provider `lms_courses`, MCP `lms_courses`.
- Lookups add `kind: 'course'`: lms-service `findCourse`, learn `enroll`/`loadContext`, overview, social,
  share, invite, cert services, guest `sharedCourse`, MCP `find.course`, `attachment-targets.js` lms target.
- Test: every course endpoint with an assessment id answers 404 (route/service tests with fakes).

1.4 API
- `lms-assessment-core.js` (pure): `normalizeAssessmentSettings`, `ACTIVITY_TYPES` (questionnaire, written,
  files, practical → lesson kind + default settings), activity input normalizer (title, kind, body,
  settings), `activityMaxPoints` (quiz: Σ question points; assignment: `maxPoints`).
- `lms-assessment-service.js`: list (with activity count, Σ points, participants), create, get (with
  activities ordered by position, question count/points, resources count), update (settings, status
  draft/published/archived with publish checks: ≥ 1 activity, each quiz with ≥ 1 question), archive;
  activities create/update/soft-delete/reorder (section-less lessons, `kind: 'assessment'` guard).
- `lms-assessment-routes.js` mounted from `lms-routes.js`: `/lms/assessments*` under `lms.course.manage`.
  Questions and resources keep using `/lms/lessons/:id/questions*` and `/lms/lessons/:id/resources*`
  (lesson-id based; verified section-agnostic).
- SDK `packages/sdk/src/domains/lms.js`: assessment methods.
- Tests: core unit tests; route tests (permissions, 404 for course ids on assessment routes and vice versa).

1.5 UI
- Manifest nav item **Evaluaciones** `/assessments` (`lms.course.manage`); resolver routes
  `/assessments`, `/assessments/:id`, `/assessments/:id/activities/:activityId`.
- `LmsAssessments.jsx` (PageHeader, ChipTabs by status, DataTable), `AssessmentFormDialog.jsx` (dialog
  standard: title, description, time limit).
- `LmsAssessmentEditor.jsx` tabs **Actividades** (sortable list of activity cards, add-activity type picker)
  and **Configuración** (settings form). Other tabs added by later phases.
- `LmsAssessmentActivityEditor.jsx`: reuses `LessonEditorForm` parts in section-less mode
  (`lessonForm.js` gets `mode: 'activity'`: no section field, only quiz/assignment kinds),
  `QuizQuestionsEditor`, `AssignmentSettingsFields` (+ max points), `LessonResourcesEditor`.
- Entry points: "Nueva evaluación" in Evaluaciones; "Crear curso" / "Crear evaluación" on Mis cursos for
  managers.
- `lib/lmsAssessment.js` (labels, totals) + tests.

### Acceptance criteria
- An evaluation with two activities (quiz with open questions, assignment) can be created, edited, reordered,
  published and archived from the UI; no section exists for it.
- Every existing course flow behaves as before (suites + E2E regression green).
- An assessment id is 404 on every course endpoint; a course id is 404 on assessment endpoints.
- DB rejects a section-less lesson in a course, a sectioned lesson in an evaluation, a section in an
  evaluation, and a kind change.
- RLS on for all `lms_*` tables locally with the API unaffected; `anon`/`authenticated` denied.

### Tests
Unit (core, labels), route tests, trigger check script, full LMS suites, E2E regression, new
`.e2e/lms-assessment-e2e.mjs` (create → activities → questions → resource → publish → archive, plus course
endpoints refusing the assessment id), `pnpm lint`, `pnpm build:web`, browser check at 360 px and desktop.

### Status

- [x] Phase 1 done. Verified: 2026-11-21 (local test DB and company only).
  - Migrations applied locally with `db execute` + `migrate resolve`. Trigger check, run inside a rolled-back
    transaction: 2 valid shapes accepted, 5 invalid ones rejected.
  - `scripts/lms-rls-audit.mjs`: 16/16 tables with RLS, 0 readable/writable by `anon`/`authenticated`;
    `SET ROLE anon/authenticated` denied; the owner role still reads.
  - `node --test` LMS API + MCP + office + desktop lib + modules routes: 270/270.
  - E2E on a temporary API (4019): `.e2e/lms-assessment-e2e.mjs` 34/34, including 12 course routes refusing an
    evaluation id. Regression `lms-e2e`, `lms-eval-e2e`, `lms-share-e2e`, `lms-intake-e2e`, `lms-social-e2e`
    all passed with RLS on and the guards in place.
  - Playwright `.e2e/lms-assessment-ui.mjs` on a private Vite (5199), at 1366×900 and 360×740: list, editor,
    add-activity dialog, settings, both activity editors, no horizontal scroll, a UI save persisted.
  - `eslint` clean on the touched files; `vite build` ok.
  - Finding while verifying: `POST /modules/sync { moduleKey: 'runly.*' }` disabled the official module as a
    "stale custom module" (pre-existing bug). Fixed in `routes/modules.js`, re-verified live, and the local
    `runly.lms` row restored.
  - Not done in phase 1: the navigation entry needs `POST /modules/sync` on every instance after deploy.

---

## Phase 2 — Session engine and global timer

Depends on: 1. Risks: start/close races; clock skew; shared dev outbox with an older deployed worker
(run the sweep in-process in E2E).

Tasks: migration (`lms_assessment_session`, `lms_enrollment.extra_sessions`, `lms_quiz_attempt.session_id`,
`lms_submission.session_id/points/rubric_scores`, statuses `draft`/`missing`); `lms-session-core.js`
(start rules, remaining time, expiry with grace, close outcome, snapshot); `lms-session-service.js`
(start/get/submit/close/extend/void/extra session) injecting a session-aware `lessonContext` and owner into
the quiz and assignment services; quiz attempts per activity with `deadline_at = expires_at`; assignment
drafts (save text, attach confirmed files) inside the session; worker sweep every minute
(`apps/worker`); internal routes `/lms/learn/assessments/:id/session*`; `serverNow` on every payload;
`AssessmentRunner` (intro, confirm start, fixed header with timer/save state/submit, activity stepper, final
review, confirmation), `QuizAttempt` session mode, offline answer queue; "Mis evaluaciones" on Mis cursos;
internal route `/evaluate/:id`.

Status:
- [x] Phase 2 done. Verified: 2026-11-21 (local test DB and company only).
  - Migration `20270110100000_lms_assessment_sessions` applied locally. RLS audit: 17/17 tables, 0 client access.
  - `node --test`: LMS API + MCP + office + desktop lib + modules routes, 281/281. Includes the session core
    boundaries: deadline + 30 s grace, upload grace, start blockers, close policy and grading state.
  - `.e2e/lms-session-e2e.mjs` 35/35 on a temporary API:
    - Two simultaneous starts give one session, one attempt and one draft; one 60-minute deadline; the quiz
      deadline equals the session deadline.
    - Reopening keeps the deadline and the answers.
    - At deadline + 20 s a write is accepted; at + 40 s it gets 409 EXPIRED and the session closes with saved
      work.
    - A file presigned in time and confirmed after the close is attached; uploads after the deadline are refused.
    - Two simultaneous submits close the session once.
    - Real 1-minute clock: the in-process sweep closes an abandoned session and keeps its answer; a second sweep
      is a no-op.
  - `.e2e/lms-session-ui.mjs` 20/20 (Playwright, 1366×900 and 360×740):
    - Covered: intro without starting the clock, confirm and start, quiz answer, switching activity, Excel upload,
      reload before autosave, device clock +10 min, submit, and a live time-up path.
    - Two runner bugs were found and fixed on the way: a stale quiz on return, and the backup written in the state
      updater.
  - Regression: `lms-assessment-e2e`, `lms-e2e`, `lms-eval-e2e`, `lms-share-e2e`, `lms-intake-e2e`,
    `lms-social-e2e`, `lms-assessment-ui` and the new `lms-course-quiz-ui` (course quiz keeps its own clock and
    "Enviar examen") all passed.
  - Deferred to phase 5 (spec 6.1 incidents): manager extend / void / extra session. Accepted types (CSV etc.)
    move to phase 3.

Acceptance: one clock for all activities; reload and activity switch keep time and answers; server refuses
writes after `expires_at + 30 s`; double start returns the same session; double submit returns the same
result; sweep closes abandoned sessions; close policy as spec 6.2.
Tests: core unit tests (time math, outcomes); service tests with fakes for races (P2002, `updateMany` count
0); E2E with a 2-minute evaluation: start, answer, reload, switch, wait for expiry, verify `expired` with
saved answers; client clock skew ±10 min in Playwright.

## Phase 3 — Files and material

Depends on: 2. Risks: large uploads near the deadline; storage metadata differences between instances.

Tasks: `lms_submission_file`, `lms_lesson_resource.course_id`; evaluation-level material; resource download
endpoint (session-gated, 120 s signed URL, rate-limited) internal + guest; assignment `acceptedTypes`,
`maxFileBytes`, `maxFiles`; confirm checks stored size + magic bytes (generic helper in `lib/`), disables the
asset on mismatch; SHA-256 worker job; versions on replace; upload grace (spec 6.3); runner upload UI with
progress, retry, replace, versions.

Acceptance and tests: presign after expiry 409; confirm in grace ok, after 409; size/magic mismatch 400 and
asset disabled; guest cannot download outside an open session or another guest's files; versions listed;
no storage path or file id in public payloads (payload snapshot test); E2E upload + replace + timeout.

Status:
- [x] Phase 3 done. Verified: 2026-11-21 (local test DB and company only).
  - Migration `20270110200000_lms_submission_files` applied locally.
    - Creates `lms_submission_file`: slot, version, status `active|replaced|removed`, SHA-256 check, `presigned_at`
      and `after_close`.
    - Unique indexes: `file_id` (idempotent confirm) and one active version per slot (partial index, so concurrent
      replacements cannot both win).
    - RLS audit: 18/18 tables, 0 client access.
  - Code:
    - `lib/file-integrity.js`: generic helper. The real type comes from the bytes (OOXML part, OLE, PDF, text),
      plus exact size and SHA-256.
    - `lms-session-files.js` covers presign, confirm, remove, material download and the grader list/download.
    - Guest routes are in `lms-assessment-public.js`, with a separate download rate limit.
    - Assignment settings: `acceptedTypes` and `maxFileMb`.
    - Runner `DeliveryFiles`: material, XHR progress, client SHA-256, retry, replace dialog, remove confirm, and
      rejected/error rows.
    - Intro shows formats, limits and material. Editor: formats checkboxes and MB limit.
    - Participants: an "Entregas" dialog with every version, its status, date and SHA-256, and a download.
  - `node --test`: LMS API + file-integrity + office LMS, 174/174. Desktop LMS lib, 95/95 (new
    `lmsSessionFiles.test.js`).
  - `.e2e/lms-files-e2e.mjs` 38/38 on a temporary API.
    - Guest access: guests (no Runly session) download the material through a 120 s URL with no bucket/key in
      payloads. Other participants, companies and internal users are refused.
    - Forged files: a forged extension or MIME is rejected by content and the asset is disabled. An oversized file
      gets 413; SIZE_MISMATCH and HASH_MISMATCH are reported.
    - Transfers: an incomplete transfer answers 409 NOT_UPLOADED and can be retried with the same authorization.
      Duplicate confirms are idempotent.
    - Versions: MAX_FILES enforced; a replacement becomes v2 and the old one is kept. Concurrent replacements leave
      exactly one current version; a removed file is kept as `removed`.
    - Deadline: uploads and material are refused after the deadline. A URL issued earlier still works; an expired
      signed URL fails. A file presigned before the deadline confirms after close inside 5 min, and is refused after.
    - Voided session: material refused. Graders download replaced versions.
  - `.e2e/lms-files-ui.mjs` 17/17 (Playwright, 1366 and 360 px).
    - Intro limits; the material download; upload received with its hash in the DB.
    - A PDF renamed .xlsx is shown as rejected; replace dialog leads to v2.
    - Phone: reload recovery, no horizontal scroll, 44 px targets.
    - Submit; the grader sees and downloads the replaced version.
  - Regression:
    - `lms-session-e2e` (updated to the versioned contract) passed.
    - Course and assignment suites passed: `lms-assessment-e2e` 35, `lms-e2e` 47, `lms-eval-e2e` 48 (course
      assignment files), `lms-share-e2e` 23, `lms-intake-e2e` 8 and `lms-social-e2e` 29.
    - UI suites passed: `lms-session-ui` 20 (fixture is now a real OOXML shape), `lms-assessment-ui` 18,
      `lms-course-quiz-ui` 4, and the `lms-ui` smoke (only the known website/resolve 404).
  - Deviations from the spec, kept small on purpose:
    - SHA-256 is computed at confirm, not by a worker job. The bytes are already read for the type check, and
      the hash is mandatory (NOT NULL).
    - Evaluation-level material (`lms_lesson_resource.course_id`) was not added. Material hangs on the activity
      (the PVR case attaches the Excel to the exercise); add it only if a real case needs it.
    - Participants see their own `fileId` (needed to replace or remove); resources never expose file ids.
  - Not done: uploads in flight are not resumed after a reload (the server state is what shows); the public UI for
    guests comes with phase 4 registration.

## Phase 4 — Public registration and links

Depends on: 2 (3 for material). Risks: privacy of intake data; abuse.

Tasks: public route `/app/p/lms/evaluacion/<token>` (API `lms-assessment-public.js`, guest service reuse with
`kind: 'assessment'`); intake `ciudad` preset, `consent` type, custom fields up to 10; window; `dedupeByEmail`
with `ALREADY_REGISTERED` and resume email (invite machinery); public steps UI reusing `GuestIntakeFields`,
`PublicFixedBar`, `keyboardSafeFocus`; Compartir tab in the editor reusing `ShareLinkTab`,
`IntakeFieldsEditor`, `GuestInvitesPanel`.

Acceptance and tests: registering never starts the clock; consent required when configured; duplicate email
refused and resume works on a second browser; window enforced server-side; rate limits active; payloads
carry no internal ids beyond the existing ones; E2E full guest flow on 360 px.

Status:
- [x] Phase 4 done. Verified: 2026-11-22 (local test DB and company only).
  - Migration `20270110300000_lms_enrollment_consent` (`lms_enrollment.consent JSONB`: version, acceptedAt, text)
    applied locally with `db execute` + `migrate resolve` (other sessions' pending migrations untouched).
    RLS audit: 18/18 tables, 0 client access.
  - API:
    - `lms-assessment-share-core.js`: link settings, consent version (sha256 of the notice, 12 hex), window.
    - `lms-assessment-guest-service.js` on `/public/lms/evaluacion/:token`: summary, register, access, resume,
      me, start. Replaces the phase 3 id-based `/public/lms/evaluations/:id` overview/start.
    - Manager routes `/lms/assessments/:id/share`, `/share/rotate`, `/share/invites*` reuse the course share and
      invite services (now kind-aware).
    - One registration per email through the `lms_guest_invite (course_id, email)` unique index (race-safe).
      Resume = a code emailed to that row, then the existing access-code flow (rotates the guest token).
    - `GUEST_PARTICIPANTS` refuses every session call when the link is disabled or the access was revoked.
    - Settings gain `timeZone` (IANA); intake gains the `ciudad` preset and 10 custom fields on evaluations.
    - Session summary gains `folio` (EV- + hash, not the id). Invite mail has evaluation and resume variants.
  - UI:
    - Public page `/app/p/lms/evaluacion/:token`: information, registration with consent, continue with a code,
      invited entry.
    - The runner is shared through `SessionSourceContext`: the same `SessionView` serves internal and guest
      participants.
    - Editor: "Compartir" tab (link, access mode, one registration per email, privacy notice, form,
      registrations or invitations with revoke). Settings: time zone selector, dates entered in that zone.
  - Tests:
    - `node --test`: LMS API + file-integrity + office LMS 179/179, desktop LMS lib 96/96, MCP LMS 10/10.
    - `.e2e/lms-public-e2e.mjs` 62/62:
      - Anonymous page without questions, bodies, uuids or storage keys.
      - Required fields, consent required / changed, valid registration with consent stored.
      - Duplicate email (case-insensitive) and 3 simultaneous registrations: exactly one wins.
      - Registering does not start the clock. 3 simultaneous starts: one session, one 60-minute clock.
      - Resume answers the same for unknown emails. Code on a second device signs out the first and keeps the
        session and deadline.
      - Excel download and delivery, submit with confirmation; material and uploads refused after submitting.
      - Attempt limit cannot be bypassed by re-registering. Expiry closes the session.
      - Revocation and a disabled link stop a running session; a rotated link stops the old URL.
      - Not yet open / closed for registration and start. Invite-only with consent on first entry.
      - Course share route unaffected. Registration rate limited.
    - `.e2e/lms-public-ui.mjs` 19/19 (signed out, 1366 and 360 px): information, consent, registration, reload,
      double-click start, reload resume, download, delivery, folio; phone duplicate email, second person, no
      horizontal scroll.
    - `.e2e/lms-assessment-share-ui.mjs` 10/10 (Compartir tab, desktop and 360 px).
    - Regression passed: `lms-files-e2e` 41 (moved to token routes), `lms-session-e2e`, `lms-assessment-e2e`,
      `lms-e2e`, `lms-eval-e2e`, `lms-share-e2e`, `lms-intake-e2e`, `lms-social-e2e`; UI `lms-files-ui`,
      `lms-session-ui`, `lms-assessment-ui`, `lms-course-quiz-ui`, `lms-share-ui`.
  - Deviations from the spec:
    - The company has no time zone setting: each evaluation stores an IANA `timeZone` (default
      America/Mexico_City); instants stay UTC.
    - Registration is refused before `opensAt` (no data taken before availability), not only the start.
    - No material preview before starting (the optional "vista previa" setting was not added).
    - Rotating the link breaks the stored browser token (keyed by link); registered people continue from the
      new link with an emailed code.
  - Known risk (pre-existing, all LMS public routes): rate limits key on the first `X-Forwarded-For` entry,
    which a client can set. Moving to `mcp/client-ip.js` needs `RUNLY_TRUSTED_PROXIES` on every instance first;
    left for phase 8. Evaluation protections do not rely on the IP alone (email dedupe, per-invite code lock).

## Phase 5 — Consolidated grading and results

Depends on: 2, 3. Risks: concurrent grading; preserving legacy course grades.

Tasks: `lms_course_grader`, `lms_grade_event`, permission `lms.assessment.decide` (catalog + manifest);
assignment points and rubric grading for session submissions; regrade with reason; optimistic concurrency
(`expectedUpdatedAt`); session totals; candidate record sheet; Resultados tab (table, filters, export
CSV/XLSX with the export helper other modules use); Evaluadores tab; Revisión queue routing for
session-bound items; notifications.

Acceptance and tests: totals over 100 (case A = 200) never renormalized; snapshot maxima unaffected by later
edits; regrade writes before/after; second concurrent grader gets 409; unlisted grader 403; decision separate
from score and audited; course assignment grading unchanged (existing tests); export columns verified.

## Phase 6 — UX pass

Depends on: 1–5. Risk: scope creep into course screens (`feedback_redesign_scope`).
Tasks: 14-aspect checklist (`docs/ai-context/ui-screen-audit-checklist.md`) on every new screen; tablet and
phone layouts; keyboard and screen reader pass (timer `aria-live`, stepper roles); light/dark; empty, loading,
error and recovery states. Evidence: screenshots at 360/768/1280 in both themes.

## Phase 7 — Acceptance case and controlled clone

Depends on: 1–5. Risk: B1 (real course content unknown).
Tasks: `scripts/lms-clone-course-to-assessment.mjs` (dry run, apply with checksum and rollback, rollback by
archive); local rehearsal on a disposable course built with the same shape (10 open questions / 100 points;
assignment with 7 items / 100 points and an Excel resource); results view "historial del curso original".
Handoff: exact commands for the product owner to run the dry run on production after deploy and send back the
report; mapping adjusted from it before `--apply`.

## Phase 8 — Hardening and regression

Depends on: all. Tasks: security pass (company isolation, guest isolation, timer tampering, concurrent
submits, interrupted uploads, duplicate deliveries, concurrent grading), performance check of results and
queue queries with a few hundred sessions, full suites + all LMS E2E + Playwright, docs (help content
`apps/api/src/manifests/official/help/runly.lms/`, MCP LMS guide if evaluations are exposed there).
Deploy readiness list for the product owner: module sync, migrations, RLS audit output, clone dry run.

---

## Reporting per phase

Each phase ends with: files changed, tests run with results, remaining risks, commit hashes.
