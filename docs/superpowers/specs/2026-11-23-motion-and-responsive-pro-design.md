# Motion Engine and Responsive Pro (Phase 3)

## 1. Feature title

Motion Engine and Responsive Pro for the Atlas Web Builder, the Website portable format, the Developer Hub and the Runly ERP Website module.

## 2. Status

Proposed (2026-11-23). Implementation starts only after approval of this spec and `docs/superpowers/plans/2026-11-23-motion-and-responsive-pro.md`.

## 3. Context

The KYNTRA evolution report (Phase 3) asks for configurable animations (fade, slide, scale, blur reveal, stagger, parallax, Ken Burns) editable from the Inspector and kept in the portable document, plus Responsive Pro: fluid typography, better position/crop controls, touch states and automatic overflow auditing. Phases 1 and 2 (SVG, icons, synced components) shipped in Atlas 0.9.1 to 0.9.3.

Repeated small patch releases are expensive: every Atlas release forces a publish of the shared packages and a re-adoption in the ERP and the Hub by a separate agent. Phase 3 is therefore delivered as ONE release train with a rehearsal before anything is published (section 26).

## 4. Problem

Verified in the code on 2026-11-23:

1. **Effects exist but are not portable.** `_animation`, `_stagger`, `_parallax`, `_hover`, `_transform`, `_filter`, `_opacity`, `_cursor`, `_zIndex` are universal props written by the Inspector (`UniversalEffects.jsx`) and sanitized at render (`src/renderer/effects.js`). They are NOT fields of any block in the Builder catalog, so the Website template reader rejects them with `prop_unknown`, the Hub diagnostics reject them, and an exported/imported template silently loses its motion. The report requires them to survive the portable document.
2. **No Ken Burns.** `EFFECT_PRESETS` has fade/slide/zoom/blur/rotate/flip only. There is no slow background zoom/pan.
3. **Scroll reveal hides content until JavaScript runs.** `ScrollRevealWrapper` starts at `opacity: 0` whenever the page is not in edit mode and motion is not reduced, so server-rendered HTML ships invisible content: a blank flash before hydration and invisible content if scripts fail or are slow (SEO and accessibility risk, layout/paint instability).
4. **Hover effects are not touch-aware.** `HoverStyleTag` applies `:hover` unconditionally, so on touch screens the effect sticks after a tap. There is no pressed (`:active`) or focus state for universal effects.
5. **Parallax can create horizontal scroll.** Parallax translates an inner wrapper with no containment guarantee, and there is no automated check.
6. **No fluid typography.** Text sizes are fixed px per device (`fontSize`, `tabletFontSize`, `mobileFontSize`); there is no `clamp()`-based scale and the theme font-size tokens are static rem values.
7. **Crop/position control is coarse.** `objectPosition` offers five keywords (`center|top|bottom|left|right`); `ImageBlock` has none. There is no focal point and no per-device focal point.
8. **Overflow auditing is manual.** The editor has an overflow diagnostic (0.9.0) but there is no automated sweep from 320 to 1920 px usable in CI, in Hub validation or as release evidence.
9. **Motion cannot be declared as a host capability.** Hub `runly_website_contract` and the ERP do not advertise which motion/responsive features a reader understands, so a template using them cannot be rejected cleanly by an older host (needed by Phase 4, prepared here).

## 5. Goals

1. Every universal effect prop (and the new ones) is part of a versioned **universal props contract** in the Builder catalog, validated identically by Atlas, the interchange reader/writer, the Hub diagnostics and the ERP, and preserved byte-for-byte by export, import, save and reopen.
2. The Motion Engine offers, editable in the Inspector with Spanish labels and live preview: fade, slide (4 directions with distance), scale (start/end), blur reveal (intensity), stagger (children sequence), parallax (intensity) and **Ken Burns** (zoom, pan direction, duration) with reduced-motion and `prefers-reduced-motion` honored everywhere.
3. Reveal animations never make server-rendered content invisible: without JavaScript, or before hydration, content is visible and in its final layout position; animating causes no layout shift (CLS contribution 0 from effects).
4. Hover effects apply only on devices that can hover; touch devices get a pressed state; keyboard focus always has a visible indicator.
5. Fluid typography: text elements and theme font-size tokens can scale continuously between a minimum and maximum size across a viewport range, using `clamp()`, still overridable per device.
6. Images (ImageBlock, ImageElementBlock, image backgrounds) support a **focal point** (x/y percentage) with per-device values, plus aspect ratio per device where the block already supports device overrides.
7. A reusable **overflow audit** (headless browser, 320 to 1920 px) runs in the Atlas, Hub and ERP test suites and produces release evidence; the editor diagnostic uses the same measurement rules.
8. The Hub contract and the ERP expose `motion` and `responsive` capability descriptors derived from the installed reader, never assumed.
9. A single coordinated release (Atlas + interchange + ERP + Hub) after a rehearsal that adopts the packed artifacts in both hosts and runs their suites and a real-browser matrix before anything is published.

## 6. Non-goals

1. Timeline editors, keyframe authoring for Website pages (Studio already has its own motion model), scroll-scrubbed animation libraries, Lottie/Rive.
2. Page transitions between routes, animated SVG authoring (SMIL/CSS stays rejected by the SVG sanitizer).
3. Per-breakpoint animation variants (one animation per element; reduced-motion removes it).
4. Component-level motion inheritance for synced components beyond what props already give (a component's blocks carry their own effect props).
5. Marketplace compatibility gating UI (Phase 4); this phase only exposes the capability descriptors it needs.
6. KYNTRA content and certification (Phase 5).

## 7. User stories

1. As a site designer, I want to pick a reveal (fade, slide, scale, blur) for a section and tune distance, intensity, duration and delay so that the page feels premium without writing code.
2. As a site designer, I want a Ken Burns effect on a hero image so that a still photo feels alive, and I want it to stop for visitors who prefer reduced motion.
3. As a site designer, I want headings that scale smoothly from phone to desktop so that I do not hand-tune three sizes.
4. As a site designer, I want to set the focal point of a photo so that the product stays visible when the crop changes between desktop and phone.
5. As a visitor on a phone, I want buttons to respond to my tap and not stay "hovered" so that the page feels native.
6. As a visitor who prefers reduced motion, or whose scripts are blocked, I want to see all content immediately.
7. As a template author using ChatGPT/Claude through the Hub, I want the contract to tell me which effects exist and their limits so that generated documents validate the first time.
8. As a release engineer, I want one rehearsed release instead of repeated patches so that publication is a single, low-risk step.

## 8. UX requirements

- Inspector "Efectos" section (existing `UniversalEffects`) is extended, not replaced: Entrada (preset, direction/distance where relevant, intensity, duration, delay, easing), Escalonado, Parallax (intensidad), **Ken Burns** (acercamiento, dirección, duración) shown only for blocks with an image/background, Interacción (hover, pressed), Filtros.
- Every control has a Spanish label, a reset-to-default and a plain-language hint; ranges are clamped; invalid values never reach the document.
- A "Reproducir entrada" button replays the animation in the canvas; the canvas is static by default (edit mode never animates on its own).
- Typography: a "Tamaño fluido" toggle on text-bearing elements reveals "Tamaño mínimo / máximo (px)" and the viewport range; the live preview follows the device frame. Theme panel gets "Escala fluida" for the font-size tokens.
- Image focal point: click/drag a dot on the image preview (and X/Y numeric fields) per device (Escritorio, Tableta, Móvil), with inheritance and reset like other responsive props.
- Touch: hover section shows "Se aplica solo con puntero; en táctil se usa el estado al presionar".
- Accessibility: all new controls are keyboard operable, labelled, and respect the editor's existing reduced-motion rules.
- Strings are Spanish; code, comments and docs are English. No emojis.

## 9. Routes/screens

No new routes. Existing screens affected: Atlas editor (right panel Efectos, Typography, Image, Theme), ERP `runly.website` page editor (inherits Atlas), Hub Website editor (inherits Atlas).

## 10. Data model

New or changed block props (all optional, absent = current behavior):

- `_animation` (extended): `{ preset, duration 0-5000, delay 0-5000, easing, distance 0-400 (slide/slide-fade), scaleFrom 0.5-1.5 (zoom), blur 0-40 (blur-in), once boolean }`. Existing presets and the existing `{preset,duration,delay,easing}` shape stay valid.
- `_kenburns`: `{ zoom 1.0-1.5, direction: 'in'|'out', pan: 'none'|'left'|'right'|'up'|'down'|'center', duration 3000-30000, easing }`.
- `_stagger`, `_parallax {speed}`, `_hover {scale, shadow, brightness, duration, easing}`, `_transform`, `_filter`, `_opacity`, `_cursor`, `_zIndex`, `_lazy`: unchanged shapes, now catalogued.
- `_pressed {scale 0.9-1, brightness 50-150}` (touch/active state).
- Fluid type on text-bearing blocks: `fluidType boolean`, `fontSizeMin 8-200`, `fontSizeMax 8-200`, `fluidMinViewport 280-1024`, `fluidMaxViewport 600-2560` (viewport widths in px).
- Image focal point: `focalX 0-100`, `focalY 0-100` plus `tabletFocalX/Y`, `mobileFocalX/Y` (same ranges, inherit when absent) on ImageBlock, ImageElementBlock and image backgrounds.
- Theme tokens: `fluid: { enabled boolean, minViewport, maxViewport }` for the `fontSize` scale.

Catalog: a new top-level `universalProps` map (name -> field spec in the same grammar as block fields: type, range/options) generated from Atlas, plus `capabilities: { motion: 1, responsive: 1 }`. The block `fields` of existing blocks do not change; readers validate any prop that starts with `_` through `universalProps`, and the new fluid/focal fields are normal block fields of the blocks that support them.

## 11. Prisma impact

None. ERP drafts store Atlas page JSON; `_`-props travel inside it. No migration.

## 12. API contract

No new ERP endpoints. Changed responses:

- Hub MCP `runly_website_contract` gains `motion: { presets, limits, kenburns, touchPolicy }` and `responsive: { fluidType, focalPoint, overflowAudit }`, present only when the installed reader supports them (`null` otherwise, same pattern as `svg` and `components`).
- Hub document diagnostics gain codes `effect_invalid` (value outside the contract, path-precise) and `effect_unknown`.
- ERP admin contract (`GET .../admin-contract`) lists `capabilities.motion` for the editor.
- Error codes: `effect_invalid`, `effect_unknown`, `fluid_invalid`, `focal_invalid`, all HTTP 422 via the existing validation envelope.

## 13. SDK contract

N/A. No new `@runly/sdk` domain methods.

## 14. Validator contract

`packages/studio-interchange`: `website-template.js` reads `universalProps` from the catalog and validates `_*` props through shared sanitizers (`src/website-effects.js`, pure, ported 1:1 from Atlas `effects.js` ranges and covered by a parity test that loads both). `website-write.js` accepts the same props. `@runly/validators`: N/A (the Website validators live in interchange).

## 15. Module manifest impact

N/A. `runly.website` manifest unchanged.

## 16. Navigation impact

N/A.

## 17. Blueprint impact

N/A.

## 18. RBAC/permissions

No new permission keys. Editing effects uses the existing `website.pages.update`; publishing stays `website.pages.publish`.

## 19. Multi-company behavior

Unchanged: effects are page content under the existing company/site scoping. Nothing is shared across companies.

## 20. Files/storage impact

None for motion. Focal point and Ken Burns reference existing image assets; no new object prefixes.

## 21. Export/import requirements

- Website template ZIP (format v2) carries the new props in `pages/*.json` and the theme `fluid` block in `theme.json`; no new ZIP entries, no format version bump. A package using only pre-Phase-3 props is byte-identical to today.
- Readers that predate `universalProps` already reject unknown props (`prop_unknown`), so an older host fails closed with an explicit error instead of dropping effects silently.
- Round trip requirement: export -> inspect -> import -> export is byte-identical for documents containing every effect.

## 22. Audit log requirements

N/A beyond existing `page.save_draft` and release events. No effect-specific audit action.

## 23. Edge cases

1. Content that is above the fold and animated must be visible in the SSR HTML (no `opacity:0` in server output); animation starts only after hydration and only if the element is below the fold or the author asked for entrance on load.
2. `prefers-reduced-motion: reduce` disables entrance, Ken Burns, parallax and stagger; content shows in its final state; hover transitions become instant.
3. Elements animated while inside a `ComponentRefBlock` expansion keep their own effect props; overrides cannot change effect props (they are not content fields).
4. Parallax or slide distance never creates horizontal scroll: the animated element sits inside an `overflow: clip` wrapper or uses transforms bounded by the declared distance (max 400 px) with `contain: paint` on the section.
5. Ken Burns on an image with `aspectRatio: auto` must not change layout size; the zoom is inside an overflow-clipped frame.
6. Fluid typography where `fontSizeMin > fontSizeMax` or min/max viewport inverted is rejected (`fluid_invalid`), never silently swapped.
7. A per-device override (tablet/mobile font size) wins over fluid type on that device.
8. Focal point on SVG vectors is accepted but only affects `objectFit: cover` rendering; vectors default to `contain`.
9. Touch devices with a mouse (hybrid) use `@media (hover: hover) and (pointer: fine)`; a hover-only effect must never be the only way to reveal content.
10. Print and no-JS rendering show final state; `@media print` disables animation.
11. Many animated blocks on one page: IntersectionObserver instances are shared and observers disconnect after `once` triggers; total animated elements per page above 60 emit a warning diagnostic, not an error.
12. Older stored documents with `_animation` outside the clamped ranges are normalized by the sanitizer at render and flagged by the validator only when they exceed the contract on write.

## 24. Risks

1. **Catalog change forces every host to adopt together.** Mitigation: one release train, `capabilities` descriptors, rehearsal with packed artifacts before publishing (section 26).
2. **Motion regressions are invisible to unit tests.** Mitigation: real-browser matrix (Chromium + WebKit) with reduced-motion emulation, no-JS render, CLS and overflow measurements as release gates.
3. **Parity drift between Atlas sanitizers and the interchange copy.** Mitigation: a parity test imports both and replays the same fixtures plus a property-style fuzz of boundary values.
4. **Hydration mismatch when SSR output changes** (visible-by-default reveal). Mitigation: SSR snapshot tests and a hydration test in Chromium/WebKit for every effect.
5. **Performance on low-end phones** (many observers, `will-change`). Mitigation: shared observers, `will-change` only while animating, warning above 60 animated elements, measurement in the matrix.
6. **Scope creep into a motion framework.** Mitigation: non-goals; presets stay a closed enum.
7. **Editor complexity** (focal point UI, fluid controls). Mitigation: reuse the existing field/control system and responsive inheritance; no new panel framework.

## 25. Acceptance criteria

1. Given a document containing every effect and fluid/focal prop, when it is exported, inspected, imported and exported again, then the two ZIPs are byte-identical and `validateWebsiteTemplate` reports `ok`.
2. Given a prop outside the contract (for example `_animation.duration: 99999`), when written through the Hub or the ERP, then the response is 422 `effect_invalid` with the exact path, and nothing is stored.
3. Given any animated page rendered on the server, when its HTML is inspected, then no element has `opacity:0`, `visibility:hidden` or an off-screen transform because of an effect, and with JavaScript disabled all content is visible.
4. Given Chromium and WebKit with `prefers-reduced-motion: reduce`, when an animated page loads, then no CSS animation or transition from effects runs and parallax offsets stay 0.
5. Given a page with entrance animations, when measured, then the layout shift attributable to effects is 0 and no horizontal scrollbar appears.
6. Given widths 320, 375, 414, 768, 1024, 1280, 1440 and 1920 px, when the overflow audit runs on the Phase 3 certification pages, then `scrollWidth <= clientWidth` at every width.
7. Given a touch-emulated device, when a block with a hover effect is tapped, then the hover style does not persist and the pressed style applies during the press.
8. Given a heading with fluid type 20 to 48 px over 360 to 1280 px, when rendered at 360, 820 and 1280 px, then the computed size is 20, a value between, and 48 px respectively, and a tablet override replaces it on tablet.
9. Given an image with focal point 20/30 on desktop and 60/40 on mobile, when rendered at both widths with `cover`, then `object-position` is `20% 30%` and `60% 40%`.
10. Given Ken Burns on a hero image, when it plays, then the image zooms within a clipped frame with no layout change and stops under reduced motion.
11. Given the Hub contract call, then `motion` and `responsive` descriptors are present only when the installed reader supports them and match the Atlas contract values.
12. Given the rehearsal, when packed Atlas/interchange artifacts are adopted in the ERP and the Hub, then both suites and the browser matrix pass before any publish, and the same artifacts are the ones published.
13. Given templates and documents created before this phase (SENDA and every existing fixture), then they validate, export and render byte-identically.

## 26. Verification plan

Run, in this order, and attach the outputs to the release evidence file `docs/releases/evidence/phase3-<date>.md`:

1. Unit: `pnpm test` (Atlas), `node --test packages/studio-interchange/src/__tests__/*.test.js`, Hub `node --test tests/*.test.js`, ERP `node --test` for touched services.
2. Parity: `website-effects-parity.test.js` (Atlas sanitizers vs interchange sanitizers, fixtures and boundary fuzz).
3. SSR/no-JS: renderer snapshot tests asserting no effect-driven hiding in server HTML.
4. Browser matrix (Playwright, Chromium + WebKit, new `scripts/verify-motion-responsive.mjs` in Atlas, reused by ERP/Hub tests): reduced-motion, no-JS, touch emulation, CLS, overflow sweep 320-1920, hydration, Ken Burns clipping, focal point, fluid type computed sizes.
5. Phase 2 acceptance in a real browser (SVG recolor with CORS, icons, synced components create/edit/detach/publish) as the first task, so defects ship in the same train.
6. Rehearsal: `pnpm pack` Atlas and interchange, install the tarballs in a scratch copy of the ERP and Hub (`pnpm add file:`), regenerate catalogs, run both suites plus the browser matrix; only then hand the same tarball hashes to the publishing agent.
7. Hub integration with a validator root built from the rehearsal packages (`tests/integration/*` for media, SVG, components, motion).
8. ERP: release expansion and admin contract tests; `pnpm --filter desktop build:web`.

## 27. Rollback plan

No migrations. The release train is additive: documents without new props are unchanged. To roll back, re-pin the ERP and the Hub to Atlas 0.9.3 and the previous shared-package revision (`shared-packages.lock.json`, `apps/api/package.json`); pages that already store new props keep them as opaque JSON in the ERP, and the Hub reader of the previous version rejects such packages with `prop_unknown` (fail closed) until re-adopted. The editor feature flags nothing; hosts that do not pass the new capability keep the old Inspector sections hidden.

## 28. Future enhancements

Per-breakpoint animation variants; scroll-linked (scrubbed) animation using CSS scroll timelines where supported; page transitions; motion presets library shared across sites (reusing synced components); animated backgrounds; Marketplace compatibility gating and install-time warnings (Phase 4); KYNTRA certification (Phase 5).
