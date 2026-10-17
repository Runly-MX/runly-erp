# runly.lms Phase 2 (evaluation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quizzes (single/multiple/true-false/open, random draw, attempts, time limit, manual grading of open answers) and assignments (text/file submissions, return/approve, grade) as lesson kinds, plus a grading queue.

**Architecture:** Builds on the phase 1 tables and router (`apps/api/src/routes/lms/`). New lesson kinds `quiz` and `assignment` with a `settings` JSONB; three new tables; pure scoring rules in `lms-eval-core.js`; services split by concern (quiz, assignment, review); routes registered from `createLmsRouter` through `registerLmsEvalRoutes(app, deps)`. Spec: `docs/superpowers/specs/2026-10-16-lms-design.md` §11.

**Tech Stack:** Prisma 7, Hono, Node test runner, React + TanStack Query + `@runly/ui`.

**Precondition:** phase 1 committed. Read the phase 1 code first (`lms-core.js`, `lms-learn-service.js`, `lms-routes.js`, `packages/sdk/src/domains/lms.js`, `apps/desktop/src/modules/runly.lms/`) and reuse its names; where this plan names a helper that phase 1 implemented differently, adapt to phase 1 and note it.

---

## API contract additions (shared by both workstreams)

Lesson payloads gain `settings` (object). Learner outline lesson `status` adds `pending_review` and `failed`.

Learner-safe question: `{ id, kind, prompt, points, options: [{ id, text }] }` (options already in the attempt's display order, no `correct`).
Revealed question (after submit, per `showAnswers`): learner-safe + `options[].correct`, `explanation`, `awardedPoints`, `correct` (bool or null for ungraded open).
Attempt: `{ id, lessonId, number, status, startedAt, deadlineAt, submittedAt, answers, scorePct, passed, feedback, questions: Question[] }`.
Quiz summary: `{ settings, attemptsUsed, attemptsAllowed, bestScorePct, passed, currentAttemptId, lastAttempt: { id, status, scorePct, passed } | null }`.
Submission: `{ id, lessonId, number, status, text, files: [{ id, name, url }], submittedAt, late, grade, feedback, gradedAt }`.
Review item: `{ type: 'submission'|'attempt', id, courseId, courseTitle, lessonId, lessonTitle, learner: { id, displayName }, submittedAt, late? }`.

| Method | Path | Permission | Body | Returns |
|---|---|---|---|---|
| GET | `/lms/lessons/:id/questions` | lms.course.manage | — | full Question[] (with `correct`, `explanation`) |
| POST | `/lms/lessons/:id/questions` | lms.course.manage | `{ kind, prompt, options: [{ text, correct }], points, explanation }` | Question (201) |
| PATCH / DELETE | `/lms/questions/:id` | lms.course.manage | partial | Question / `{ id }` |
| POST | `/lms/lessons/:id/questions/reorder` | lms.course.manage | `{ questionIds }` | Question[] |
| GET | `/lms/learn/lessons/:id/quiz` | lms.access | — | Quiz summary |
| POST | `/lms/learn/lessons/:id/attempts` | lms.access | — | Attempt (201 new, 200 resumed); 409 `NO_ATTEMPTS`, 409 `NO_QUESTIONS` |
| GET | `/lms/learn/attempts/:id` | lms.access | — | Attempt (auto-submits if expired) |
| PUT | `/lms/learn/attempts/:id/answers` | lms.access | `{ answers }` | `{ savedAt }`; 409 `EXPIRED` |
| POST | `/lms/learn/attempts/:id/submit` | lms.access | `{ answers? }` | Attempt with reveal + `{ lessonStatus, enrollment }` |
| GET | `/lms/learn/lessons/:id/submissions` | lms.access | — | `{ settings, dueAt, submissions: Submission[] }` (newest first) |
| POST | `/lms/learn/lessons/:id/submissions` | lms.access | `{ text, fileIds }` | Submission (201); 409 `PENDING` / `APPROVED` |
| POST | `/lms/learn/uploads/presign` | lms.access | `{ fileName, mimeType, sizeBytes }` | `{ fileId, uploadUrl, token }` |
| POST | `/lms/learn/uploads/:fileId/confirm` | lms.access | — | `{ fileId, fileName }` |
| GET | `/lms/review` | lms.grade | `?courseId=` | Review item[] (oldest first) |
| GET | `/lms/review/attempts/:id` | lms.grade | — | Attempt with every question revealed + `learner`, `course`, `lesson` |
| POST | `/lms/review/attempts/:id/grade` | lms.grade | `{ points: { questionId: n }, feedback }` | Attempt |
| GET | `/lms/review/submissions/:id` | lms.grade | — | Submission + `history`, `learner`, `course`, `lesson` |
| POST | `/lms/review/submissions/:id/grade` | lms.grade | `{ decision: 'approve'\|'return', grade?, feedback? }` | Submission |
| POST | `/lms/enrollments/:id/lessons/:lessonId/extra-attempt` | lms.grade | — | `{ extraAttempts, lessonStatus }` |

SDK additions on `runly.lms` (token last): `listQuestions(lessonId)`, `createQuestion(lessonId, data)`, `updateQuestion(id, data)`, `deleteQuestion(id)`, `reorderQuestions(lessonId, questionIds)`, `getQuiz(lessonId)`, `startAttempt(lessonId)`, `getAttempt(id)`, `saveAnswers(id, answers)`, `submitAttempt(id, answers)`, `listSubmissions(lessonId)`, `submitAssignment(lessonId, data)`, `presignUpload(data)`, `confirmUpload(fileId)`, `getReviewQueue(query)`, `getReviewAttempt(id)`, `gradeAttempt(id, data)`, `getReviewSubmission(id)`, `gradeSubmission(id, data)`, `grantExtraAttempt(enrollmentId, lessonId)`.

---

## Workstream A — Backend

### Task A1: Migration `20261020000000_lms_evaluation`
- [ ] Prisma: `LmsLesson.settings Json @default("{}")`; `LmsLessonProgress.extraAttempts Int @default(0) @map("extra_attempts")`; models `LmsQuizQuestion` (`lms_quiz_question`), `LmsQuizAttempt` (`lms_quiz_attempt`, `questionIds String[] @db.Uuid`, `optionOrder Json`, `answers Json @default("{}")`, `manualPoints Json @default("{}")`, numeric scores as `Float?`), `LmsSubmission` (`lms_submission`, `fileIds String[] @db.Uuid`) per spec §11.3 with cascades and uniques; indexes `[lessonId, position]` on questions, `[status]` + `[enrollmentId, lessonId]` on attempts and submissions.
- [ ] Hand-written SQL, `prisma migrate diff` empty, `pnpm db:migrate`. If phase 1 added a CHECK on `lms_lesson.kind` or `lms_lesson_progress.status`, drop and recreate it with the new values in this migration.

### Task A2: Pure rules `lms-eval-core.js` (TDD)
```js
export const QUESTION_KINDS = ['single', 'multiple', 'true_false', 'open']
export const SUBMIT_GRACE_MS = 30_000
export const SUBMISSION_MAX_BYTES = 50 * 1024 * 1024
export const SUBMISSION_MIME = [/^image\//, /^audio\//, /^video\//, /^application\/pdf$/, /^text\/plain$/, /^application\/msword$/, /^application\/vnd\.openxmlformats/, /^application\/vnd\.ms-/, /^application\/zip$/, /^application\/x-zip/]
export function normalizeQuizSettings(raw)        // defaults + clamps from spec §11.2
export function normalizeAssignmentSettings(raw)
export function normalizeQuestionInput(body, { partial, existing }) // validates kind/prompt/points; options: single needs >=2 options and exactly 1 correct; multiple >=2 and >=1 correct; true_false -> fixed [{id:'true',text:'Verdadero'},{id:'false',text:'Falso'}] with one correct; open -> []; generates option ids `o` + 6 base36 chars, keeping ids of existing options matched by position when editing
export function drawQuestions(questions, settings, random = Math.random) // -> { questionIds, optionOrder } honoring drawCount, shuffleQuestions, shuffleOptions (true_false never shuffled)
export function scoreAttempt(questions, answers, manualPoints = {}) // -> { perQuestion: { [id]: { awarded: number|null, correct: bool|null } }, autoPoints, maxPoints, needsReview, scorePoints, scorePct }
export function attemptsAllowed(settings, extraAttempts) // Infinity when maxAttempts null
export function isExpired(attempt, now = new Date()) // deadlineAt && now > deadlineAt + grace
export function learnerQuestion(question, optionOrder) // strips correct/explanation, applies order
export function revealAllowed(showAnswers, passed)   // never -> false; after_submit -> true; after_pass -> passed
export function assignmentDueAt(enrollment, settings) // Date | null
export function validateSubmission({ text, fileIds }, settings, latest) // throws LmsError 400 / 409 PENDING / 409 APPROVED
export function validateGradeDecision({ decision, grade }, settings) // approve with passingScore requires grade >= passingScore
```
- [ ] Tests in `__tests__/lms-eval-core.test.js`: option validation per kind; option ids stable on edit; draw honours drawCount and returns all when null, deterministic with a seeded random; scoring single/true_false right & wrong, multiple all-or-nothing (subset = 0), open pending -> needsReview + scorePct null until manual points given, manual points clamped to [0, points]; attempts allowed with extra; expiry with grace; learner question has no `correct`; reveal matrix; due date; submission validation (empty, files not allowed, pending, approved, returned ok); grade decision with/without passingScore.
- [ ] Extend `lms-core.js` `LESSON_KINDS` with `quiz`, `assignment`; `normalizeLessonInput` normalizes `settings` by kind; `lessonStates` treats only `completed` as unlocking and passes `pending_review`/`failed` through. Update the phase 1 tests that enumerate kinds.

### Task A3: Services and routes
- [ ] `lms-progress.js`: extract from phase 1 the enrollment/progress update so every evaluator uses one function: `setLessonOutcome(tx, { enrollment, lessonId, status })` — upsert progress (`completed` sets `completedAt`, never downgrades a completed row), recompute `progressPct`, complete the enrollment at 100, return `{ lessonStatus, enrollment }`. Phase 1 progress endpoint must call it (no behaviour change; phase 1 tests must still pass).
- [ ] `lms-quiz-service.js`: question CRUD/reorder (lesson must be kind `quiz` and belong to the company); `getQuizSummary`, `startAttempt` (resolve learner enrollment + lock check via phase 1 outline logic, resume in_progress, check attempts, draw, `deadlineAt`), `getAttempt` (owner only; auto-submit if expired), `saveAnswers` (merge, only ids in `questionIds`, reject when expired -> auto-submit + 409 `EXPIRED`), `submitAttempt` (score; no open -> `graded` + outcome `completed` if passed else `failed` when no attempts left else `in_progress`; with open -> `submitted` + outcome `pending_review`; notify graders via `lms.submission.received` when needs review). Use a `$transaction` with `SELECT ... FOR UPDATE` style guard (`updateMany where status = 'in_progress'` count check) so double submit is idempotent.
- [ ] `lms-assignment-service.js`: list (sign file URLs, owner only), submit (`validateSubmission`, files must be `LmsSubmission` assets of the company uploaded by this profile and confirmed, `late`, outcome `pending_review`, notify `lms.submission.received` to course `createdById`), learner upload presign/confirm (reuse the phase 1 media helper with a purpose parameter: `{ entityType: 'LmsSubmission', mime: SUBMISSION_MIME, maxBytes }`).
- [ ] `lms-review-service.js`: queue (submissions `submitted` + attempts `submitted`, company scoped, optional course filter, oldest first), review attempt (reveal everything), grade attempt (`manualPoints` for every open question required, else 400; final score; outcome `completed`/`failed`/`in_progress`; status `graded`; notify learner `lms.submission.graded`), review submission (with history and signed files), grade submission (`validateGradeDecision`; approve -> outcome `completed`; return -> outcome `in_progress`; notify learner), extra attempt (increment, `failed` -> `in_progress`).
- [ ] `lms-eval-routes.js` exporting `registerLmsEvalRoutes(app, { prisma, requirePermission, signFile, supabaseAdmin, bucket, notificationService, run })`, called from `createLmsRouter`; pass `notificationService` from `apps/api/src/index.js` mount.
- [ ] Notifications: `notificationService.publish({ companyId, actorId, input: { eventType, title, body, link, recipients: { userIds: [profileId] }, channels: ['in_app', 'web_push'], priority: 'medium' } })`, link `/app/m/runly.lms/learn/<courseId>` for learners and `/app/m/runly.lms/review` for graders; labels `"lms.submission.graded": "Actividad calificada"`, `"lms.submission.received": "Nueva entrega por revisar"` in `apps/api/src/services/notification-delivery-worker.js` event map. Failures to notify are logged and never fail the request.
- [ ] Manifest: permission `lms.grade` "Calificar actividades y tareas" (+ permission-catalog entry), navigation `{ label: 'Revisión', path: '/review', icon: 'ClipboardCheck', permissionKey: 'lms.grade' }`, ownedEntities += 3 models, version bump `0.2.0`. Help `overview.md` gains Exámenes, Tareas and Revisión sections.
- [ ] SDK methods per contract.
- [ ] Route tests (fake services): learner cannot reach `/lms/review` without `lms.grade`; `LmsError` codes map. Run `node --test apps/api/src/routes/lms/__tests__/`, registration test, `node --check`, `pnpm lint`.

## Workstream B — Desktop

### Task B1: Authoring
- [ ] `lmsLabels.js`: `KIND_LABELS` += `quiz: 'Examen'`, `assignment: 'Tarea'`; `QUESTION_KIND_LABELS` (Opción única / Opción múltiple / Verdadero o falso / Respuesta abierta); `SHOW_ANSWERS_LABELS`; tests.
- [ ] `LessonSheet.jsx`: kinds quiz/assignment; quiz settings fields (passing score, max attempts, time limit, draw count, shuffle toggles, show answers `SelectField`) and an "Editar preguntas" button (enabled after the lesson exists); assignment fields (instructions markdown in `body`, allow text/files, max files, días para entregar, calificación mínima opcional). If `LessonSheet.jsx` grows past ~350 lines, move the per-kind fields to `lesson-fields/QuizSettingsFields.jsx` and `lesson-fields/AssignmentSettingsFields.jsx`.
- [ ] `QuizQuestionsSheet.jsx` (wide Sheet, fixed header/footer): question list (prompt preview, kind, points, up/down reorder, delete with ConfirmDialog) + `QuestionForm.jsx` (kind `SelectField`, prompt `TextareaField`, options editor rows with `CheckboxField`/radio for correct, add/remove option, points, explanation; true_false shows Verdadero/Falso choice only).

### Task B2: Learner
- [ ] `QuizLesson.jsx` + `QuizAttempt.jsx` + `QuizResult.jsx`: start card; attempt view with questions (radio-like option rows for single/true_false, checkboxes for multiple, `TextareaField` for open), debounced autosave 800 ms, countdown in header when `deadlineAt` (auto-submit at 0), submit ConfirmDialog warning about unanswered questions; result card (score, Aprobado/No aprobado/En revisión, per-question reveal with explanation when present, "Intentar de nuevo" when allowed). Never render HTML from prompts unsanitized: use the same markdown renderer as text lessons.
- [ ] `AssignmentLesson.jsx`: instructions, due label (`dueLabel`), submission form (TextareaField + multi-file upload through `presignUpload` -> PUT -> `confirmUpload`, generalize `uploadLessonVideo.js` into `lib/directUpload.js` with a `presign`/`confirm` pair parameter and keep the video helper as a thin wrapper), history list with status badges (Enviada / Devuelta / Aprobada), grade, feedback, file links.
- [ ] `LessonContent.jsx` dispatches the two new kinds; `CourseOutline.jsx` icons for `pending_review` (Clock) and `failed` (XCircle); player refreshes the outline after quiz submit / assignment submit.

### Task B3: Grading
- [ ] `LmsReview.jsx` `/review`: `PageHeader` "Revisión", course filter `ComboboxField`, table (tipo, curso, lección, alumno, enviado, tarde) with `EmptyState`; rows open `GradeSubmissionSheet.jsx` (text, files, history, decision Aprobar/Devolver, grade input when `passingScore`, feedback) or `GradeAttemptSheet.jsx` (each question with learner answer; auto-scored read-only with correct/incorrect; open answers with points `TextField type=number` 0..points; feedback; "Guardar calificación").
- [ ] `EnrollmentsPanel.jsx`: learner row action "Otorgar intento extra" listing that learner's `failed` quiz lessons (data from the enrollment detail: add `failedLessons: [{ id, title }]` to the enrollments list serializer in Workstream A — coordinate: Workstream A adds it).
- [ ] Register `runly.lms:/review` in `ModuleOutlet.jsx` and the resolver.
- [ ] `node --test apps/desktop/src/modules/runly.lms/lib/`, `pnpm lint`, `pnpm build:web`.

## Task C: End-to-end and docs
- [ ] `.e2e/lms-eval-e2e.mjs` (temporary API on another port, test company): quiz lesson with 4 questions (single, multiple, true_false, open) + drawCount null, passingScore 70, maxAttempts 2; learner start -> no `correct` in payload; resume returns same attempt; wrong answers submit -> pending_review (open) -> grader gives 0 -> failed? (only if attempts left = 0, else in_progress); second attempt all correct + open full points -> completed; third attempt -> 409 NO_ATTEMPTS; extra attempt grant; time limit expiry via a 1-minute quiz with a forced expired `deadlineAt` (update through Prisma in the script is not allowed — instead assert `PUT answers` works before expiry and that the summary reports the deadline); assignment: empty submit 400, text submit -> pending_review, second submit 409 PENDING, return -> resubmit number 2 -> approve with grade below passingScore 400 -> approve with grade ok -> lesson completed; review queue lists then clears; learner upload presign >50 MB rejected. Archive the course at the end.
- [ ] `docs/TASKS.md` phase 2 entry with evidence; commit per verified block.
