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
Media: lesson and cover files are uploaded through the existing files flow with `moduleKey: 'runly.lms'`; the API signs them with the shared file signer only for learners allowed to open the lesson.

## 9. UI (`apps/desktop/src/modules/runly.lms/`)
- `/` Mis cursos: assigned and in-progress courses with progress bar, due/overdue badge; completed; catalog of self-enroll courses.
- `/learn/:courseId` (full screen): outline sidebar (sections, lessons, lock and check states, % progress) + content pane (HTML5 video with resume and periodic progress report every 15 s and on pause/end, embed iframe, markdown text, file download) + previous/next.
- `/courses` Cursos (authors): `RunlyTable`-style list with status filter, create dialog.
- `/courses/:courseId` course editor, tabs: Contenido (sections/lessons, reorder, lesson sheet with kind-specific fields and `FileUploader`), Configuración (metadata, cover, flags, publish), Alumnos (assign users with due date, progress per learner, drop).
All `@runly/ui` components, Spanish UI text, `PageHeader` on every screen.

## 10. Verification
Unit tests for the rules (§6) and for route permission/validation behaviour with a fake service; scripted end-to-end run against the local API (`.e2e/lms-e2e.mjs`, git-ignored): create course, sections, lessons, publish, assign, outline locks, progress + auto-complete, course completion, drop/reactivate. Web build (`pnpm build:web`). Manual browser smoke listed as pending if not run.
