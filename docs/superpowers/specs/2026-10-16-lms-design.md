# runly.lms — Learning management (design)

Date: 2026-10-16. Status: approved by the product owner (option C: internal and external learners; "take the best decisions"). This document covers the whole roadmap and details phase 1 only; later phases get their own spec section/plan when started.

## 1. Problem
Companies need to train their own staff (onboarding, mandatory courses) and, later, sell or share courses with external people through a `runly.website` site of type LMS. Content is videos, documents and text, with activities, assignments, ratings, discussion and certificates.

## 2. Roadmap
| Phase | Scope |
|---|---|
| 1. Core (this spec) | Courses, sections, lessons (video, text, file, embed), learners, enrollments (self and assigned with due date), lesson progress with video resume, sequential unlock, learner home + player inside `/app`, authoring screens |
| 2. Evaluation | Quizzes (single/multiple choice, true/false, open answer), question bank, attempts, passing score; assignments (file/text submission, deadline, grading and feedback) |
| 3. Social | Lesson discussion (comments and replies, reusing `EntityComment` where it fits), course ratings and reviews, course announcements + notifications |
| 4. Certificates | Templates, automatic issue on completion, PDF (pdfkit) with folio and QR, public verification at `/app/p/lms/cert/<token>` |
| 5. Reporting | Instructor reports (overdue, drop-off per lesson), learning paths, mandatory courses with expiry, assignment by HR department/position, MirAI read-only capability, MCP domain |
| 6. Website | Public course catalog block for `runly.website`, external learners (contact-backed, own login), preview lessons, later Stripe-paid courses |

## 3. Learner identity (decision C)
`LmsLearner` is the only subject the rest of the module references. It points to exactly one of `userProfileId` (internal user) or `contactId` (external person, phase 6). Phase 1 only creates profile-backed learners, lazily, the first time a user enrolls or is assigned. Enrollments, progress, submissions and certificates never reference `UserProfile` directly, so external learners need no schema change later. MirAI/bot profiles are never learners.

## 4. Phase 1 scope
In: course CRUD with draft/published/archived, cover image, category, level, estimated minutes, `sequential` and `selfEnroll` flags; sections and lessons with ordering; lesson kinds `video` (uploaded file), `embed` (YouTube/Vimeo/other https URL), `text` (markdown body), `file` (downloadable document); assignment of internal users with optional due date; self-enrollment on published self-enroll courses; progress and resume; learner home ("Mis cursos" + catalog); full-screen player.
Out: everything listed for phases 2-6, video transcoding/HLS (uploaded files are served by signed URL, browsers stream with range requests), DRM, offline playback.

## 5. Data model (Prisma, `lms_*`, no FK to company — same convention as attendance/canvas)
- `lms_course`: company_id, title, summary, description (markdown), cover_file_id, category, level (`basic|intermediate|advanced`), status (`draft|published|archived`), visibility (`internal|public`, phase 6 reads it), sequential bool, self_enroll bool, estimated_minutes, created_by_id, enabled, timestamps.
- `lms_section`: company_id, course_id (FK cascade), title, position.
- `lms_lesson`: company_id, course_id, section_id (FK cascade), title, kind, body, file_id, embed_url, duration_seconds, position, required bool (default true), preview bool (phase 6), enabled.
- `lms_learner`: company_id, user_profile_id?, contact_id?, display_name, email, enabled; CHECK exactly one subject; unique (company_id, user_profile_id), unique (company_id, contact_id).
- `lms_enrollment`: company_id, course_id, learner_id, status (`active|completed|dropped`), source (`self|assigned`), assigned_by_id, due_at, started_at, completed_at, progress_pct, last_lesson_id, timestamps; unique (course_id, learner_id).
- `lms_lesson_progress`: company_id, enrollment_id (FK cascade), lesson_id (FK cascade), status (`in_progress|completed`), position_seconds, max_position_seconds, completed_at, updated_at; unique (enrollment_id, lesson_id).

## 6. Rules (pure functions, unit tested)
- `progressPct` = completed required enabled lessons / required enabled lessons (0 lessons -> 0).
- Video/embed with known duration auto-completes when `max_position_seconds >= 90%` of duration; text/file/embed without duration complete by explicit "Marcar como completada".
- Sequential course: a lesson is locked until every required lesson before it (section order, then lesson order) is completed. Locked lessons cannot be opened or progressed (409).
- Course completes when progressPct reaches 100: enrollment `completed`, `completed_at` set once (phase 4 hooks certificate issue here). Adding lessons later does not reopen completed enrollments.
- Only `published` courses can be opened by learners; archiving keeps enrollments read-only. Dropped enrollments can be re-activated by re-assigning.
- An enrollment is `overdue` (derived, not stored) when active and `due_at < now`.

## 7. Permissions
`lms.access` (learner: catalog, my courses, player), `lms.course.manage` (author courses and content), `lms.enrollment.manage` (assign/drop learners, see everyone's progress). Admin bypass as everywhere.

## 8. API (`/lms/*`, router in `apps/api/src/routes/lms/`)
Learner (`lms.access`): `GET /lms/catalog`, `GET /lms/my/courses`, `POST /lms/courses/:id/enroll`, `GET /lms/learn/:courseId` (outline with lock/progress state), `GET /lms/learn/lessons/:lessonId` (content + signed media URL), `POST /lms/learn/lessons/:lessonId/progress` (`{ positionSeconds, completed }`).
Authoring (`lms.course.manage`): `GET|POST /lms/courses`, `GET|PATCH|DELETE /lms/courses/:id` (delete = archive), `POST /lms/courses/:id/sections`, `PATCH|DELETE /lms/sections/:id`, `POST /lms/sections/:id/lessons`, `PATCH|DELETE /lms/lessons/:id`, `POST /lms/courses/:id/reorder` (`{ sections: [{ id, lessonIds }] }`).
Enrollment admin (`lms.enrollment.manage`): `GET /lms/courses/:id/enrollments`, `POST /lms/courses/:id/enrollments` (`{ userProfileIds, dueAt }`), `PATCH /lms/enrollments/:id` (due date, drop/reactivate).
Media: covers and documents (<= 10 MB) use the existing `POST /files/upload` with `moduleKey: 'runly.lms'`. Videos exceed that limit, so `POST /lms/media/presign` (`{ fileName, mimeType, sizeBytes }`, `video/*` only, <= 50 MB — the self-hosted Storage global `FILE_SIZE_LIMIT`, same ceiling as chat) creates the `FileAsset` (bucket `runly-files`, `moduleKey: 'runly.lms'`, `entityType: 'LmsLesson'`, `metadata.pending: true`) and returns a signed upload URL; the browser PUTs the file directly to Storage and calls `POST /lms/media/:fileId/confirm`, which verifies the object can be signed and clears `pending`. Longer videos go as `embed` lessons (YouTube/Vimeo unlisted); the UI says so. Raising the Storage limit is an infra change outside this phase. The API signs lesson media with the shared file signer only for learners allowed to open the lesson (and for course managers).

## 9. UI (`apps/desktop/src/modules/runly.lms/`)
- `/` Mis cursos: assigned and in-progress courses with progress bar, due/overdue badge; completed; catalog of self-enroll courses.
- `/learn/:courseId` (full screen): outline sidebar (sections, lessons, lock and check states, % progress) + content pane (HTML5 video with resume and periodic progress report every 15 s and on pause/end, embed iframe, markdown text, file download) + previous/next.
- `/courses` Cursos (authors): `RunlyTable`-style list with status filter, create dialog.
- `/courses/:courseId` course editor, tabs: Contenido (sections/lessons, reorder, lesson sheet with kind-specific fields and `FileUploader`), Configuración (metadata, cover, flags, publish), Alumnos (assign users with due date, progress per learner, drop).
All `@runly/ui` components, Spanish UI text, `PageHeader` on every screen.

## 10. Verification
Unit tests for the rules (§6) and for route permission/validation behaviour with a fake service; scripted end-to-end run against the local API (`.e2e/lms-e2e.mjs`, git-ignored): create course, sections, lessons, publish, assign, outline locks, progress + auto-complete, course completion, drop/reactivate. Web build (`pnpm build:web`). Manual browser smoke listed as pending if not run.

## 11. Phase 2 — Evaluation (quizzes and assignments)

### 11.1 Decision
Quizzes and assignments are two more lesson kinds (`quiz`, `assignment`), not a parallel structure. They live in the curriculum, take part in sequential locking, and count toward `progressPct` like any required lesson. A course-wide question bank shared between quizzes is deferred; each quiz owns its questions and can draw a random subset per attempt, which covers the "bank" use case for a single quiz.

### 11.2 Lesson settings
`lms_lesson.settings JSONB NOT NULL DEFAULT '{}'`, normalized by kind:
- quiz: `passingScore` 0-100 (default 70), `maxAttempts` (null = unlimited), `timeLimitMinutes` (null = none), `drawCount` (null = all questions), `shuffleQuestions`, `shuffleOptions` (default true), `showAnswers` `never | after_submit | after_pass` (default `after_submit`).
- assignment: `allowText` (default true), `allowFiles` (default true), `maxFiles` 1-10 (default 5), `dueDaysAfterEnroll` (null = no deadline), `passingScore` (null = approve/return only, otherwise a 0-100 grade is required and approval needs grade >= passingScore).

### 11.3 Data model (forward migration)
- `lms_quiz_question`: company_id, lesson_id (FK cascade), kind `single | multiple | true_false | open`, prompt (markdown), options JSONB `[{ id, text, correct }]` (`id` is a short stable string generated server-side; true_false gets fixed ids `true`/`false`), explanation, points (int >= 1, default 1), position, enabled, timestamps.
- `lms_quiz_attempt`: company_id, enrollment_id (FK cascade), lesson_id (FK cascade), number, status `in_progress | submitted | graded`, question_ids UUID[] (the drawn questions in display order), option_order JSONB `{ questionId: [optionId] }`, answers JSONB `{ questionId: { optionIds?: [], text?: string } }`, started_at, deadline_at, submitted_at, auto_points, manual_points JSONB `{ questionId: points }`, score_points, max_points, score_pct, passed, graded_by_id, graded_at, feedback; unique (enrollment_id, lesson_id, number).
- `lms_submission`: company_id, enrollment_id (FK cascade), lesson_id (FK cascade), number, status `submitted | returned | approved`, text, file_ids UUID[], submitted_at, late bool, grade (0-100, null), feedback, graded_by_id, graded_at; unique (enrollment_id, lesson_id, number). The latest row is the current one; earlier rows are history.
- `lms_lesson_progress` gains `extra_attempts INT NOT NULL DEFAULT 0` and two new status values: `pending_review` and `failed`. Only `completed` unlocks later lessons.

### 11.4 Rules
- Learners never receive `correct` flags or explanations before submitting. After submitting they get them according to `showAnswers`.
- Scoring: `single` and `true_false` give full points when the one selected option is correct. `multiple` is all-or-nothing: full points only when the selected set equals the correct set. `open` is graded by hand from 0 to `points`.
- An attempt with open questions is `submitted` and the lesson goes to `pending_review` until a grader scores every open answer. Then it becomes `graded`. An attempt without open questions is graded on submit.
- `passed = score_pct >= passingScore`. A passed attempt completes the lesson, and a lesson that has been passed is never un-completed.
- Attempts: starting an attempt while one is `in_progress` returns that attempt. A new attempt is allowed while `count < maxAttempts + extra_attempts`. When attempts run out without a pass, the lesson is `failed`. A grader can grant extra attempts, which moves `failed` back to `in_progress`.
- Time limit: `deadline_at = started_at + timeLimitMinutes`. Answers are saved progressively. A save or submit after `deadline_at + 30 s` is rejected, and the attempt is auto-submitted with the answers saved so far. Any read of an expired `in_progress` attempt also auto-submits it.
- Assignment: a submission needs text or at least one file, as allowed by the settings. `late` is set when `dueDaysAfterEnroll` is configured and `now > enrollment.created_at + days`; late work is still accepted. Submitting puts the lesson in `pending_review`. `returned` lets the learner submit again as number + 1. `approved` completes the lesson; when `passingScore` is set, approval requires a grade >= passingScore. A new submission is rejected while the latest one is `submitted` or `approved`.
- Submission files are uploaded through `POST /lms/learn/uploads/presign` (learner, `lms.access`), because learners do not have `files.assets.create`. Allowed: PDF, images, office documents, zip, text, audio and video, up to 50 MB. The file is tagged `entityType: 'LmsSubmission'`, then confirmed as in phase 1. The API signs submission files only for the owning learner and for graders.

### 11.5 Permissions and notifications
New permission `lms.grade` ("Calificar actividades y tareas"). Notifications through `notificationService.publish` (in_app + web_push):
- `lms.submission.graded`: learner, when an assignment is approved or returned, or an attempt with open answers is graded.
- `lms.submission.received`: the course creator, when a submission or an attempt needing review arrives.
Both labels are registered in the delivery worker event map.

### 11.6 API additions
Authoring (`lms.course.manage`): `GET|POST /lms/lessons/:id/questions`, `PATCH|DELETE /lms/questions/:id`, `POST /lms/lessons/:id/questions/reorder`. Lesson `settings` travel in the existing lesson PATCH.
Learner (`lms.access`): `GET /lms/learn/lessons/:id/quiz` (summary: settings, attempts used and allowed, best score, current attempt id), `POST /lms/learn/lessons/:id/attempts` (start or resume; returns the questions without answers), `GET /lms/learn/attempts/:id`, `PUT /lms/learn/attempts/:id/answers` (`{ answers }` merge), `POST /lms/learn/attempts/:id/submit`, `GET /lms/learn/lessons/:id/submissions`, `POST /lms/learn/lessons/:id/submissions` (`{ text, fileIds }`), `POST /lms/learn/uploads/presign`, `POST /lms/learn/uploads/:fileId/confirm`.
Grading (`lms.grade`): `GET /lms/review` (queue: submissions in `submitted` plus attempts in `submitted`; filter by `courseId`), `GET /lms/review/attempts/:id` (attempt with answers, correct flags and open answers), `POST /lms/review/attempts/:id/grade` (`{ points: { questionId: n }, feedback }`), `GET /lms/review/submissions/:id`, `POST /lms/review/submissions/:id/grade` (`{ decision: 'approve' | 'return', grade?, feedback }`), `POST /lms/enrollments/:id/lessons/:lessonId/extra-attempt`.

### 11.7 UI
- Authoring: `LessonSheet` gains the kinds `Examen` and `Tarea`. The quiz settings live in the sheet. "Editar preguntas" opens `QuizQuestionsSheet` (wide sheet): a question list with reorder plus a question form per kind (option rows with a correct toggle, points, explanation).
- Learner: `QuizLesson` covers the start card (attempts, passing score, time limit, best score), the attempt view (all questions on one page, autosave debounced 800 ms, countdown, submit with ConfirmDialog) and the result (score, passed/failed, answers per `showAnswers`, retry while attempts remain). `AssignmentLesson` shows the instructions, the submission form (TextareaField plus file upload with progress) and the submission history with status, grade and feedback.
- Grading: new navigation item `Revisión` (`/review`, `lms.grade`) with a queue table filtered by course, `GradeSubmissionSheet` and `GradeAttemptSheet` (open answers with a points input, auto-scored answers shown read-only). The course editor's Alumnos tab gains "Otorgar intento extra" for `failed` quiz lessons.
- Outline icons for `pending_review` (clock) and `failed` (x).
