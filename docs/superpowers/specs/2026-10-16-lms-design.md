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
