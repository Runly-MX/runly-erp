# runly.lms Phase 3 (social) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lesson discussion (questions, replies, instructor answers, pin/resolve), course ratings and reviews with cached aggregates, course announcements, and their notifications.

**Architecture:** Forward migration with `lms_comment`, `lms_review`, `lms_announcement` and the rating columns on `lms_course`; pure rules in `lms-social-core.js`; `lms-social-service.js` + `lms-social-routes.js` registered from `createLmsRouter` via `registerLmsSocialRoutes(app, deps)`; desktop components in the player and course editor. Spec: `docs/superpowers/specs/2026-10-16-lms-design.md` §12.

**Tech Stack:** Prisma 7, Hono, Node test runner, React + TanStack Query + `@runly/ui`.

**Precondition:** phases 1 and 2 committed. Reuse the phase 1/2 helpers (learner resolution, enrollment lookup, permission helpers, notification wrapper from phase 2) and names; read them first.

---

## API contract

Comment: `{ id, lessonId, parentId, author: { kind: 'learner'|'staff', id, displayName, avatarUrl }, isInstructor, body, resolved, pinned, editedAt, deleted, createdAt, canEdit, canDelete, replies: Comment[] }` (replies only on roots; deleted bodies are `null`).
Review: `{ id, rating, body, hidden, learner: { id, displayName }, replyBody, repliedAt, createdAt, updatedAt, mine }`.
Announcement: `{ id, courseId, title, body, author: { displayName }, createdAt, editedAt }`.

| Method | Path | Permission | Body | Returns |
|---|---|---|---|---|
| GET | `/lms/lessons/:id/comments` | lms.access (+ enrollment or staff) | — | Comment[] roots (pinned first, then newest) |
| POST | `/lms/lessons/:id/comments` | same | `{ body, parentId? }` | Comment (201) |
| PATCH | `/lms/comments/:id` | author / staff | `{ body? , pinned?, resolved? }` | Comment |
| DELETE | `/lms/comments/:id` | author / lms.course.manage | — | `{ id, deleted: true }` |
| GET | `/lms/courses/:id/reviews` | lms.access | — | `{ ratingAvg, ratingCount, distribution: {1..5}, mine: Review|null, canReview, reviews: Review[] }` |
| PUT | `/lms/courses/:id/reviews/mine` | lms.access | `{ rating, body }` | Review; 409 `NOT_ELIGIBLE` |
| PATCH | `/lms/reviews/:id` | lms.course.manage | `{ hidden?, replyBody? }` | Review |
| GET | `/lms/courses/:id/announcements` | enrolled or lms.course.manage | — | Announcement[] |
| POST | `/lms/courses/:id/announcements` | lms.course.manage | `{ title, body }` | Announcement (201) |
| PATCH / DELETE | `/lms/announcements/:id` | lms.course.manage | `{ title?, body? }` | Announcement / `{ id }` |

Staff = `lms.course.manage` or `lms.grade` (or admin). Catalog/course/my-courses serializers add `ratingAvg`, `ratingCount`; outline adds `announcementCount`.

SDK (token last): `listComments(lessonId)`, `createComment(lessonId, data)`, `updateComment(id, data)`, `deleteComment(id)`, `getReviews(courseId)`, `saveMyReview(courseId, data)`, `moderateReview(id, data)`, `listAnnouncements(courseId)`, `createAnnouncement(courseId, data)`, `updateAnnouncement(id, data)`, `deleteAnnouncement(id)`.

## Workstream A — Backend
- [ ] Migration (timestamp after the latest folder): tables per spec §12.2 with CHECK author exactly-one, CHECK rating 1..5, partial index `(lesson_id, created_at) WHERE parent_id IS NULL`, unique `(course_id, learner_id)` on reviews; `ALTER TABLE lms_course ADD rating_avg NUMERIC(3,2), ADD rating_count INT NOT NULL DEFAULT 0`. Prisma models + `migrate diff` empty + `pnpm db:migrate`.
- [ ] `lms-social-core.js` (TDD, `__tests__/lms-social-core.test.js`): `normalizeCommentBody` (trim, 1..5000), `rootIdFor(parent)` (reply-to-reply collapses to root), `buildThreads(rows, viewer)` (roots pinned first then newest, replies oldest first, deleted roots without visible replies dropped, deleted bodies nulled, `canEdit`/`canDelete` flags), `canReview(enrollment)` (completed or progressPct >= 30), `ratingAggregate(rows)` (avg of non-hidden rounded to 2, count, distribution), `replyRecipients({ root, replies, actor })` (root author + earlier repliers, deduped, actor excluded, learner authors mapped to their profile id, contact learners skipped).
- [ ] `lms-social-service.js`: access check (`assertDiscussionAccess(companyId, profileId, lesson)`: active/completed enrollment or staff; dropped learners get read-only), comment CRUD with soft delete, staff detection sets `isInstructor`, pin/resolve rules, review upsert + moderation recomputing `rating_avg/rating_count` in the same `$transaction`, announcements CRUD; notifications per spec §12.4 via the phase 2 notify helper with labels added to `notification-delivery-worker.js`: `"lms.comment.replied": "Respuesta en una pregunta"`, `"lms.comment.question": "Nueva pregunta en un curso"`, `"lms.announcement.published": "Nuevo anuncio del curso"`, `"lms.review.replied": "Respuesta a tu reseña"`. Links: `/app/m/runly.lms/learn/<courseId>?lesson=<lessonId>&tab=preguntas` for comments, `/app/m/runly.lms/learn/<courseId>?tab=anuncios` for announcements.
- [ ] `lms-social-routes.js` + registration; serializers add `ratingAvg`, `ratingCount`, `announcementCount`; SDK methods; help `overview.md` gains Preguntas, Reseñas y Anuncios.
- [ ] Route tests with fake service (403 paths, 409 NOT_ELIGIBLE mapping). Run `node --test apps/api/src/routes/lms/__tests__/`, `node --check`, `pnpm lint`.

## Workstream B — Desktop
- [ ] `lmsLabels.js` + tests: `formatRating(avg)` ("4.5"), `relativeTime(date, now)` ("hace 5 min", "ayer", "12 oct").
- [ ] `StarRating.jsx` (display + input, keyboard accessible, `aria-label` in Spanish) — check `@runly/ui` first; if a rating component exists use it, otherwise add `StarRating` to `packages/ui/src/components/`, export it and document it in `docs/ai-context/rme3-runtime-capabilities.md`.
- [ ] Player: `LessonTabs.jsx` under `LessonContent` (Contenido / Preguntas (n) / Anuncios (n)); `DiscussionPanel.jsx` (composer `TextareaField`, threads, `CommentItem.jsx` with instructor badge, pinned/resolved markers, reply box, edit inline, delete ConfirmDialog, staff actions in `DropdownMenu`); `AnnouncementsList.jsx`; read `?lesson=` and `?tab=` from the URL so notification links land on the right place.
- [ ] Reviews: `ReviewsDialog.jsx` (summary with distribution bars, my review form with `StarRating` + `TextareaField`, list); `RateCoursePrompt.jsx` shown in the player when `canReview` and no review yet (dismissible per course via localStorage wrapped in try/catch); stars + count on `CourseCard.jsx` and the player header.
- [ ] Course editor tabs `AnnouncementsTab.jsx` (list + create/edit Dialog + delete ConfirmDialog) and `ReviewsTab.jsx` (table with rating, body, hide/show toggle, reply Dialog).
- [ ] `node --test apps/desktop/src/modules/runly.lms/lib/`, `pnpm lint`, `pnpm build:web`.

## Task C: End-to-end
- [ ] `.e2e/lms-social-e2e.mjs` (temporary API on another port, test company): course with one text lesson; non-enrolled learner (use a second profile only if available, else assert staff path) — enrolled learner posts question; staff reply marked `isInstructor`; reply-to-reply stored under root; edit own; resolve; pin; delete root with replies keeps thread with null body; review before 30% -> 409 NOT_ELIGIBLE; after completing -> saved, aggregates 5.0/1; hide -> 0 count; reply; announcement create -> listed; cleanup archive.
- [ ] `docs/TASKS.md` entry with evidence; commit per verified block.
