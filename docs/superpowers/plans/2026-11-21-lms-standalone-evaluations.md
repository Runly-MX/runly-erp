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
