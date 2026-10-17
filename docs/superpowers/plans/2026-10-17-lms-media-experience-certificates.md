# runly.lms media, learner experience and certificate templates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** spec `docs/superpowers/specs/2026-10-16-lms-design.md` §15: shared video player, thumbnails, racoon-lms-style player/course page/builder, lesson resources, and certificates from uploaded .docx files.

**Already done (main session):** Prisma models and migration `20261104000000_lms_media_resources_cert_docx` (`lms_lesson.cover_file_id`, `lms_lesson_resource`, and `lms_certificate_template.source/file_asset_id/placeholders`), with `prisma generate` run. Not applied to the dev DB yet, because the DB server is unreachable. No workstream edits `schema.prisma` or migrations.

## File ownership (three parallel workstreams)
- **P (player + thumbnails):**
  - `packages/ui/src/components/VideoPlayer.jsx` and `packages/ui/src/lib/captureVideoFrame.js` (export and document both)
  - LMS `components/VideoLesson.jsx` and `components/video/*`
  - `components/lesson-editor/LessonEditorForm.jsx` (video and cover area only)
  - API: lesson `coverFileId` in `lms-core` normalizeLessonInput, `lms-service` and the `lms-serialize` lesson serializer; `openLesson` adds `lesson.poster`
  - SDK: none needed (the lesson PATCH already exists)
- **L (learner experience + resources):**
  - `screens/LmsPlayer.jsx`, `components/CourseOutline.jsx` (it becomes the content sidebar), `components/LessonContent.jsx`, `components/social/LessonTabs.jsx`
  - New `screens/LmsCoursePage.jsx` (route `/course/:courseId`), `components/CourseCard.jsx`, `components/CurriculumEditor.jsx` and `components/curriculum/*` (visual polish only, keep the DnD logic)
  - New `components/lesson-editor/LessonResourcesEditor.jsx`, rendered from `screens/LmsLessonEditor.jsx`
  - API: new `lms-resources-service.js` and its routes; the outline adds `coverUrl` per lesson; `openLesson` adds `resources`; a course-page endpoint
  - SDK resource and course-page methods; registration in `ModuleOutlet.jsx` and `module-screen-resolver.js`
- **C (certificate templates from .docx):**
  - API: `lms-cert-*`, new `lms-cert-docx.js`; reuse `services/document-templates/*`, generalizing `docx-autotag.js` only through a new exported function that takes a label map, with the custody behaviour and tests unchanged
  - SDK: certificate template upload, replace, suggest and sample methods
  - UI: `screens/LmsCertificates.jsx`, `components/certificates/*`

## Contracts between workstreams
- `VideoLesson` (P) props: `lesson` (with `media`, `poster`, `durationSeconds`), `progress`, `preview`, `onProgress`, `onEnded`, `theater` (bool), `onTheaterChange(bool)`. L renders it and passes theater.
- `@runly/ui` `VideoPlayer` props: `src`, `hlsManifest`, `poster`, `startAt`, `onTimeUpdate(currentTime, duration)`, `onPause`, `onEnded`, `theater`, `onTheaterChange`, `className`.
- Lesson objects in the outline and authoring detail carry `coverUrl` (string or null). P adds it to authoring and the opened lesson (`poster`); L adds it to the outline.
- `openLesson` response: P adds `lesson.poster`; L adds `lesson.resources: [{ id, title, fileName, url, sizeBytes, mimeType }]`. Both edit `lms-learn-service.js` openLesson with small, separate edits; re-read before editing.

## Verification (each workstream)
LMS API tests (glob), desktop lib tests, `pnpm lint`, `pnpm --filter ./apps/desktop build:web`. Browser and E2E checks run in the main session once the dev DB is reachable.
