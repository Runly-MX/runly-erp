# runly.lms — Standalone evaluations (design)

Date: 2026-11-21. Status: **approved direction (product owner, 2026-11-21) with eight mandatory adjustments,
incorporated in revision 2 below**. Plan: `docs/superpowers/plans/2026-11-21-lms-standalone-evaluations.md`.

Scope: evolve Aprendizaje (`runly.lms`) so it offers two modes, **Cursos** and **Evaluaciones**, reusing the
existing quiz, assignment, upload, share-link and review engines. No new module, no rewrite, no destructive
migration, no production data touched without validation. A future `runly.forms` module is prepared for, not
built. Marketing is out of scope.

Privacy: the real acceptance case belongs to a customer. Its company name and production record ids stay out
of this repository; they are passed at run time to the clone script (section 10).

---

## 1. Audit — how runly.lms works today

Evidence (2026-11-21): read of `apps/api/src/routes/lms/*` (6.9k lines, 23 test files), MCP adapters
`apps/api/src/mcp/adapters/lms*`, the 11 `prisma/migrations/*lms*`, `apps/desktop/src/modules/runly.lms/*`,
`packages/sdk/src/domains/lms.js`; read-only queries on the local test database (table privileges, role
attributes). The acceptance course is **not** in the local database (blocker B1, section 10).

### 1.1 Architecture

- API: Hono routers `lms-routes.js`, `lms-eval-routes.js`, `lms-experience-routes.js`, `lms-cert-routes.js`,
  `lms-social-routes.js`, public `lms-share-public.js` / `lms-public.js`. Services are
  `createXxxService({ prisma, ... })`; pure rule files (`lms-eval-core.js`, `lms-share-core.js`,
  `lms-intake-core.js`, `lms-question-*.js`) have no I/O and are unit tested.
- Tenant isolation: by `company_id` in every query (no FK to company), same convention as other modules.
- Reuse seam already in the code: the quiz and assignment services take an injected `learn.lessonContext`,
  `ownsAttempt` and upload `owner`. The guest service runs the same engine for share-link guests this way
  (`guestLearn`, `GUEST_OWNER`). The evaluation session engine plugs in identically.
- UI: `LmsHome` (Mis cursos), `LmsCourses` (DataTable + ChipTabs), `LmsCourseEditor` (tabs Contenido,
  Configuración, Alumnos, Anuncios, Reseñas), `LmsLessonEditor` (full page, section select required),
  `LmsPlayer` + `CourseOutline`, `QuizLesson`/`QuizAttempt` (own timer, autosave 800 ms, auto-submit at 0,
  layouts all/one, flags), `AssignmentLesson`, `LmsReview` (queue Pendientes/Calificadas,
  `GradeAttemptSheet`, `GradeSubmissionSheet` as wide `FormSheet` with `ReviewColumns`), share dialog
  (`ShareLinkTab`, `IntakeFieldsEditor`, `GuestInvitesPanel`), public `SharedCourseJoin` / `SharedCoursePlayer`
  under `/app/p/lms/curso/<token>`. Navigation: Mis cursos, Cursos, Revisión, Certificados.

### 1.2 Inventory and gaps

| Feature | Current state (verified in code) | Problem | Proposed solution | Priority |
|---|---|---|---|---|
| Courses | Sections, lessons (video, text, file, embed, quiz, assignment), progress, sequential unlock, certificates, social, HLS | None for this scope | Reuse unchanged | — |
| Evaluations | None; an exam must be a course with a section and lessons | Artificial structure; course UX (progress, certificates) is wrong for candidates | `lms_course.kind = 'assessment'`, activities without section (section 3) | High |
| Question kinds | 9: single, multiple, true_false, open, short, numeric, ordering, matching, fill_blank; all auto-scored except `open` | None | Reuse | — |
| Quiz attempts | Server `deadline_at`, 30 s grace, lazy close, idempotent submit, P2002 race handled, draw/shuffle, max/extra attempts | Clock per quiz lesson | Session `expires_at` feeds every attempt | Critical |
| Global timer | None; assignments only have `dueDaysAfterEnroll` | Cannot express 60 min for the whole exam | `lms_assessment_session` (section 5) | Critical |
| Client countdown | `QuizAttempt.jsx` counts against `Date.now()` | Wrong device clock shows wrong time (server still decides) | `serverNow` offset | High |
| Expiry closing | Lazy only (next read/write) | Abandoned attempts never reach review | Worker sweep + lazy close | High |
| Submissions | Text + files, ≤ 10 files, 50 MB, MIME allow-list, direct signed upload, history, late flag | No draft/autosave; cannot replace before deadline; 0–100 scale only | Drafts in session, versions, points | High |
| Material | `lms_lesson_resource` per lesson | Guests never get resources (`resources: []` in `lms-guest-service.js`) | Session-gated short-lived downloads (section 7) | High |
| Upload integrity | Presign checks declared name/type/size; confirm checks existence only | Real size/type unchecked, no hash | Size + magic bytes at confirm, SHA-256 by worker | High |
| Public link | Token, open/invite modes, rotation, revoke, hashed guest token, rate-limited join/access, emailed invites with code | No window, no consent, no `ciudad`, 5 custom fields max, duplicate registrations | Section 8 | High |
| Grading | Queue + history, open-answer points, approve/return, notifications, guest grade email | No regrade, no change history, no rubrics, no candidate record, no total, no export, no per-evaluation graders | Section 9 | High |
| Score vs decision | Not modeled | Hiring decisions would end in the score | Separate decision, own permission | Medium |
| RLS | Off on all 16 `lms_*` tables; 304 other tables have it | Defense in depth missing | Section 4 | Medium |
| Tests | Unit + route tests for eval, share, invites, review history, question kinds | No timed multi-activity E2E | Section 12 | — |

---

## 2. Decisions

1. **An evaluation is an `lms_course` row with `kind = 'assessment'`** (immutable after creation). It reuses
   identity, status, share link, learners, enrollments, guest tokens, invites, notifications, permissions.
2. **Activities are `lms_lesson` rows with `section_id IS NULL`** (section 3 explains why, against the
   alternatives). Activity types map onto existing engines:
   Cuestionario → `quiz`; Respuesta escrita extensa → `quiz` with `open` questions; Entrega de archivos and
   Actividad práctica → `assignment` with material and files; Actividad mixta → an evaluation with several
   activities. A `file` question kind is not in scope.
3. **One session per evaluation attempt** owns the clock and a frozen snapshot of the scoring (section 5).
4. **Points are the weights**; totals are sums, never renormalized (section 9).
5. **The acceptance course is cloned, never mutated** (section 10).

---

## 3. `section_id` dependency audit and the parent relation

### 3.1 Every dependency found

Backend, through sections (an activity with no section is invisible here, which is the desired result):
`lms-learn-service.js loadContext` (sections → `orderLessons`), `lms-guest-service.js loadOutline`,
`lms-overview-service.js`, `lms-serialize.js serializeSections`, `lms-service.js` (`loadSections`,
`findSection`, `nextLessonPosition`, `createLesson`, `updateLesson` move, `reorder`), `lms-share-core.js`
(`markSectionFree`, `filterSharedSections`), `lms-progress.js` / `lms-promo.js` (`lesson.section?.free`, already
null-safe), MCP `lms-common.js` (`find.section`, `lessonPatch.sectionId`), `lms-course-actions.js`
(structure, reorder, section CRUD, count by section), `lms-lesson-actions.js` (`createLesson(sectionId)`,
move), `lms-queries.js` (course detail), `lms.js` (snapshot).

Backend, by `course_id` without sections (would see activities, so they must reject assessments):
`lms-progress.js:40` (progress pct), `lms-cert-issue.js:28`, `lms-service.js:85` (count) and `:190` (reorder),
MCP `lms-course-actions.js:16/49`, `lms.js:42`.

Backend, by lesson id only (section-agnostic, reused as-is by activities): quiz service (`quizLesson`,
attempts), resources service, review service, social service (`lessonId` lookups), notifications.

Course listings that must exclude assessments: `lms-service.js list`, `lms-learn-service.js` catalog and my
courses, search provider `lms_courses` (`services/search/work-providers.js`), MCP `lms_courses`. Course
lookups that must refuse an assessment id: `findCourse`/`loadContext` in lms-service, learn, overview, social,
share, invite, cert services, MCP `find.course`, `attachment-targets.js`.

Frontend: `lessonForm.js` (`sectionId` required), `LessonEditorForm` (section select), `LmsLessonEditor`
(sections required), `curriculumDnd.js` / `SortableCurriculum`, `CourseOutline`, `LmsPlayer`,
`SharedCoursePlayer`, `SharedCourseJoin`, `LmsCoursePage`, `CourseCta` (section count). None of these are
used by evaluation screens; the lesson editor is reused only through its form parts.

### 3.2 Options compared

| Option | Change | Risk | Long-term |
|---|---|---|---|
| A. Hidden auto section | None in schema | Low technically, but every course path (outline, guest outline, progress, certificates, social) would treat the evaluation as a course; rejected by the product owner as an artificial structure | Poor: the fake section leaks into MCP, search, exports |
| B. Separate `lms_activity` table | New parent for questions/attempts/submissions/resources | High: questions, attempts, submissions, resources and comments all FK `lesson_id`; a second parent means polymorphic FKs or duplicated engines | Poor: two engines to maintain |
| C. Link table `lms_assessment_activity(lesson_id)` | Lesson still needs a section (`NOT NULL`) | Same as A plus a join | Poor |
| **D. Nullable `section_id` + DB invariant** | `section_id DROP NOT NULL`, trigger enforcing the parent rule, course guards | Low: course paths reach lessons through sections, so they never see activities; the few `course_id` queries only run for courses after the guard | Good: one lesson engine, clean evaluation structure |

**Chosen: D.** Invariant, enforced by a trigger (not only by services):
- `lms_lesson.section_id IS NULL` ⇔ its course has `kind = 'assessment'`.
- `lms_section` rows may only belong to `kind = 'course'`.
- `lms_course.kind` cannot change after insert.

Plus service guards: course listings filter `kind = 'course'`; course lookups add `kind: 'course'` to their
`where`, so an assessment id answers 404 on every course endpoint; evaluation lookups add
`kind: 'assessment'`. A route test calls every course endpoint with an assessment id.

---

## 4. Security of the 16 `lms_*` tables

Findings (local test database, read-only): the API and worker connect as `postgres`, owner of the tables,
`rolbypassrls = true`, not superuser. `anon` and `authenticated` have no `SELECT` on `lms_course`. No code
uses PostgREST or Realtime on `lms_*` (grep: no `from('lms_…')`). Production was not checked (blocker B2).

Strategy:
1. Read-only check on every instance before deploying (script `scripts/lms-rls-audit.mjs`, prints per table:
   RLS on/off, `anon`/`authenticated` privileges, owner, current role bypass). No values, no rows.
2. Hardening migration, same pattern as `20270108500000_bookings_pos_hardening`:
   `ENABLE ROW LEVEL SECURITY` (not `FORCE`) + `REVOKE ALL ... FROM PUBLIC, anon, authenticated` on the 16
   tables and the new ones. No policies: no client role should touch them; the owner role keeps full access.
3. Proof before commit: full `routes/lms/__tests__` and MCP LMS suites, the E2E smoke (course + share link +
   evaluation), and a negative check that `SET ROLE anon` / `authenticated` cannot select a row.
4. Multi-company isolation stays in the API (every query by `company_id`; public endpoints resolve the company
   from the share token). Covered by tests: company A user cannot read company B evaluation, session, record,
   files or exports; guest of evaluation X cannot read evaluation Y.

---

## 5. Data model (additive forward migrations)

```
lms_course       + kind TEXT NOT NULL DEFAULT 'course' CHECK (kind IN ('course','assessment'))
                 + settings JSONB NOT NULL DEFAULT '{}'
                   -- assessment: timeLimitMinutes, maxSessions, opensAt, closesAt, instructions,
                   --             passingPoints, showResultsToCandidate, materialAfterSubmit, sourceCourseId
                 index (company_id, kind, status)
lms_lesson       section_id DROP NOT NULL ; index (course_id, position) WHERE section_id IS NULL
                 triggers: parent invariant (section 3.2)

lms_assessment_session
  id uuidv7, company_id, course_id, enrollment_id, number INT
  status TEXT       -- in_progress | submitted | expired | graded | voided
  started_at, expires_at NULL, submitted_at NULL, graded_at NULL
  closed_reason NULL  -- learner | timeout | manager
  snapshot JSONB    -- frozen at start: [{ lessonId, kind, title, maxPoints }], timeLimitMinutes
  score_points NULL, max_points NULL, extended_minutes INT NOT NULL DEFAULT 0
  decision NULL, decision_note NULL, decision_by_id NULL, decided_at NULL
  created_at, updated_at
  UNIQUE (enrollment_id, number); UNIQUE (enrollment_id) WHERE status = 'in_progress'

lms_enrollment   + extra_sessions INT NOT NULL DEFAULT 0
lms_quiz_attempt + session_id UUID NULL FK
lms_submission   + session_id UUID NULL FK, + points DOUBLE PRECISION NULL, + rubric_scores JSONB DEFAULT '{}'
                 status gains 'draft' and 'missing'; `grade` (0–100, courses) untouched
lms_submission_file (id, company_id, submission_id, file_id, version, size_bytes, sha256 NULL, replaced_at NULL, created_at)
lms_lesson_resource  lesson_id DROP NOT NULL, + course_id NULL, CHECK (lesson_id IS NOT NULL OR course_id IS NOT NULL)
lms_course_grader (company_id, course_id, user_profile_id, created_at)  PK (course_id, user_profile_id)
lms_grade_event (id, company_id, session_id NULL, source_type, source_id, actor_id, action,
                 before JSONB, after JSONB, reason NULL, created_at)        -- append-only
```

JSON settings (no migration): assignment `maxPoints` (default 100), `acceptedTypes`, `maxFileBytes`,
`rubric: [{ id, label, points, description? }]`; share settings `opensAt`, `closesAt`, `dedupeByEmail`,
`consent: { required, noticeText }`.

---

## 6. Session lifecycle

### 6.1 States and transitions

```
(registered) --start--> in_progress --learner submit--> submitted --all points set--> graded
                             |                              ^                           |
                             +--deadline (sweep/lazy)--> expired ----all points set-----+
                             +--manager void-----------> voided   (any non-graded state; data kept)
graded --regrade--> graded (new event, totals recomputed)    graded --decision--> graded (+decision)
```

| Stage | Meaning | Who/what | Server rule |
|---|---|---|---|
| Registro | Learner + enrollment exist, no session. Internal: assignment or self-enroll; external: public form | Candidate / manager | No clock. Registration never starts a session |
| Inicio | `POST .../sessions` | Candidate | Published, inside `opensAt..closesAt`, sessions < `maxSessions + extra_sessions`, no open one (partial unique index ⇒ second call returns the same session). Writes `started_at`, `expires_at = started_at + timeLimitMinutes` (or NULL), snapshot |
| Progreso | Activities opened in any order; quiz attempts created on first open with `deadline_at = expires_at`; assignment draft created on first save | Candidate | Every read returns `serverNow`, `expiresAt`, per-activity state |
| Guardado | Answers merge per question (existing); drafts update text/files | Candidate | Accepted until `expires_at + 30 s`; after: `409 EXPIRED` and close |
| Entrega | `POST .../sessions/:id/submit` | Candidate | Idempotent; runs the close policy |
| Vencimiento | `expires_at + 30 s` passed | Worker sweep (every minute) or lazy on next request | Close policy with `closed_reason = timeout`, status `expired` |
| Abandono | Expired with nothing saved | Derived (`abandoned: true` in payloads, no answers and no files) | Kept as a record; counts as a used session |
| No presentado | Registered, never started, window closed | Derived in results | No session row |
| Revisión | Submitted/expired with manual items pending | Graders | Open answers, rubric/points per assignment |
| Cierre | All activities have points ⇒ `graded`, totals stored | System, on each grade | Decision and regrades afterwards, audited |
| Incidencias | Extend time while in progress; void; grant an extra session | Manager (`lms.enrollment.manage`) | Each writes `lms_grade_event` with a reason |

### 6.2 Close policy

In one transaction, guarded by `updateMany ... WHERE status = 'in_progress'` (idempotent):
1. Open quiz attempts close with saved answers (existing `close()`); open questions stay pending.
2. Drafts with text or a confirmed current file become `submitted`; empty ones become `missing`. Nothing is
   deleted.
3. Session becomes `submitted` (`learner`) or `expired` (`timeout`); `submitted_at` set.
4. If no manual item is pending, the session is graded at once. Reviewers are notified once.

### 6.3 Files and the clock

- Presign refused once `now > expires_at`.
- Confirm accepted until `expires_at + 5 min` only for assets presigned before `expires_at`
  (`FileAsset.createdAt`); otherwise `409 EXPIRED`. A confirmed file after close attaches to the already
  submitted delivery only inside that window (recorded as a version with its time).
- Draft file replacement creates a new version; deletions are soft (`replaced_at`).

### 6.4 Client

- `offset = serverNow - receivedAt + rtt/2`; remaining = `expiresAt - (Date.now() + offset)`; warnings at 10,
  5 and 1 min (toast + `aria-live`); the timer lives in the runner header, outside the activity view.
- Unsent answers stay in `localStorage` per session (best effort) and are flushed on reconnect; the server
  response wins; after expiry the UI shows what was saved.
- Reload/other device: `GET .../session` returns the open session.

---

## 7. Material for external participants

- Material lives in `lms_lesson_resource` at evaluation level (`course_id`) or activity level, chosen from
  Archivos (existing picker), files stay `PRIVATE`.
- Endpoint `GET /public/lms/evaluacion/:token/resources/:resourceId/download` (guest token) and the internal
  equivalent: allowed only while the caller's session is `in_progress`, or after it closed when
  `materialAfterSubmit` is on. Returns `{ url, fileName, expiresInSeconds: 120 }` from a fresh signed URL; the
  payloads list resources by `lms_lesson_resource.id`, name, size and type only (no file ids, buckets or
  paths). Rate-limited per guest.
- Without a Runly session: authorization is the guest token (hashed at rest) bound to the enrollment and
  session; a revoked invite or disabled link stops downloads at once (existing `loadGuest` rules).

---

## 8. Public registration and links

Route `/app/p/lms/evaluacion/<token>`. Steps: Información → Registro → Confirmar inicio → Resolver → Revisar y
enviar → Confirmación (submission time and folio).

- Intake: name always; presets `correo`, `telefono`, `empresa`, `puesto`, `numero_empleado` + new `ciudad`;
  custom fields up to 10; new `consent` type (required checkbox with the notice text; stored with timestamp).
- Window `opensAt/closesAt`, `maxSessions`. Individual links, revocation, rotation: existing invite mode.
- Duplicates (`dedupeByEmail`, default on for evaluations): same email ⇒ no new learner,
  `409 ALREADY_REGISTERED`, optional resume email with a one-time code (invite machinery).
- Abuse: existing join/access rate limiters; server validation of every field; IP stored only as an auxiliary
  signal, never used to identify or block by itself.

---

## 9. Consolidated grading model

- **Activity maximum**, frozen in the session snapshot at start (edits after a session starts never change
  it): quiz = sum of points of the questions drawn for that attempt; assignment = `settings.maxPoints`
  (default 100; with a rubric, the rubric points must sum to it).
- **Activity score**: quiz = `score_points` (auto + manual per open question, existing engine); assignment =
  `lms_submission.points` (direct, 0..max, 2 decimals) or the sum of `rubric_scores` when a rubric exists.
  `missing` = 0.
- **Total** = Σ activity scores; **maximum** = Σ snapshot maxima; may exceed 100; percent is display only.
  Optional `passingPoints` (absolute). Nothing is renormalized.
- **Course assignments keep `grade` 0–100** exactly as today; `points` is used only for session-bound
  submissions.
- **Regrade**: allowed on graded items of a session with a mandatory reason; every grading action writes
  `lms_grade_event` (before/after); totals recomputed from stored values in the same transaction.
- **Concurrency**: grading sends `expectedUpdatedAt`; `updateMany ... WHERE updated_at = expected` ⇒ `409
  CONFLICT` for the second grader.
- **Graders**: rows in `lms_course_grader` restrict an evaluation to those users plus course managers;
  otherwise any `lms.grade` holder.
- **Decision** (`pending | advance | hold | reject` + note), permission `lms.assessment.decide`, stored on the
  session, never part of the score, audited.
- **PVR**: questionnaire 10 open questions = 100 points (their current points preserved); practical exercise
  `maxPoints = 100` with a 7-criterion rubric; total 200.
- Export: results CSV/XLSX per evaluation (one row per session: candidate, intake answers, times, points per
  activity, total, status, decision).

---

## 10. Acceptance case and controlled clone

Case A: one evaluation, two activities (questionnaire 10 open questions / 100 points; Excel exercise
7 items / 100 points, Excel delivery + optional presentation), 60 minutes total, one session, public
registration, link access, graded by the commercial manager, 200 points.

Script `scripts/lms-clone-course-to-assessment.mjs --source <courseId> [--apply] [--rollback <assessmentId>]`:
1. Dry run (default): prints counts and a checksum of the source (lessons, questions, Σ points per lesson,
   resource file ids, enrollments, attempts, submissions) and the planned mapping. Read-only.
2. `--apply`: one transaction creates the draft evaluation (`settings.sourceCourseId`), activities, questions,
   resources (same `FileAsset` ids, no copies); recomputes the checksum on the copy and rolls back on any
   difference. Writes a JSON report.
3. Source course, share link, enrollments, attempts, submissions untouched. The evaluation results view shows
   them read-only as "historial del curso original".
4. `--rollback`: archives the evaluation (`enabled = false`) if it has no sessions; otherwise refuses.
5. Rehearsed on a local disposable copy of the same structure. The production run is done by the product
   owner after deploy; Claude never runs it there.

Blockers: **B1** real content of the course (whether the 7 items are questions or instructions, where the Excel
lives, how candidates get it today) — answered by the dry run, mapping adjusted then. **B2** production RLS and
privileges — answered by `lms-rls-audit.mjs`.

---

## 11. UX

Administration:
- Navigation adds **Evaluaciones** (`/assessments`, `lms.course.manage`). Cursos and Evaluaciones lists each
  have their create button; Mis cursos (managers) shows both "Crear curso" and "Crear evaluación".
- Evaluations list: DataTable (Evaluación, Estado, Actividades, Puntos, Tiempo, Participantes, Por revisar,
  Actualizado) + ChipTabs by status.
- Editor `/assessments/:id`, tabs: **Actividades** (sortable list of activity cards with type, points, open
  editor; "Agregar actividad" type picker), **Configuración** (title, instructions, time limit none/minutes,
  sessions, window, results visibility, passing points), **Material**, **Compartir** (reuses `ShareLinkTab`,
  `IntakeFieldsEditor`, `GuestInvitesPanel`), **Resultados** (sessions table, export), **Evaluadores**.
- Activity editor `/assessments/:id/activities/:activityId`: reuses `LessonEditorForm` parts without the
  section field, `QuizQuestionsEditor`, `AssignmentSettingsFields` (+ points, accepted types, size, rubric),
  `LessonResourcesEditor`.
- Candidate record: wide `FormSheet` (like the review sheets): header (candidate, status, times), timeline,
  one panel per activity (answers via `QuestionReview`/`AnswerReview`; files with versions via
  `SubmissionFileList`), aside with points/rubric inputs, history, decision.
- Revisión queue: session-bound items open the candidate record on that activity; filter Cursos/Evaluaciones.

Participant (internal `/evaluate/:id` full screen, external public route): shared `AssessmentRunner` with an
API adapter (internal or guest client): intro + rules → confirm start → fixed header (timer, save state,
submit) → activity stepper/tabs with completion marks → final review (unanswered items, missing files) →
confirmation. `QuizAttempt` gains a session mode (no own timer, no own submit, no auto-submit).
At 360 px the stepper collapses to a select-like list, the header stays fixed, bodies scroll; no hover-only
actions; upload targets ≥ 44 px; light/dark via tokens; `@runly/ui` first; modals follow the dialog standard.

---

## 12. Acceptance criteria and tests (summary; per phase in the plan)

Unit: remaining time with offset; expiry with grace; upload grace; close policy per activity state; snapshot
maxima; total and rubric sums; regrade event; dedupe; window; invariant helpers.
Integration: course endpoints 404 for an assessment id; start twice ⇒ same session; sessions over the limit ⇒
409; write after expiry ⇒ 409 + expired; submit twice ⇒ same result; presign after expiry ⇒ 409; confirm in
grace ok, after ⇒ 409; wrong size/magic ⇒ 400; guest A vs guest B; company A vs B; grader not listed ⇒ 403;
concurrent grade ⇒ one 409; existing suites green.
E2E (disposable harness, local test company): case A built from scratch; guest flow with reload, activity
switch, material download, Excel upload and replacement, timeout; grading 200 points with regrade and
decision; export. Playwright at 360×740, 768×1024, desktop; client clock ±10 min.

---

## 13. Future: Formularios

`runly.forms` (not built) needs public/private forms, anonymous or identified answers, one or many answers,
conditional logic, files, scales, NPS/CSAT, statistics, export; `runly.growth` already has a lead form builder
(`2026-09-21-growth-forms-design.md`) to reconcile with. Kept reusable without coupling to courses:
- Question engine (`lms-question-input.js`, `lms-question-attempt.js`) and intake rules
  (`lms-intake-core.js`, including the new `consent` type) stay pure with no LMS imports, ready to move to a
  shared package unchanged.
- Upload integrity check and the short-lived download helper are written as generic helpers in `lib/`.
- The session/timer engine stays LMS-specific.

---

## 14. Recommendation

Evaluations as a `kind` of the course row, section-less activities guarded by a DB invariant, one session that
owns the clock and freezes the scoring snapshot, and a session-aware `lessonContext` injected into the
existing quiz and assignment services. Every existing course and grade keeps its meaning; new concepts are
limited to the session, file versions, grade events, graders and the decision.
