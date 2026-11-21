# runly.lms — Standalone evaluations (design)

Date: 2026-11-21. Status: draft, awaiting product-owner approval. Implementation must not start before
this spec is approved; each phase gets its own plan in `docs/superpowers/plans/`.

Scope: evolve Aprendizaje (`runly.lms`) so it offers two modes, **Cursos** and **Evaluaciones**, reusing the
existing quiz, assignment, upload, share-link and review engines. No new module, no rewrite, no destructive
migration. A future `runly.forms` module is considered in the design but not built.

Privacy: the real acceptance case belongs to a customer. Its company name and production record ids stay
out of this repository; they are passed at run time to the conversion script (section 9).

---

## 1. Audit — how runly.lms works today

Evidence: read of `apps/api/src/routes/lms/*` (6.9k lines, 23 test files), `prisma/migrations/*lms*`
(11 migrations), `apps/desktop/src/modules/runly.lms/*`, `packages/sdk/src/domains/lms.js`, a read-only query
of the local test database (2026-11-21). The acceptance course is **not** in the local database; its current
content could not be verified (see section 9, blocker B1).

### 1.1 Architecture

- API: Hono routers `lms-routes.js`, `lms-eval-routes.js`, `lms-experience-routes.js`, `lms-cert-routes.js`,
  `lms-social-routes.js`, public `lms-share-public.js` and `lms-public.js`. Logic lives in services built as
  `createXxxService({ prisma, ... })` with pure rule files (`lms-eval-core.js`, `lms-share-core.js`,
  `lms-intake-core.js`, `lms-question-*.js`) that have no I/O and are unit tested.
- Data: Prisma models (`LmsCourse`, `LmsSection`, `LmsLesson`, `LmsQuizQuestion`, `LmsQuizAttempt`,
  `LmsSubmission`, `LmsLearner`, `LmsEnrollment`, `LmsLessonProgress`, `LmsLessonResource`, `LmsGuestInvite`,
  certificates, social). Tenant isolation is by `company_id` in every query (no FK to company).
- Key reuse seam already in the code: the quiz and assignment services take an injected
  `learn.lessonContext`, `ownsAttempt` and upload `owner`. The guest service uses it to run the same engine for
  share-link guests (`guestLearn`, `GUEST_OWNER`). The evaluation session engine plugs in the same way.
- UI: screens `LmsHome`, `LmsCourses`, `LmsCourseEditor`, `LmsLessonEditor`, `LmsPlayer`, `LmsReview`,
  `LmsCertificates`; public `SharedCourse*` under `/app/p/lms/curso/<token>`.

### 1.2 Inventory and gaps

| Feature | Current state (verified in code) | Problem | Proposed solution | Priority |
|---|---|---|---|---|
| Courses | Sections, lessons (video, text, file, embed, quiz, assignment), progress, sequential unlock, certificates, social, HLS | None for this scope | Reuse unchanged | — |
| Evaluations | None. An exam must be a course with a section and lessons | Artificial structure; course UX (progress, certificates, curriculum) is wrong for candidates | `lms_course.kind = 'assessment'`; activities are lessons with no section (section 3) | High |
| Question kinds | 9 kinds: single, multiple, true_false, open, short, numeric, ordering, matching, fill_blank. All auto-scored except `open` | None | Reuse as-is | — |
| Quiz attempts | Server `deadline_at` per attempt, 30 s grace, lazy close on read, idempotent submit, P2002 race handled, draw/shuffle, max attempts, extra attempts | Timer is per quiz lesson; two quizzes = two clocks | Session-level `expires_at` feeds every attempt's `deadline_at` | Critical |
| Global timer | None. Assignments have no time limit (only `dueDaysAfterEnroll`) | Cannot express "60 min for the whole exam" | `lms_assessment_session` (section 4) | Critical |
| Client countdown | `QuizAttempt.jsx` counts against `Date.now()` | A wrong device clock shows a wrong remaining time (the server still decides) | Every session response carries `serverNow`; client keeps an offset | High |
| Expiry closing | Only lazily, when the learner reads or writes again | An abandoned attempt never reaches the review queue | Worker sweep every minute plus the lazy close | High |
| Assignment submissions | Text + files, max 10 files, 50 MB, MIME allow-list, direct signed upload (no base64), history, late flag | No draft or autosave; a pending submission cannot be replaced; grade fixed on a 0–100 scale | `draft` status inside a session, replaceable files with versions, `maxPoints` scale | High |
| Downloadable material | `lms_lesson_resource` per lesson | Guests never see resources (`lms-guest-service.js` returns `resources: []`); external candidates cannot download the exercise file | Session-gated resource download with short-lived signed URLs | High |
| Upload integrity | Presign validates declared name/type/size; confirm only checks the object exists | Real size and type are never checked; no hash | Confirm checks stored size and magic bytes; worker stores SHA-256 | High |
| Public link | Share token, open/invite modes, rotation, revoke, hashed guest token, join/access rate limits, email invites with access code | No availability window, no consent, no `ciudad`, max 5 custom fields, open links allow duplicate registrations | Extend share settings and intake (section 6) | High |
| Grading | Review queue + history, grade open answers per question, approve/return submissions, notifications, guest grade email | No regrade, no change history, no rubrics, no per-candidate record, no evaluation total, no export, any `lms.grade` holder sees every course | Section 7 | High |
| Score vs decision | Not modeled | Hiring decisions would end up in the score | Separate `decision_*` fields with their own permission | Medium |
| RLS | Disabled on all 16 `lms_*` tables; other modules have a hardening migration (`ENABLE RLS` + `REVOKE ... anon, authenticated`) | Local DB: `anon` has no privileges (checked). Production not checked | Same hardening migration for `lms_*` | Medium |
| Tests | Unit + route tests for eval core, routes, share, invites, review history, question kinds | No E2E for timed multi-activity flows | Section 10 | — |
| Mobile | Player and public screens responsive; `keyboardSafeFocus` for guests | Untested for a timed multi-activity session | Section 8 + Playwright viewports | Medium |

---

## 2. Decisions

1. **An evaluation is an `lms_course` row with `kind = 'assessment'`.** It reuses identity, status
   (draft/published/archived), share link, learners, enrollments, guest tokens, invites, notifications and
   permissions. Adding a parallel table would duplicate all of that.
2. **Activities are `lms_lesson` rows with `section_id IS NULL`**, ordered by `position`. No artificial section.
   Course code paths load lessons through sections, so they never see activities; evaluation code loads
   activities by `course_id`.
3. **Activity types map onto the existing engines**, nothing new to score:
   - Cuestionario → `quiz` (any of the 9 question kinds).
   - Respuesta escrita extensa → `quiz` with `open` questions (manual points per question).
   - Entrega de archivos / Actividad práctica → `assignment` with resources (material) and files.
   - Actividad mixta → an evaluation that holds several activities (the acceptance case). A `file` question
     kind inside a quiz is **not** in this scope; it can be added later if a real case needs it.
4. **One session per evaluation attempt** (`lms_assessment_session`) owns the clock. Quiz attempts and
   submissions created inside it carry `session_id` and inherit `expires_at`.
5. **Points are the weights.** Evaluation total = sum of activity points. Percentages are display only. No
   renormalization.
6. **The existing acceptance course is cloned, never mutated** (section 9).

---

## 3. Data model (one additive forward migration per phase)

```
lms_course
  + kind TEXT NOT NULL DEFAULT 'course'  CHECK (kind IN ('course','assessment'))
  + settings JSONB NOT NULL DEFAULT '{}'   -- assessment: timeLimitMinutes, maxSessions, instructions,
                                           --             showResultsToCandidate, sourceCourseId
  index (company_id, kind, status)

lms_lesson
  section_id DROP NOT NULL                 -- NULL only for assessment activities (enforced in service + test)
  index (course_id, position) WHERE section_id IS NULL

lms_assessment_session
  id uuidv7, company_id, course_id, enrollment_id, number INT
  status TEXT  -- in_progress | submitted | expired | graded | voided
  started_at, expires_at NULL, submitted_at NULL, closed_reason NULL  -- learner | timeout | manager
  time_limit_minutes INT NULL               -- snapshot at start
  score_points, max_points, score_pct NULL  -- set when every activity is graded
  decision TEXT NULL, decision_note TEXT NULL, decision_by_id UUID NULL, decided_at NULL
  created_at, updated_at
  UNIQUE (enrollment_id, number)
  UNIQUE (enrollment_id) WHERE status = 'in_progress'   -- one open session, makes start idempotent

lms_quiz_attempt  + session_id UUID NULL FK
lms_submission    + session_id UUID NULL FK, + rubric_scores JSONB NOT NULL DEFAULT '{}'
                  status gains 'draft' and 'missing' (closed with nothing delivered)

lms_submission_file                        -- versions and integrity of delivered files
  id, company_id, submission_id, file_id, version INT, size_bytes, sha256 NULL, replaced_at NULL, created_at

lms_lesson_resource  lesson_id DROP NOT NULL, + course_id UUID NULL   -- evaluation-level material
  CHECK (lesson_id IS NOT NULL OR course_id IS NOT NULL)

lms_course_grader (course_id, user_profile_id, company_id, created_at)  PK (course_id, user_profile_id)

lms_grade_event                            -- append-only grading audit
  id, company_id, source_type (attempt|submission|session), source_id, actor_id,
  before JSONB, after JSONB, reason TEXT NULL, created_at
```

Settings kept in JSON (no migration): assignment `maxPoints` (default 100 = today's scale, so existing
grades keep their meaning), `acceptedTypes`, `maxFileBytes`, `rubric: [{ id, label, points }]`; share settings
`opensAt`, `closesAt`, `dedupeByEmail`, `consent: { required, noticeText }`.

Hardening migration: `ENABLE ROW LEVEL SECURITY` + `REVOKE ALL ... FROM PUBLIC, anon, authenticated` on
every `lms_*` table, same pattern as `20270108500000_bookings_pos_hardening`. Prisma uses the owner role and is
not affected.

---

## 4. Session and timer engine

### 4.1 Rules (pure, `lms-session-core.js`)

- `startSession`: allowed only when the evaluation is published, inside `opensAt..closesAt`, sessions used
  < `maxSessions`, and no open session exists. `expires_at = now + timeLimitMinutes` or `NULL` (no limit).
- Opening the link or registering never starts the clock. Only `POST .../sessions` does.
- Writes (answers, drafts, file confirm, submit) are accepted until `expires_at + SUBMIT_GRACE_MS` (30 s,
  existing constant). After that the API answers `409 EXPIRED` and the session closes.
- Uploads: presign is refused after `expires_at`. Confirm is accepted until `expires_at + UPLOAD_GRACE_MS`
  (5 min) **only** for files presigned before `expires_at`, so a large file started in time is not lost.
- Quiz attempts inside a session take `deadline_at = session.expires_at`; the quiz's own
  `timeLimitMinutes` is ignored there. Draw, shuffle and layout settings still apply.

### 4.2 Close policy (explicit)

When the candidate submits, or the deadline passes:

1. Every open quiz attempt is closed with its saved answers (existing `close()`; open questions go to review).
2. Every `draft` submission with text or a confirmed file becomes `submitted`; an empty one becomes `missing`.
   Nothing is deleted.
3. The session becomes `submitted` (`closed_reason = learner`) or `expired` (`closed_reason = timeout`).
4. Reviewers are notified once (existing notifier).

Closing is idempotent (`updateMany ... WHERE status = 'in_progress'`, same as quizzes) and runs in one
transaction. A worker job closes expired sessions every minute; the lazy close on read stays as a backstop.

### 4.3 Client

- Every session payload includes `serverNow`; the client stores `offset = serverNow - Date.now()` (corrected by
  half the round trip) and counts down to `expires_at`. Warnings at 10, 5 and 1 minute.
- The timer component lives outside the activity view, so changing activity never resets it.
- Autosave: answers debounce to the server; unsent changes are kept in `localStorage` per session and flushed on
  reconnect. The server response is the truth: after expiry the UI shows what was saved.
- Reload or another device: `GET .../session` returns the open session and remaining time.

---

## 5. Files

- Material: resources at evaluation level (`course_id`) or activity level (`lesson_id`), files from Archivos
  (existing picker). Guests and internal candidates download them only while their session is in progress (or
  after submission, if the creator allows it), through `GET .../resources/:id/download`, which checks the
  session and returns a signed URL valid for 120 s. No permanent URLs, no storage paths in payloads.
- Deliveries: per assignment activity `acceptedTypes` from a fixed allow-list (PDF, Word, Excel, PowerPoint,
  CSV/text, images, ZIP), `maxFiles` (1–10), `maxFileBytes` (≤ 50 MB platform cap). Uploads keep the direct
  signed-upload flow (no base64).
- Confirm now reads the stored object's size and first bytes: size must equal the declared size, and the magic
  bytes must match the declared family (`%PDF`, ZIP container for OOXML/ZIP, OLE for legacy Office). A mismatch
  disables the asset and answers 400. The worker computes SHA-256 into `lms_submission_file`.
- Replacing a file inside an open session adds a new version and marks the old one `replaced_at`; the
  reviewer sees every version.

---

## 6. Public registration and links

Route: `/app/p/lms/evaluacion/<token>` (public routes live under `/app/p`). Flow:
Información → Registro → Confirmar inicio → Resolver → Revisar y enviar → Confirmación (time stamp and folio).

- Registration creates learner + enrollment (existing `createGuestLearner`). Starting is a separate call.
- Intake: name always; presets `correo`, `telefono`, `empresa`, `puesto`, `numero_empleado` + new `ciudad`;
  custom fields raised from 5 to 10; new `consent` field type (required checkbox with the privacy notice text,
  answer stored with timestamp in `guest_profile`).
- Availability window `opensAt`/`closesAt`; `maxSessions` per participant.
- Duplicates: with `dedupeByEmail` (default on for evaluations) a second registration with the same email does
  not create a learner; the API answers `409 ALREADY_REGISTERED` and can email a resume link using the invite
  machinery (one-time code, hashed). Lets a candidate continue on another device without a second attempt.
- Individual links, revocation and rotation: existing invite mode and share rotation.
- Abuse: existing join/access rate limiters, server-side validation of every field. IP is logged as an
  auxiliary signal only; it never identifies a person or blocks by itself.
- Guests never receive internal ids beyond what they already get today (lesson ids after joining).

---

## 7. Grading and results

- Per-candidate record `GET /lms/assessment-sessions/:id`: intake data, status, start/end/expiry, time used,
  quiz answers, delivered files with versions, points per activity, total, grader notes, grade history
  (`lms_grade_event`), decision.
- Automatic scoring where the kind allows it (existing). Manual points per open question (existing). Assignment
  activities: points 0..`maxPoints`, optional rubric (criteria points must sum to `maxPoints`; the grade is their
  sum). Partial points allowed (2 decimals, existing rounding).
- Regrade: a graded attempt or submission can be corrected with a mandatory reason; every change writes
  `lms_grade_event` with before/after. The session total is recomputed from stored points, never re-scored.
- Concurrency: grading uses the existing `updateMany ... WHERE status` guard plus an `updated_at` check, so two
  graders cannot overwrite each other silently (`409 CONFLICT`).
- Graders: if an evaluation has rows in `lms_course_grader`, only those users (plus course managers) see and
  grade it. Otherwise any `lms.grade` holder, as today.
- Decision (`pending | advance | hold | reject`, note): new permission `lms.assessment.decide`; stored on the
  session, never mixed into the score, recorded in `lms_grade_event`.
- Results table per evaluation + export to CSV/XLSX (reuse the export helper other modules use; picked in the
  phase 5 plan).

---

## 8. UX

- Aprendizaje home for managers: two primary actions, **Crear curso** and **Crear evaluación**; the list filters
  by mode. Learners keep "Mis cursos" and get "Mis evaluaciones" only when they have one.
- Evaluation editor: settings (time, attempts, window, results visibility), activities list (add, reorder,
  edit with the existing quiz builder and assignment fields), material, share, graders. No sections,
  certificates or progress.
- Candidate screen: fixed header with timer and save state, activity tabs/stepper with completion marks, one
  scrollable body, final review page listing unanswered items and missing files. Works at 360 px; no
  hover-only actions; large touch targets for upload.
- Review: results table → candidate record in a large `Sheet` (fixed header/footer, scrolling body).
- Light/dark via existing tokens. All new components first checked against `@runly/ui`.

---

## 9. Acceptance case and conversion strategy

Case A (customer evaluation for a commercial analyst role): activity 1, questionnaire with 10 open questions
worth 100 points, manual grading; activity 2, Excel exercise with 7 items worth 100 points, Excel file delivery
(plus an optional presentation), manual grading. Target: one evaluation, two activities, 60 minutes total, one
attempt, public registration, link access, graded by the commercial manager, 200 points maximum.

Mapping: activity 1 = `quiz` with the 10 open questions (points kept as they are); activity 2 = `assignment`
with `maxPoints = 100`, a 7-criterion rubric matching the items, `acceptedTypes = [excel, powerpoint, pdf]`,
the original Excel as activity material; `timeLimitMinutes = 60`, `maxSessions = 1`; the manager in
`lms_course_grader`.

Strategy: **clone, do not convert.** A script `scripts/lms-clone-course-to-assessment.mjs`:

1. `--dry-run` (default) reads the source course and prints what it would create plus a checksum: question count,
   sum of points per lesson, resource file ids, enrollment/attempt/submission counts.
2. `--apply` creates a new `kind = 'assessment'` row in draft, copies lessons as activities, questions and
   resources (same `FileAsset` ids, no file copy), sets `settings.sourceCourseId`, and re-runs the checksum on
   the copy; any difference rolls the transaction back.
3. The source course, its share link, enrollments, attempts and submissions are untouched. Existing candidates
   stay graded where they are; the evaluation results view lists them read-only as "historial del curso
   original" through `sourceCourseId`.
4. Rollback: archive the new evaluation (`enabled = false`). Nothing else changed.

The production course id is an argument, never committed. The script is run by the product owner against
production after deploy; Claude does not run it there.

Blockers:
- **B1**: the course content (whether the 7 Excel items are questions, rubric text or a document; where the
  Excel lives; how candidates download it today, since guests cannot see lesson resources) can only be
  confirmed on production. The dry-run output answers it; the mapping above is adjusted after reading it.
- **B2**: the RLS state of production `lms_*` tables must be checked read-only before the hardening migration.

---

## 10. Phased plan

| Phase | Content | Depends on | Main risks |
|---|---|---|---|
| 0 | This audit + spec | — | — |
| 1 | Migration (kind, nullable section, settings, RLS hardening); assessment CRUD + activities API; "Crear evaluación" and editor UI; course code paths proven unchanged | 0 | Course queries that assume `section_id` non-null (grep + tests) |
| 2 | Session engine: table, start/get/submit, quiz attempts bound to session, close policy, worker sweep, `serverNow`, timer UI, autosave/offline queue | 1 | Races on start/close; clock skew; worker running against shared dev outbox (use in-process E2E) |
| 3 | Files: material download gate, assignment drafts in session, versions, confirm integrity, SHA-256 job, upload grace | 2 | Large uploads near deadline; storage metadata API differences |
| 4 | Public flow `/app/p/lms/evaluacion/<token>`: intake `ciudad`/`consent`, window, dedupe + resume email, lobby/confirm start | 2 | Privacy of intake data; abuse |
| 5 | Grading: points scale, rubrics, regrade + `lms_grade_event`, graders, record sheet, results table, export, decision | 2, 3 | Concurrent grading; keeping legacy assignment grades meaningful |
| 6 | UX polish pass on all new screens (14-aspect checklist), mobile/tablet, a11y | 1–5 | Scope creep into course screens |
| 7 | Clone script + dry-run/apply verification on a disposable copy; handoff for production run | 1–5 | B1 |
| 8 | Hardening and full regression (section 11) | all | — |

Each phase closes with its tests green, lint, `pnpm build:web` for UI phases, and the checklist evidence
(`Verified: YYYY-MM-DD (...)`). Nothing is pushed for deploy until phase 8 passes.

---

## 11. Acceptance criteria and tests

Unit (pure cores): remaining time and expiry with grace; upload grace window; close policy outcome per
activity state; total = Σ points; rubric sum; regrade event shape; dedupe decision; availability window;
`serverNow` offset helper.

Integration (route/service tests, existing style): start twice → same session; start after `maxSessions` → 409;
answer after expiry + grace → 409 and session `expired`; submit twice → same result; presign after expiry →
409; confirm within upload grace accepted, after → 409; confirm with wrong size or magic bytes → 400; guest A
cannot read guest B's session, files or resources; company A cannot read company B's evaluation; grader not
in `lms_course_grader` → 403; concurrent grade → one 409; course endpoints unchanged (existing suites stay
green).

E2E (disposable harness in `.e2e/lib`, local test company only): build case A from scratch; guest registers,
waits, starts, answers activity 1, switches to activity 2, reloads (time kept), downloads material, uploads an
Excel, replaces it, lets the clock run out → session expired with saved answers and the last file; manager
grades 10 open answers + rubric, total out of 200, regrades with reason, sets decision, exports. Playwright at
360×740, 768×1024 and desktop; client clock shifted ±10 min shows the right remaining time.

Not done here: no production data is read or written by tests; the clone script is exercised on a local copy.

---

## 12. Future: Formularios

`runly.forms` (not built now) will need public/private forms, anonymous or identified answers, one or many
answers, conditional logic, files, scales, NPS/CSAT, statistics and export. Note that `runly.growth` already
has a form builder for lead capture (`2026-09-21-growth-forms-design.md`); Formularios must reconcile with it.

What this design leaves reusable without coupling Formularios to courses:
- The question engine (`lms-question-input.js`, `lms-question-attempt.js`) and intake rules
  (`lms-intake-core.js`) are already pure with no LMS imports. New code keeps them that way, so they can move to
  a shared package when Formularios starts, with no behavior change.
- The public registration + consent pattern and the upload integrity check are generic helpers.
- The session/timer engine stays LMS-specific; forms do not need a clock.

---

## 13. Recommendation

Build evaluations as a `kind` of the existing course row, with section-less activities and a session that owns
one clock, injecting a session-aware `lessonContext` into the quiz and assignment services the same way the
guest service already does. This reuses the scoring, attempt, upload, share and review engines unchanged, keeps
every existing course and grade valid, and the only new concepts are the session, file versions, grade
events and graders. Clone the acceptance course instead of converting it.
