# runly.lms authoring UX + large video (HLS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Markdown editor everywhere long text is authored, a lesson editor page with drag-and-drop curriculum and inline quiz questions, and uploads of videos up to 2 GB as HLS packages.

**Architecture:** Spec `docs/superpowers/specs/2026-10-16-lms-design.md` §14. Two workstreams with one shared contract: `components/video/VideoUploadField.jsx` (already extracted). Props: `value`, `onChange({ fileId, fileName, durationSeconds } | null)`, `error`, `disabled`, `onBusyChange(bool)`. Workstream B renders it and never edits it; Workstream A owns it.

## Workstream A — HLS video package (API + upload + player)
- [ ] API in `apps/api/src/routes/lms/lms-media.js` plus routes:
  - `POST /lms/media/hls/presign` (`lms.course.manage`), body `{ fileName, sourceBytes, durationSeconds, segments: [{ name, sizeBytes }], manifestBytes }`. Validates: names `^seg_\d{5}\.ts$`, each segment <= 50 MB, total <= 2 GB, at most 2000 segments. Creates a pending FileAsset for `index.m3u8` under `modules/runly-lms/lmslesson/<companyId>/<packageId>/`. Returns `{ fileId, manifestUploadUrl, segmentUploadUrls: [{ name, uploadUrl }] }`.
  - `POST /lms/media/:fileId/confirm` also handles packages: the manifest must exist and every segment it lists must be one of the presigned names.
- [ ] `lms-hls.js`: `signHlsManifest({ supabaseAdmin, bucket, dir, manifestText })` rewrites each segment line to its own signed URL (TTL 3 h). Copy the approach of `call-recording-service.js` `signManifestSegments`, with a comment pointing to it; do not modify the calls code. The open-lesson payload gains `media: { kind: 'file', url } | { kind: 'hls', manifest }`, and the existing `mediaUrl` stays for compatibility. Unit tests: manifest rewriting, presign validation.
- [ ] `packages/ui`: export `useHlsPlayback` from `src/index.js` and document it in `docs/ai-context/rme3-runtime-capabilities.md`.
- [ ] Desktop `lib/hlsPackage.js`: `packageVideoAsHls(file, { onProgress })` uses ffmpeg.wasm, loaded the same way as `packages/ui/src/lib/downloadHlsAsMp4.js` (core from `/ffmpeg/`). It probes codecs from the ffmpeg log and rejects anything that isn't H.264 or HEVC with "Este video usa un formato que no se puede preparar en el navegador. Expórtalo como MP4 (H.264) e inténtalo de nuevo." It remuxes (`-c copy -f hls -hls_time 6 -hls_playlist_type vod -hls_segment_filename seg_%05d.ts index.m3u8`) and returns `{ manifestText, segments: [{ name, blob }], durationSeconds }`. `uploadHlsPackage(...)` presigns, PUTs the segments 3 in parallel, PUTs the manifest, then confirms, and reports overall progress as 0..1.
- [ ] `VideoUploadField.jsx`: files up to 50 MB use the direct path; files over 50 MB and up to 2 GB use the package path. Stages, each with a progress bar: Preparando video (remux) / Subiendo n % / Verificando. Copy is "MP4 o WebM. Hasta 2 GB; los videos de más de 50 MB se preparan en tu navegador antes de subirse." Cancelling while busy is allowed.
- [ ] `VideoLesson.jsx`: play `media.kind === 'hls'` through `useHlsPlayback`, using a blob URL of the manifest text, revoked on unmount. Resume, progress reports and auto-complete behave the same as for files.
- [ ] SDK: `presignVideoPackage(data, token)`.
- [ ] Verification: lms API tests (glob), desktop lib tests, `pnpm lint`, `pnpm --filter ./apps/desktop build:web`.

## Workstream B — Authoring UX
- [ ] `MarkdownField` replaces `TextareaField` for the fields listed in spec §14.2 (CourseSettingsForm description is full width with a large min height; announcements dialog becomes size `lg`). Use `MarkdownViewer` to render the same fields to learners, which is already in place.
- [ ] `screens/LmsLessonEditor.jsx`, route `runly.lms:/courses/:courseId/lessons/:lessonId`; it must be in `fullscreenPaths` or covered by the resolver. Layout: a sticky header, `CourseCurriculumNav` on the left (drag and drop, click to switch lesson, unsaved-changes guard with ConfirmDialog), and the editor on the right. The editor shows title, kind, kind fields (`VideoUploadField`, document uploader, embed URL, MarkdownField body), quiz settings plus the inline `QuizQuestionsEditor` (drag-and-drop list and question panel reusing `QuestionForm` logic), assignment settings, duration and Obligatoria.
- [ ] `CurriculumEditor.jsx` becomes drag and drop with `@dnd-kit/core` + `@dnd-kit/sortable`: sortable sections, sortable lessons with cross-section moves through `DragOverlay`, and persistence through `useReorder` (optimistic, rolls back on error). "Agregar lección" and lesson clicks navigate to the editor page; sections keep their small rename/create dialog.
- [ ] Remove `LessonSheet.jsx`, `QuizQuestionsSheet.jsx` and their imports.
- [ ] Manifest: add `/courses/:courseId/lessons/:lessonId` to `fullscreenPaths` in `apps/api/src/manifests/official/feature-modules.js`. This is the only API file Workstream B touches.
- [ ] Verification: desktop lib tests, `pnpm lint`, `pnpm --filter ./apps/desktop build:web`.

## Task C — Verification (main session)
- [ ] Playwright:
  - drag a lesson to another section and reload to confirm the order persisted;
  - edit a text lesson with MarkdownField and confirm the learner sees the rendered Markdown;
  - create a quiz with two questions inline;
  - upload a video over 50 MB (generated in Chromium) and play it in the player (HLS), with resume.
- [ ] Regression: phase 1-4 API E2E.
