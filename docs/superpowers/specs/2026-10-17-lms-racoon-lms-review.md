# racoon-lms review — what runly.lms should take (2026-10-17)

The source is the earlier standalone project `racoon-lms` (React 19 + Vite + Appwrite + Firebase push + a `video-api` with MinIO and ffmpeg). This is a read-only review and nothing was copied. Local `.env` files with credentials exist in that project; their values were not read into this document.

## 1. Verdict
racoon-lms is ahead in **presentation and UX**. runly.lms is ahead in **functional depth**:
- **Resume and progress:** we save the resume position, progress and sequential locks; there, completion is never loaded back.
- **Quiz security:** we grade quizzes on the server with no answer keys sent to the client; there, multiple and short answers are never graded.
- **Features they only have as placeholders:** we have working certificates, a reviews list, manual grading of open answers, due dates and announcements.

Their payments are not wired either: the checkout only logs a message. So we take design patterns and a set of smaller features, not code.

## 2. Take, mapped to our roadmap

| Item from racoon-lms | Value | Where it lands in runly.lms |
|---|---|---|
| Course landing page: blurred banner hero, sticky CTA card, mobile CTA bar, accordion curriculum with free-preview play, instructor card, share, OG tags | High | Phase 6, public catalog (website), plus the internal course page for the self-enroll catalog |
| Player polish: theater mode, a sidebar with 16:9 thumbnails and type-colored placeholders, animated sections, Description/Resources/Q&A tabs | High | Player refresh after the authoring work |
| Custom video controls: ±10 s, speed 0.5-2x, iOS fullscreen, auto-hiding controls, hls.js error recovery | High | Shared `@runly/ui` video player (also useful for chat recordings) |
| Lesson attachments (resources on any lesson kind) | High | Small schema addition (`lms_lesson_attachment`), "Recursos" tab |
| Free preview per lesson plus "whole section free" | Medium (Phase 6) | `lms_lesson.preview` already exists; add a section toggle and the public preview flow |
| Coupons (percent or fixed, per course or global, max uses, expiry, redemptions; atomic counter on the server) | Medium (Phase 6) | Together with Stripe; redemptions must be transactional, which theirs are not |
| Cart, wishlist, abandoned-cart reminder | Low-Medium (Phase 6) | Only if multi-course checkout is wanted; wishlist is cheap |
| Q&A search with highlighting and a "this lesson / whole course" toggle | Medium | Phase 3 follow-up (API search parameter plus a UI toggle) |
| Global search and catalog facets (category, level, free/paid) | Medium | Catalog filters now; global search through the shell command bar later |
| Floating upload progress tray across navigation | Medium | Fits the HLS uploads: an app-wide tray so a 2 GB upload survives navigation |
| Quiz images (question image, image-choice) | Medium | Phase 2 follow-up: `imageFileId` on questions |
| Video chapters (`lessonTimestamps`) | Medium | New: `lms_lesson_chapter` (title, atSec), shown in the player |
| Student dashboard: streak, recommendations, progress view; instructor stat cards | Medium | Phase 5 reporting |
| Course stats aggregates updated by triggers | Done differently | We cache `rating_avg`/`rating_count`; add a students count when the catalog needs it |
| Notification fan-out (email + push + in-app per event) | Already have | runly `notificationService` already sends to in_app, email and web_push |
| Animated empty states, page transitions, staggered cards, glass/gradient tokens | Low (style) | Adopt selectively within the Runly design system; no new color system |
| i18n es/en, PWA install prompt | Out of scope | The Runly shell owns these |

## 3. Explicitly not taken
- The `video-api` design: a synchronous transcode inside the HTTP request, no auth on upload or delete, public HLS URLs, a single rendition. We use browser-side remux into HLS segments with signed playback (spec §14) instead. A server-side transcode worker with an ABR ladder stays a future option, for when the VPS has ffmpeg and a job queue.
- Client-side grading and answer keys sent to the browser.
- Client-only coupon validation.
- The EasyMDE editor: Runly standardizes on `MarkdownField` (MDXEditor).

## 4. Proposed order after the current authoring/HLS work
1. Player refresh: theater mode, custom controls in `@runly/ui`, thumbnails sidebar, Resources tab with lesson attachments, video chapters.
2. Internal course page (landing style) for the self-enroll catalog, plus catalog filters.
3. App-wide upload tray for large videos.
4. Phase 5 dashboards (student progress and streak, instructor stats and drop-off).
5. Phase 6: public catalog on website, free preview, coupons, Stripe checkout, wishlist.
