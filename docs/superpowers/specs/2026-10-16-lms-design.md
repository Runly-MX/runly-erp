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
- quiz: `passingScore` 0-100 (default 70), `maxAttempts` (null = unlimited), `timeLimitMinutes` (null = none), `drawCount` (null = all questions; a value above the question count uses every question), `shuffleQuestions`, `shuffleOptions` (default true), `showAnswers` `never | after_submit | after_pass` (default `after_submit`), `layout` `all | one` (default `all`: every question on one page; `one`: one question at a time with Anterior / Siguiente and a navigator).
- assignment: `allowText` (default true), `allowFiles` (default true), `maxFiles` 1-10 (default 5), `dueDaysAfterEnroll` (null = no deadline), `passingScore` (null = approve/return only, otherwise a 0-100 grade is required and approval needs grade >= passingScore).

### 11.3 Data model (forward migration)
- `lms_quiz_question`: company_id, lesson_id (FK cascade), kind `single | multiple | true_false | open | short | numeric | ordering | matching | fill_blank` (see §11.8), prompt (markdown), options JSONB `[{ id, text, correct }]` (`id` is a short stable string generated server-side; true_false gets fixed ids `true`/`false`) or `{ items, config }` when the kind needs settings, explanation, points (int >= 1, default 1), position, enabled, timestamps.
- `lms_quiz_attempt`: company_id, enrollment_id (FK cascade), lesson_id (FK cascade), number, status `in_progress | submitted | graded`, question_ids UUID[] (the drawn questions in display order), option_order JSONB `{ questionId: [optionId] }`, answers JSONB `{ questionId: { optionIds?: [], text?: string } }`, started_at, deadline_at, submitted_at, auto_points, manual_points JSONB `{ questionId: points }`, score_points, max_points, score_pct, passed, graded_by_id, graded_at, feedback; unique (enrollment_id, lesson_id, number).
- `lms_submission`: company_id, enrollment_id (FK cascade), lesson_id (FK cascade), number, status `submitted | returned | approved`, text, file_ids UUID[], submitted_at, late bool, grade (0-100, null), feedback, graded_by_id, graded_at; unique (enrollment_id, lesson_id, number). The latest row is the current one; earlier rows are history.
- `lms_lesson_progress` gains `extra_attempts INT NOT NULL DEFAULT 0` and two new status values: `pending_review` and `failed`. Only `completed` unlocks later lessons.

### 11.4 Rules
- Learners never receive `correct` flags or explanations before submitting. After submitting they get them according to `showAnswers`.
- Scoring: `single` and `true_false` give full points when the one selected option is correct. `multiple` is all-or-nothing by default: full points only when the selected set equals the correct set. `open` is graded by hand from 0 to `points`. The other kinds and the optional partial credit are in §11.8. Awarded points are rounded to 2 decimals; a question counts as `correct` only with full points.
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

### 11.8 Question kinds (product-owner review, 2026-10-17)
Feedback: the questions area needed a clearer presentation, more question types, drag-and-drop reordering, and a hint for "Preguntas por intento" that people understand.

Storage stays in `lms_quiz_question.options` (no schema change). Rows without settings keep the legacy array; kinds with settings store `{ items, config }`. The API reads both, and the authoring payload is always `{ kind, prompt, options: [...items], config: {...}, points, explanation }`.

| kind | items | config | answer JSON |
|---|---|---|---|
| `single`, `true_false` | `[{ id, text, correct }]` | — | `{ optionIds: [id] }` |
| `multiple` | `[{ id, text, correct }]` | `partialCredit` | `{ optionIds: [id] }` |
| `short` | accepted answers `[{ id, text }]` (1-20) | `exactMatch` | `{ text }` |
| `numeric` | — | `answer`, `tolerance` (>= 0) | `{ value }` (string as typed; `3,5` is read as 3.5) |
| `ordering` | `[{ id, text }]` in the correct order (2-20) | `partialCredit` | `{ order: [id] }` |
| `matching` | `[{ id, text, match, matchId }]` (2-20; `matchId` is a separate random id for the right column, right texts must differ) | `partialCredit` | `{ pairs: { leftId: matchId } }` |
| `fill_blank` | — (answers live in the prompt as `[[a|b]]`, max 30 blanks) | `allOrNothing`, `exactMatch` | `{ blanks: [text] }` |
| `open` | — | — | `{ text }` |

Scoring:
- Text matching (`short`, `fill_blank`) ignores case, accents, surrounding spaces and repeated inner spaces; `exactMatch` compares the trimmed text exactly.
- `numeric`: correct when `|value - answer| <= tolerance`.
- `multiple` with `partialCredit`: `points * (right - wrong) / correctCount`, floored at 0.
- `ordering` / `matching`: all-or-nothing by default; with `partialCredit`, `points * itemsInPlace / items`. An ordering question the learner never moved is scored in the order it was shown.
- `fill_blank`: proportional per blank by default; `allOrNothing` gives points only when every blank is right.

Attempt and serialization:
- `option_order` holds, per question, the ids shown: choice kinds as before; `ordering` is always shuffled and never shown solved; `matching` stores the left ids (shuffled with `shuffleOptions`) followed by the right ids (always shuffled).
- Learners never receive keys: `ordering` gets `options` in the shown order; `matching` gets `options` (left) and `choices` (right, ids unrelated to the left ids); `fill_blank` gets `prompt` with blanks as `____` plus `parts` (the text around the blanks); `short` and `numeric` get no accepted values. `partialCredit: true` is the only scoring hint sent.
- Revealed (per `showAnswers`, and always for graders): `accepted` (short), `answer` + `tolerance` (numeric), `correctOrder` (ordering), `correctPairs` (matching), `blankAnswers` and `exactMatch` (fill_blank), plus option `correct` flags, `explanation`, `awardedPoints` and `correct`.
- Saving answers loads the attempt's questions and cleans each answer by kind (unknown ids dropped, text limits).

UI:
- Builder: a list of cards (grip with `@dnd-kit` pointer and keyboard sorting, number, type icon and label, prompt preview, points, Duplicar and Eliminar with ConfirmDialog) next to a sticky panel that stacks on phones. "Nueva pregunta" opens a grid of type cards. Single choice marks the answer with a radio-style "Correcta"; multiple uses checkboxes; option rows reorder by drag and drop and Enter adds a row. "Vista del alumno" renders the learner component read-only.
- Settings copy: "Preguntas aleatorias por intento" with the plain-language hint and the current question count; a value above the count shows a warning (the server uses every question).
- Learner: progress bar, autosave and countdown in both layouts; in `one`, a navigator shows answered, unanswered and "Revisar después" (kept in the browser session). Ordering uses drag and drop plus up/down buttons; matching uses one select per row; fill_blank shows inputs inline.
- Result and grading show every kind with the learner's answer, a Correcta / Parcial / Incorrecta badge and, when revealed, the correct answer and explanation. Open answers keep manual points.

## 12. Phase 3 — Social (discussion, ratings, announcements)

### 12.1 Decision
The module does not reuse `EntityComment`. Its author is a mandatory `UserProfile` FK and it has no reply structure, so it cannot hold external (contact-backed) learners from phase 6. LMS comments get their own table instead. An author is either a learner or an instructor profile, which mirrors the learner abstraction in §3.

### 12.2 Data model (forward migration)
- `lms_comment`: company_id, course_id, lesson_id (FK cascade), parent_id (FK cascade, null = root question), author_learner_id?, author_profile_id? (CHECK exactly one), body (markdown, 1..5000), is_instructor bool (set by the server when the author has `lms.course.manage` or `lms.grade`), resolved bool (roots only), pinned bool (roots only), edited_at, deleted_at, created_at. Replies are one level deep: a reply to a reply is stored under the same root.
- `lms_review`: company_id, course_id, learner_id, rating 1..5, body (0..2000), hidden bool, reply_body, replied_by_id, replied_at, timestamps; unique (course_id, learner_id).
- `lms_course` gains `rating_avg NUMERIC(3,2)` and `rating_count INT DEFAULT 0`. Both are recomputed in the same transaction as any review write or visibility change, so the catalog and the future public site do not aggregate per request.
- `lms_announcement`: company_id, course_id, title, body (markdown), created_by_id, created_at, edited_at, deleted_at.

### 12.3 Rules
- Only learners with an active or completed enrollment, and managers/graders, can read or write lesson discussion. A learner who dropped keeps read-only access to their own comments.
- An author can edit their own comment. Deleting is soft: a deleted comment that has replies shows "Comentario eliminado" and keeps its replies, and one without replies disappears. Managers (`lms.course.manage`) can delete any comment, pin roots, and mark roots resolved. The root author can also mark their own question resolved.
- Reviews require an enrollment with `progressPct >= 30` or status completed, and there is one per learner per course (editable). Hidden reviews count for nothing and only managers see them. A manager can reply once (editable).
- Announcements are written by managers and listed newest first in the player and on the course card.

### 12.4 Notifications (in_app + web_push, never failing the request)
- `lms.comment.replied`: to the root author and earlier repliers (excluding the actor).
- `lms.comment.question`: to the course creator, on a new root question.
- `lms.announcement.published`: to every active learner of the course.
- `lms.review.replied`: to the review author.

### 12.5 API
Discussion (`lms.access` plus enrollment check, or manager): `GET /lms/lessons/:id/comments` (roots with replies, newest root first, pinned first), `POST /lms/lessons/:id/comments` (`{ body, parentId? }`), `PATCH /lms/comments/:id` (`{ body }` by the author; `{ pinned, resolved }` by a manager or, for `resolved`, the root author), `DELETE /lms/comments/:id`.
Reviews: `GET /lms/courses/:id/reviews` (`lms.access`; visible reviews plus the caller's own), `PUT /lms/courses/:id/reviews/mine` (`{ rating, body }`), `PATCH /lms/reviews/:id` (manager: `{ hidden, replyBody }`).
Announcements: `GET /lms/courses/:id/announcements` (enrolled or manager), `POST /lms/courses/:id/announcements`, `PATCH|DELETE /lms/announcements/:id` (manager).
The catalog and course serializers expose `ratingAvg` and `ratingCount`.

### 12.6 UI
- Player: a tabbed panel under the lesson content, with Contenido, Preguntas (count) and Anuncios (count). The Preguntas tab holds a composer, threads with replies, an instructor badge, pinned and resolved markers, edit and delete (ConfirmDialog), and "Marcar como resuelta".
- The course card and the course header show stars and the count. The player shows a "Califica este curso" prompt after 30% progress and on completion. A reviews dialog lists the reviews and shows the learner's own review form.
- Course editor: new tabs Anuncios (CRUD) and Reseñas (list with hide/show and reply).

## 13. Phase 4 — Certificates

### 13.1 Data model (forward migration)
- `lms_certificate_template`: company_id, name, title (default "Certificado de finalización"), body (text with placeholders `{{alumno}}`, `{{curso}}`, `{{fecha}}`, `{{horas}}`, `{{folio}}`, `{{empresa}}`), signer_name, signer_title, signature_file_id (PNG/JPEG), accent_color (hex, default company brand primary), show_logo bool, enabled, timestamps.
- `lms_course` gains `certificate_template_id` (null = the course issues no certificate).
- `lms_certificate`: company_id, enrollment_id, learner_id, course_id, template_id, folio (unique per company, `<YYYY>-<6-digit sequence>`), token (unique, 24 url-safe random chars), learner_name, course_title, hours (snapshots), issued_at, issued_by_id (null = automatic), revoked_at, revoke_reason. A partial unique index on (enrollment_id) WHERE revoked_at IS NULL allows one valid certificate per enrollment.

### 13.2 Rules
- Issue: when an enrollment becomes `completed` and the course has a template, a certificate is issued inside `setLessonOutcome`'s transaction, through `issueCertificate(tx, enrollment)`. It is idempotent by enrollment. Managers can issue by hand for completed enrollments that lack a valid certificate (for example, when a template was added later or after a revoke) and can revoke with a reason. A revoked certificate stays verifiable and shows as revoked. Re-issuing creates a new folio and token.
- Folio: inside the transaction, `SELECT pg_advisory_xact_lock(hashtext('lms_cert:' || company_id))`, then the max sequence for the year plus 1.
- Snapshots: learner name, course title and hours (`estimated_minutes / 60` rounded to 0.5, or the sum of lesson durations when estimated_minutes is null) are frozen at issue. Later edits never change an issued certificate.
- PDF is generated on request with pdfkit on letter landscape: logo when the company brand has a PNG/JPEG logo, title, body with placeholders replaced, signer block with the optional signature image, folio, and a QR (the `qrcode` package, already a dependency) pointing to `<appBaseUrl>/app/p/lms/cert/<token>`. Nothing is stored, and the PDF is deterministic for a given certificate.

### 13.3 API
- Manager (`lms.course.manage`): `GET|POST /lms/certificate-templates`, `PATCH|DELETE /lms/certificate-templates/:id` (delete = disable; 409 when a course still uses the template), `GET /lms/certificate-templates/:id/preview.pdf` (sample data).
- Enrollment admin (`lms.enrollment.manage`): `POST /lms/enrollments/:id/certificate` (manual issue), `POST /lms/certificates/:id/revoke` (`{ reason }`), `GET /lms/courses/:id/certificates`.
- Learner (`lms.access`): `GET /lms/my/certificates`, `GET /lms/my/certificates/:id/pdf`.
- Public (no auth, rate limited): `GET /public/lms/certificates/:token` (`{ folio, learnerName, courseTitle, hours, issuedAt, companyName, logoUrl, revoked, revokedAt }`), `GET /public/lms/certificates/:token/pdf`.

### 13.4 UI
- New navigation item `Certificados` (`/certificates`, `lms.course.manage`) with a template list and a template editor sheet that shows a live PDF preview in an iframe.
- Course settings gain a Certificado `SelectField` (Sin certificado / templates). The Alumnos tab shows a certificate column with folio, download, revoke (ConfirmDialog with reason) and "Emitir" when it is missing.
- "Mis cursos" gains a Certificados section with downloads (see §14 for the later authoring and video review). The player shows a "Descargar certificado" button on completion.
- Public page `/app/p/lms/cert/:token` (no login, no shell): company logo, a "Certificado válido" or "Certificado revocado" status, folio, name, course, date, hours, and a PDF download.

## 14. Authoring UX and large videos (product-owner review, 2026-10-17)

### 14.1 Feedback
1. Long-form text must use the authorized Markdown editor, `MarkdownField` from `@runly/ui` (MDXEditor), not plain textareas.
2. Videos over the 50 MB Storage limit must be uploadable, reusing the call-recording approach: HLS segments in Storage, played with hls.js.
3. Reordering must be drag and drop (`@dnd-kit`, already a dependency). Heavy editors must be pages or large surfaces, not small sheets.

### 14.2 Decisions
- **Markdown:** `MarkdownField` is used for course description, lesson text, lesson notes, assignment instructions, quiz instructions, question prompt and explanation, and announcements. It is the full width of the page in course settings and the lesson editor. Short inputs (summary, comments, grading feedback, revoke reason) stay as textareas. The certificate body keeps its textarea, because its placeholder chips insert at the cursor.
- **Lesson editor page:** `/courses/:courseId/lessons/:lessonId` (`new` for creation, with `?section=`). The left column holds the course curriculum (drag and drop, current lesson highlighted with a flat fill) and the right column the editor. There is a sticky header with back, title, status and Guardar. Quiz questions are edited inline on this page, as a list with drag and drop plus a question editor panel. `LessonSheet` and `QuizQuestionsSheet` are removed.
- **Curriculum drag and drop:** sections reorder; lessons reorder within a section and move between sections. Both persist through the existing `POST /lms/courses/:id/reorder`. Keyboard sorting comes from the dnd-kit sensors. The arrow buttons go away.
- **Large videos (HLS package):**
  - Files of 50 MB or less keep the direct upload. Larger files, up to 2 GB (the practical ffmpeg.wasm memory limit), are remuxed in the browser with ffmpeg.wasm: `-c copy -f hls -hls_time 6 -hls_playlist_type vod`. This is the same lossless container remux that `downloadHlsAsMp4` already does in reverse.
  - Segments and `index.m3u8` are uploaded with signed URLs, three in parallel, with overall progress shown.
  - One `FileAsset` represents the package: the manifest, `mimeType application/vnd.apple.mpegurl`, and `metadata.hls = { dir, segments, durationSeconds, sourceName, sourceBytes }`.
  - Opening the lesson returns `media: { kind: 'hls', manifest }`. Each segment line is rewritten to its own signed URL, the same technique as `signManifestSegments` in call recordings. The player plays it through the shared `useHlsPlayback`, which `@runly/ui` exports.
  - Remux needs H.264 or HEVC video. Other codecs get a clear Spanish error asking for an MP4 export.

## 15. Media, learner experience and certificate templates (product-owner review 2, 2026-10-17)

### 15.1 Feedback
1. A good video player everywhere, including in the builder: an uploaded video must be watchable there, not shown as a file badge.
2. Videos have thumbnails: an uploaded image, or a frame captured automatically from the video.
3. Adopt the racoon-lms structures and views (see `2026-10-17-lms-racoon-lms-review.md`).
4. Certificates work like inventory custody documents: upload your own Word file, recognize fields, fill it, and convert it to PDF.

### 15.2 Decisions
- **Shared `VideoPlayer` in `@runly/ui`**, adapted from racoon-lms `src/shared/ui/VideoPlayer.jsx`.
  - Sources: an MP4/WebM URL, an HLS URL, or HLS manifest text (through `useHlsPlayback`, with hls.js fatal-error recovery).
  - Controls: play/pause, ±10 s, a seek bar with a buffered range, time, speed 0.5-2x, a volume slider, theater toggle (optional, through a callback), fullscreen including iOS `webkitEnterFullscreen`, and controls that auto-hide after 3 s while playing.
  - Keyboard: space/k, arrow keys, f, m.
  - Props: `poster`, `startAt`, `onTimeUpdate`, `onPause`, `onEnded`.
  - Controls are `rounded-md`, with Spanish aria labels. LMS learner playback and the builder preview use it.
- **Thumbnails:** `lms_lesson.cover_file_id`.
  - On video upload, the browser captures a frame of the local file at min(10% of the duration, 5 s) with `@runly/ui` `captureVideoFrame(file, seconds)`, which returns a JPEG Blob. It uploads the frame through `/files/upload` (`moduleKey runly.lms`, `entityType LmsLesson`) and sets it as the cover unless the author already chose one.
  - The editor allows replacing the cover with an uploaded image, or "Usar este fotograma" from the current player position.
  - Serializers expose `coverUrl` (signed, card variant) on lessons in the authoring detail, the learner outline and the opened lesson (`poster`).
- **Lesson editor media panel**, as in the racoon-lms `LessonEditorModal`: the video and the cover side by side, 16:9 each. The states are empty dropzone, uploading with progress, and playable preview with Cambiar/Quitar actions.
- **Learner player layout** (racoon-lms `LearnPage`):
  - A content sidebar on the right (`lg:grid-cols-[1fr_360px]`) with 16:9 thumbnails, colored placeholders by kind when there is no cover, a lock overlay, a completed check, and duration.
  - Theater mode: full width, sidebar below; it is remembered per viewer in localStorage (in try/catch).
  - Tabs under the content: Descripción (lesson notes), Recursos, Preguntas, Anuncios.
- **Lesson resources:** `lms_lesson_resource` (lesson_id, file_id, title, position) for downloadable files on any lesson.
  - Managers add, remove and reorder them in the lesson editor.
  - Learners get them, signed, in the opened lesson.
- **Course page** `/course/:courseId` (racoon-lms `CourseDetailView`), opened from catalog and "Mis cursos" cards:
  - A blurred cover hero with title, summary, level, rating, lesson count, duration and enrolled count.
  - A sticky CTA card (Inscribirme / Continuar / Ver certificado) and a fixed CTA bar on mobile.
  - A Markdown description, an accordion curriculum with thumbnails and durations, and an instructor card (course creator).
- **Builder polish:** section cards get a number badge and lesson count, plus a dashed drop area when empty. Lesson rows show thumbnail, kind, duration and required.
- **Certificates from an uploaded .docx**, reusing `apps/api/src/services/document-templates/*`, the same engine as inventory custody:
  - `lms_certificate_template.source` is `design` (the current pdfkit layout) or `docx`.
  - Fields: `file_asset_id` (the uploaded file) and `placeholders` (the detected tags).
  - Tags: `{{alumno}} {{curso}} {{fecha}} {{horas}} {{folio}} {{empresa}} {{instructor}} {{calificacion}}`, plus images `{{%qr}} {{%firma}} {{%logo}}`.
  - Upload validates the file by compiling it and scanning its tags. "Sugerir etiquetas" detects bracketed or underscored placeholders and labels such as Nombre, Otorga a, Curso, Fecha, Folio, Horas and Instructor, and writes the tags into a copy to review.
  - "Descargar ejemplo" gives a ready sample .docx.
  - Rendering fills the .docx and converts it with `convertToPdf` (Collabora). If Office is not configured or conversion fails, the PDF uses the built-in design and the template list warns that Office is not available.
  - Issued certificates keep their snapshots; the QR still points to public verification.

## 16. PowerPoint and PDF certificate templates (2026-10-17)

- **Sources:** `lms_certificate_template.source` is `design | docx | pptx | pdf`. Uploads go through `POST /lms/certificate-templates/upload` (format from the extension; `/docx` stays for Word only). `PUT /:id/file` replaces a file with one of the same format. 10 MB max, private runly.lms FileAsset.
- **PowerPoint (.pptx):** same tags and data as Word, on docxtemplater's pptx mode (`services/document-templates/pptx-template.js`). `docxtemplater-image-module-free` supports pptx: an image tag replaces the **whole text box** that holds it with a picture at that box's position, fitted inside the box. So `{{%qr}}`, `{{%firma}}` and `{{%logo}}` must sit alone in their own text box; a missing image becomes a 1x1 transparent PNG. Rendering converts the filled .pptx with Collabora, with the same fallback to the built-in design. "Sugerir etiquetas" works on `a:t` runs: bracketed / guillemet placeholders, underscore blanks after a label, "Folio:" labels, sample words ("NOMBRE DEL ALUMNO", "Nombre del participante"), lines with a caption below, a new `{{%firma}}` box above a signature line, and a new `{{%qr}}` box in the bottom-right corner when no QR was found. `GET /sample.pptx` is a 16:9 slide with every tag.
- **PDF:** the first page is the background; `layout = { page, fields: [{ key, x, y, w, h, fontSize, color, align, bold, background }] }` in PDF points from the top-left corner (`background` paints a box under the text to cover sample text). Keys are the 11 tag keys. pdf-lib draws the fields (Helvetica / Helvetica-Bold, WinAnsi: Spanish accents work; other characters lose their accent or become "?"), shrinks text to the box width, embeds the QR (qrcode PNG), signature and logo (PNG/JPEG), and stamps revoked certificates with a diagonal "REVOCADO". No Office needed. `PUT /:id/layout` validates (known keys, no duplicates, inside the page, sizes, colors), `POST /:id/suggest-layout` proposes fields from pdfjs text positions (worker thread), `POST /:id/preview.pdf` renders an unsaved layout with sample data. Upload runs the detection once.
- **UI:** "Nueva plantilla" offers Diseño integrado / Subir Word / Subir PowerPoint / Subir PDF; one upload sheet handles the three formats; Word and PowerPoint share the settings sheet and the suggestion dialog; PDF templates get `PdfLayoutEditor` (react-pdf page, draggable/resizable boxes with pointer events, arrow-key nudging, side panel, Detectar campos, Vista previa, Guardar).

## 17. Free sections, course share links for guests and the promo video (2026-10-17)

Phase 6 (external learners), first slice. Schema (forward migrations, already applied): `lms_section.free`, `lms_course.share_enabled / share_token (unique) / share_settings (json) / promo_lesson_id`, `lms_learner.guest_token_hash (unique)`; the learner CHECK allows exactly one of `user_profile_id`, `contact_id` or `guest_token_hash` (§3 stays true: guests are one more kind of `LmsLearner`).

### 17.1 Free sections and preview lessons (internal users)
- A lesson is **open preview** when it is in a free section (`lms_section.free`) or has `lms_lesson.preview = true`, and it is not a quiz or an assignment (`isOpenPreview` in `lms-share-core.js`).
- Internal users with `lms.access` who are not enrolled get `access: 'free'` on a **published** course: the outline lists every lesson, open preview lessons are `available`, the rest `locked`; opening another lesson answers 403 `NOT_ENROLLED`. If the course has no open preview lesson the outline stays 403 `NOT_ENROLLED` as before. No progress is written (`saveProgress` is 403 without an enrollment), no resources are returned, and comments, reviews, announcements, quizzes, assignments and certificates still require an enrollment.
- API: section create/update accept `free` (update is partial: `title` and/or `free`); `lessonShape`, `serializeSections`, the outline and the course overview expose `free` / `preview`.
- UI: the builder's section header has "Marcar sección como gratis" (gift icon) and a "Gratis" badge; lesson rows that open without enrolling show "Gratis"; the lesson editor checkbox is "Vista previa gratis (sin inscripción)" (not for assignments). The course page shows "Gratis" on those lessons and opens them in the player's "vista previa gratuita" mode: no progress, only Descripción (no tabs), and an "Inscribirme" button when the course has free enrollment.

### 17.2 Share links for external guests
- Manager (`lms.course.manage`): `GET /lms/courses/:id/share` returns `{ enabled, url, path, published, hasCertificateTemplate, settings }`; `PUT` takes `{ enabled, scope, allowQuizzes, issueCertificates }` (missing keys keep their value; the 24-char url-safe token is created the first time the link is enabled); `POST /share/rotate` issues a new token. `share_settings = { scope: 'all' | 'preview', allowQuizzes, issueCertificates }`, normalized by `normalizeShareSettings`. Link: `/app/p/lms/curso/:token`.
- Shared lessons (`isSharedLesson`): quizzes only with `allowQuizzes`, assignments only with `allowAssignments` (§17.6); with scope `preview`, only preview lessons and lessons in free sections.
- Public API `/public/lms/share/:token` (no user auth, rate limited per IP: 300 tokens refilling 5/s for all guest calls, 20 refilling 0.2/s for `/join`; certificates keep their own 30 / 0.5/s bucket): `GET` (course summary, company name and logo, promo, outline of shared lessons without ids), `POST /join` (`{ name 2-80, email? }` returns `{ guestToken, guest, resumed }`), `GET /me`, `GET /lessons/:id`, `POST /lessons/:id/progress`, and when `allowQuizzes` `GET /lessons/:id/quiz`, `POST /lessons/:id/attempts`, `GET /attempts/:id`, `PUT /attempts/:id/answers`, `POST /attempts/:id/submit`.
- Security: guests send `Authorization: Guest <token>` (43 url-safe chars); only `sha256(token)` is stored. Every request re-resolves the link (enabled, current token, published course), so disabling or rotating it cuts access at once (404 `SHARE_NOT_FOUND`). A missing or unknown guest token is 401 `GUEST_REQUIRED`; a dropped enrollment is 403 `GUEST_REMOVED`. Lessons outside the shared set are 404; quiz calls with quizzes off are 404 `QUIZZES_DISABLED`; attempts are owned by enrollment id and must belong to a shared lesson. Responses carry lesson and attempt ids only (no course, learner, enrollment or file ids). Re-joining with a valid token returns the same guest. Guest learners are created in one place, `createGuestLearner({ course, name, email, profile, afterCreate })` (intake answers in `guest_profile`, see §17.4).
- Rules reused: sequential locks over the shared lessons only; progress through `applyProgress` / `setLessonOutcome`; guest `progressPct` counts only shared lessons (`enrollment.source = 'share'`). Open quiz answers go to Revisión with the guest name ("(invitado)"); notifications skip guests (no profile).
- Certificates: a share enrollment gets one only when the course has a template **and** `issueCertificates` is on (checked inside `issueCertificate`, so automatic, reactivation and manual issue agree); the name is the guest `displayName`. `GET /me` returns `certificate: { token, folio }` and the player links "Descargar certificado" to `/public/lms/certificates/:token/pdf`.
- Lesson resources are not shared with guests (internal material); to share a file, use a file lesson.
- Desktop: "Compartir" in the course editor header opens `ShareCourseDialog` (switch, scope radio, Permitir exámenes, Emitir certificado al completar, link with copy and open, Generar nuevo enlace with ConfirmDialog, what guests can and cannot do). `public/SharedCourseScreen.jsx` (no login, no shell): join screen with hero, shared outline and the name form, then a reduced player (outline sidebar, VideoLesson or embed stage, text and file, quizzes through `LmsQuizSourceContext`); the guest token lives in localStorage per share token, "No soy <nombre>" starts over. Alumnos shows guests with an "Invitado" badge (`learner.kind = 'guest'`).
- Known gap: the company-deletion public fence (`runly_lifecycle.blocked_capability`) does not list LMS share or certificate tokens yet; a follow-up migration should add them.

### 17.3 Course promo video
- `lms_course.promo_lesson_id`: course PATCH accepts `promoLessonId` (or null); it must be an enabled video or embed lesson of the same course that is open preview, otherwise 400.
- `GET /lms/courses/:id/overview` returns `promo: { lessonId, title, kind, media, mediaUrl, poster, embedUrl } | null`, media signed like an opened lesson (file or HLS). The share-link `GET` returns it when the lesson is inside the shared scope. Watching it records no progress.
- UI: "Video de presentación" select in Configuración (eligible lessons only, "Sin video"). `PromoHeroLayout` renders the hero: text on the left and a 16:9 player card on the right; the player's theater toggle spans the hero with the video centered, the text below and stats plus "Compartir" on the right. CSS transitions with `motion-reduce`, mode remembered in localStorage. Embeds use the same iframe card. Without a promo the cover hero stays.

### 17.4 Guest intake form and guest certificate tags (2026-10-17)
- Schema (forward migration, applied): `lms_learner.guest_profile` JSONB holds the answers. `share_settings.intakeFields = [{ key, label, type: 'text'|'email'|'phone'|'number', required, preset }]`, normalized by `readIntakeFields` / `normalizeIntakeFields` (`lms-intake-core.js`). The name is always asked (it is `learner.displayName`) and is not in the list. Presets (fixed key, label and type): `numero_empleado`, `empresa`, `puesto`, `correo` (email), `telefono` (phone). Up to 5 custom fields; their key is a slug of the label fixed at creation (`[a-z][a-z0-9_]{0,23}`, presets and `nombre` reserved). A course without the key keeps the old form (optional `correo`); an explicit `[]` asks only the name.
- `PUT /lms/courses/:id/share` accepts `intakeFields` and `accessMode` (missing keys keep their value). `GET /public/lms/share/:token` returns them in `settings`, so the join screen renders the configured fields.
- `POST /join` takes `{ name, answers: { key: value } }` (a legacy top-level `email` still fills `correo`). The server validates required fields, email format, phone (7-25 chars, 7+ digits), numbers and lengths (values 120, email 200) and ignores unknown keys; answers go to `guest_profile`, `correo` also to `learner.email`.
- Alumnos: enrollment rows carry `learner.guestProfile` for guests. A guest row shows a "Ver datos del invitado" button (`GuestDetailsDialog`: answers with the course labels, answers to removed fields under their key, progress, dates and certificate folio). "Exportar invitados" downloads a UTF-8 CSV (BOM) of guests with every answer column, progress, status, dates and certificate folio; cells starting with `= + - @` get a leading `'` (formula injection guard).
- Certificates: Word/PowerPoint tags `{{empresa_alumno}}`, `{{numero_empleado}}`, `{{puesto}}` and `{{campo_<key>}}` for custom fields (`isGuestCertTag`; not reported as unknown). The same keys are PDF layout field keys (`isCertFieldKey`; up to 5 extra `campo_*` fields), and the built-in design body accepts them too. They print an empty string for non-guests. **No snapshot:** `lms_certificate` has no JSON column, so the values are read from the learner's `guest_profile` at render time (`guestVarsFor` in `lms-cert-service.js`); name, course and hours stay frozen at issue as before. Previews use sample values. The UI tag reference (`CERT_DOCX_REFERENCE`) and the PDF field panel ("Campo del formulario de invitados") list them.

### 17.5 Invite-only share links (2026-10-17)
- `share_settings.accessMode = 'open' | 'invite'` (default `open`). `open` is §17.2. With `invite`, `POST /join` answers 403 `INVITE_ONLY`; people enter only through an invitation.
- Schema (forward migration, applied): `lms_guest_invite (id, company_id, course_id, email, name, code_hash, link_token unique, learner_id, invited_by_id, sent_at, last_used_at, revoked_at, created_at)`, unique `(course_id, email)`.
- Manager (`lms.course.manage`): `GET /lms/courses/:id/share/invites` returns `{ invites: [{ id, email, name, learnerName, status: pending|active|revoked, sentAt, lastUsedAt, revokedAt, createdAt }], mailConfigured }`; `POST .../share/invites` with `{ invites: [{ email, name? }] }` (max 200, deduplicated; an email with a live invite is skipped, a revoked one is invited again with a new link and code and keeps its learner) returns `{ created: [{ invite, link, code, sent, mailError }], skipped, mailConfigured }`; `POST .../invites/:inviteId/resend` issues a new code (same personal link); `POST .../invites/:inviteId/revoke`. Inviting needs a share token (409 `SHARE_DISABLED` otherwise).
- Access code: 8 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (`crypto.randomInt`), shown as `ABCD-EFGH`; only `sha256('lms-invite:' + link_token + ':' + code)` is stored, so the plain code exists only in the email and in the create/resend response. Personal link: `<appBaseUrl>/app/p/lms/curso/<shareToken>?i=<linkToken>` (32 url-safe chars).
- Email: `buildLmsCourseInviteEmail` in `email-templates.js` (Spanish, company branding through `companyBrandService.getBrandForCompany`, link and code), sent with the instance SMTP like the attendance invite. `sendMail` / `buildMail` / `getBrand` / `appBaseUrl` are passed into `createLmsRouter` from `index.js`. Without SMTP, without an app URL or when the send fails, the invite is still created, `sent_at` stays empty and the dialog shows the link and code to copy (`InviteCodesDialog`).
- Public `POST /public/lms/share/:token/access` with `{ i, code }` or `{ email, code }`: unknown email, wrong link and wrong code all answer 401 `INVALID_CODE` (a dummy hash is computed for unknown emails); the code is compared with `crypto.timingSafeEqual`. A revoked invite answers 403 `GUEST_REMOVED`, but only after a correct code. On the first entry the answer is `{ needsProfile: true, guest: { name, email } }` until the same call comes with `{ name, answers }`; the invited email is fixed (`correo` cannot be changed). The guest learner is created and linked to the invite (`learner_id`, guarded by an `updateMany` on the expected `learner_id`) in one transaction. Later entries return a fresh guest token for the same learner.
- Sessions, decided for v1: one guest token per learner. Each code entry **rotates** `guest_token_hash`, so entering on another device signs out the previous one (the UI says "Al entrar en otro dispositivo se cierra la sesión anterior"). No session table and no extra migration.
- Rate limits: `/access` has its own per-IP bucket (10, refilling one every 30 s) on top of the shared guest bucket. Failed codes are counted per invite in memory (`createAttemptGuard`, per API process, reset on restart): 5 failures within 15 min lock the invite for 15 min (429 `INVITE_LOCKED`) even with the right code; a success clears the counter.
- Revoke is immediate: the learner's token hash is replaced with a random one nobody holds and, on invite-only links, every guest request also checks that the learner still has a non-revoked invite (`findGuest`), touching `last_used_at` at most every 10 minutes. Guests who joined while the link was open have no invite and must be invited after switching to `invite`. Rotating the share token breaks the personal links; resending rebuilds them with the new token, and email + code works on the new page.
- Desktop: `ShareCourseDialog` has tabs Enlace (switch, "Quién puede entrar" radio, scope, quizzes, certificates, link), Formulario (`IntakeFieldsEditor`: presets with Obligatorio, custom fields, the certificate tag of each field, "Guardar formulario") and, in invite mode, Invitaciones (`GuestInvitesPanel`: textarea with one person per line, "Nombre <correo>" or "correo, Nombre"; list with status badge, last access, Reenviar and Revocar with ConfirmDialog). The public page reads `?i=`; `SharedCourseInviteForm` asks for the code (plus the email without `?i=`), then the intake form the first time.
- SDK: `lms.listShareInvites`, `createShareInvites`, `resendShareInvite`, `revokeShareInvite`, `lms.guest.access`.

### 17.6 Guest assignments and invite-mode defaults (2026-10-17)
- `share_settings.allowAssignments` joins `allowQuizzes`. Defaults (`normalizeShareSettings`): when the key is absent, both are **true** with `accessMode = 'invite'` (formally invited guests see the whole course) and false with `open`; a stored boolean always wins. `normalizeShareInput` stores a switch only once it is set explicitly (body or already stored), so an unset one keeps following the mode default when the mode changes. Rows saved before this change carry an explicit `allowQuizzes` (the old input always wrote it), so their quizzes keep the stored value; `allowAssignments` is absent on them and follows the mode.
- Public guest API (Guest token, same link checks; 404 `ASSIGNMENTS_DISABLED` when the link does not share assignments): `GET /public/lms/share/:token/lessons/:id/submissions`, `POST .../lessons/:id/submissions` (`{ text, fileIds }`, 201), `POST .../uploads/presign` (same limits and mime list as learner uploads, `SUBMISSION_UPLOAD`; returns `{ fileId, uploadUrl }`), `POST .../uploads/:fileId/confirm`.
- Reuse: the guest service builds `createLmsAssignmentService` with the guest lesson context and `owner: GUEST_OWNER`, so due date, late flag, pending/approved rules and `setLessonOutcome` are identical to internal learners. A guest has no profile: uploads are `FileAsset` rows with `uploadedById = null` and `metadata.guestLearnerId`; confirm and submit check that id against the guest learner. The "received" notification goes to the course creator with no actor.
- Review: guest submissions and attempts already show in Revisión as "<nombre> (invitado)"; grading is unchanged. In-app notifications skip guests. `createLmsGuestGradeMailer` (`lms-guest-mail.js`) sends "Tu tarea fue calificada" / "Tu examen fue calificado" (`buildLmsGradedEmail` in `email-templates.js`) with the course link when the guest has a non-revoked invite, the link is enabled, an app URL is known and the company mailer (`createCompanyMailer`) is configured. It runs in the background from the review service and can never fail a grade.
- Desktop: `LmsAssignmentSourceContext` (`useLmsEval.js`) gives the assignment components a guest transport (`useGuestAssignmentSource`), like `LmsQuizSourceContext`; uploads go through the guest presign/confirm pair. `ShareLinkTab` has "Permitir tareas" next to "Permitir exámenes", the hint "En cursos por invitación, los invitados ven el curso completo." in invite mode, and the can/cannot lists built by `guestCapabilities` (`lib/lmsShare.js`).
- SDK: `lms.guest.listSubmissions`, `submitAssignment`, `presignUpload`, `confirmUpload`.
