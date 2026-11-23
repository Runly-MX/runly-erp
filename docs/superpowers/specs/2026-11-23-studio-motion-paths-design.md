# Studio: motion paths, route tools and timeline usability

Status: blocks A–C implemented and verified (commit `5a03b8c1b`); block D is design only.

## Problem

Studio Next could animate positions with keyframes, but the route an element follows was
invisible and could only be built one keyframe at a time (drag at the playhead, repeat).
The review also flagged a playback bug (seeking while playing jumped back), generic track
names ("Rectángulo" three times), two X/Y editors that looked alike, and a canvas squeezed
to ~23 % zoom once the timeline, Elementos and Propiedades were all open.

## Decision: build on the v8 keyframes, no contract change

A path is the position track of an element, drawn through its visual centre. Keyframes
keep storing the top-left `x`/`y` the renderer reads (`sceneAt` in
`packages/studio-interchange/src/studio/motion.js`), so a route made with the new tools is
indistinguishable from hand-made keyframes: it plays, saves, syncs, undoes, imports,
exports (GIF, MP4, WebM, `.runlystudio` v2) and reaches the Developer Hub exactly as
before. No validator, protocol, package or Hub change was needed.

Consequences accepted:

- Segments are straight. `x` and `y` are interpolated independently with the destination
  keyframe's easing, so a curve is approximated by points. Measured: a drawn elliptical
  arc needs 13 points (17 with smoothing) to stay within 2.5 screen px. This is the main
  argument for Bézier paths (block D).
- The 32-keyframe limit per element stays. The budget for a route is 32 minus the
  element's non-position keyframes (rotation, opacity, scale), which are preserved.

## What exists (pure engine: `apps/desktop/src/modules/runly.studio/lib/motion-path.js`)

| Function | Purpose |
|---|---|
| `positionPath`, `centerAt`, `centerOffset` | Route points (centre space) from keyframes; centre at any `t` |
| `withPositionPath` | Replace the position track, keep other properties, enforce 2..32 |
| `simplifyPath` | Ramer–Douglas–Peucker with a tolerance raised until the budget fits |
| `smoothPath` | Chaikin corner cutting (optional «Suavizar») |
| `timePath` | Times: as drawn, uniform speed, equal intervals; route curve by inverting the easing |
| `buildPath` | Stroke → simplified, optionally smoothed, timed route |
| `movePathPoint`, `removePathPoint`, `insertPathPoint`, `duplicatePathPoint` | Point edits |
| `translatePath`, `reversePath`, `retimePath`, `scalePath`, `copyPath`, `pastePath` | Route edits |

Every edit returns the `keyframes` field for one editor patch: one undo step and one
collaboration batch. `insertPathPoint` places the new point where the element already is
at that instant, so inserting never changes the animation.

Simplification tolerance is screen-relative (2.5 px / zoom): at 33 % zoom the pointer is
quantised to ~3 page px, and a fixed page tolerance kept that noise as extra points.

## UI (all under `components/editor/timeline/`)

- `MotionPathOverlay` — SVG inside the animated paper (follows zoom, scroll, page size):
  route with halo, direction chevrons on long segments, numbered points (green start, red
  square end, selected point filled), playhead marker, «+» handles on segments ≥ 48 screen
  px. Points closer than 24 screen px render as small unnumbered dots. Pointer: drag a
  point; Mayús + drag moves the whole route. Keyboard: arrows nudge 1 px (Mayús 10), Supr
  removes. Hit radius 22 px on coarse pointers, 10 px otherwise. It is mounted only in
  Animación mode, so it never reaches Presentar or any export.
- Selection sync — a point's identity is its keyframe instant. Selecting a point selects
  the keyframe and moves the playhead; selecting a keyframe highlights the point. Moving a
  keyframe in time (drag, arrows, inspector) carries the selection to the new instant.
- `useMotionPathTool` + `MotionToolBar` — «Dibujar movimiento» (stroke) and «Crear
  trayectoria» (clicks) share one pipeline: offsets from the element's centre at the start
  instant → route → keyframes. Options: Inicio (defaults to the playhead, to chain moves),
  Duración, Ritmo, Curva del recorrido, Suavizar. The preview is a timeline draft (several
  elements for a group); nothing is written until Aplicar; Descartar and Esc leave the
  document untouched. The bar docks inside the timeline, never over the paper.
  Dragging an element still means «position at the playhead»; the tools are explicit modes
  with their own bar and crosshair cursor, so the two operations cannot be confused.
- `PathMenu` — Invertir recorrido, Velocidad uniforme, Intervalos iguales, Cambiar
  duración…, Copiar/Pegar trayectoria (relative, pasted at the playhead), Quitar trayectoria.
- `TimelinePanel` — labelled actions (Añadir keyframe, Dibujar movimiento, Crear
  trayectoria, Trayectoria), Reproducir desde el inicio, Modo enfocado; shortcuts kept.
- Tracks and Capas share `objectLabels` (repeated names numbered in stack order); tracks
  add type icon, colour dot, route/hidden/locked marks and an accent on the selected row.
- `KeyframeInspector` titled «Propiedades del keyframe», with the element name, the point
  number and an editable time; Propiedades titles its section «Posición base (Diseño)»
  while animating, with a one-line explanation.
- `useAnimationFocus` — Modo enfocado folds Elementos/Propiedades, switches to the
  existing «clean» view mode, refits; leaving restores exactly what was open. Remembered
  per viewer in `localStorage`. Timeline height now goes up to 60 % of the window.

## Playback fix (`useTimeline.js`)

The clock is `time = now − origin`. Seeking while playing changed `time` but not
`origin`, so the next frame jumped back. `setTime` now moves the origin when playing;
`playFrom(at)` restarts from an instant. Still one clock, still `sceneAt` for every frame.

## Block D — architecture (not implemented)

### D1. Bézier spatial paths

Proposal: an optional per-keyframe `path` object, valid only on frames with `x`/`y`:
`{ in: [dx, dy], out: [dx, dy] }`, tangent handles relative to the point (page px,
±16384). Between two position frames A→B, when A has `out` or B has `in`, the centre
follows the cubic A, A+out, B+in, B; the destination easing applies to the arc-length
parameter (precomputed LUT, 64 samples), otherwise the current linear interpolation.

Required for compatibility, in order:

1. `@runly/studio-interchange`: validator accepts `path` (schema stays v8 if older
   readers ignore unknown keyframe keys — they do not: `validateKeyframes` copies known
   keys only, so a v8 reader silently drops tangents and plays straight lines). Therefore
   a new protocol level (5) and the same upgrade gate used for v7→v8 (426 for older
   clients writing a document that has tangents).
2. `sceneAt`/`keyframeValuesAt` evaluate the curve; exporters (GIF/MP4/WebM, recorder,
   Website) use `sceneAt`, so they follow automatically.
3. `.runlystudio` package bump, Developer Hub validator and MCP `runly_studio_contract`
   republished, pinned version bumped in this repo.
4. PPTX unaffected (animations are already reported as not exported).

Editor: handles on the selected point, «Suavizar» producing tangents (Catmull-Rom) instead
of extra points, so a drawn arc fits in 3–5 points. Justified by the measured point
counts above; not done now because it needs the protocol bump and a Hub release.

### D2. Several effects per element (sequences)

Today: one `enter`, one `emphasis`, one `exit`, plus keyframes. Proposal: optional
`effects: [{ kind, preset, delay, duration, easing, repeat }]` (max 16 per element, same
2000-per-document total) evaluated after keyframes in array order; offsets add, opacity
and scale multiply, rotation adds — the same composition `evaluate` already uses for the
three fixed slots. The fixed slots map to the first entries, so reading stays compatible
and writing `effects` needs the same protocol gate as D1. Timeline: one clip row per
element with all clips, reorderable by time. Until then, sequences like
«aparecer → mover → girar → pulsar → bajar → salir» are already possible with one
entrance, keyframes (position + rotation + scale, now drawable) and one exit; only a
second preset emphasis needs D2.

### D3. Audio tracks

«Grabar presentación» records a session (canvas + optional microphone) to a local Blob;
it is not part of the document. «Editar audio en Studio» would be persistent tracks.
Recommendation: `page.audio` (per slide) and `document.audio` (background) entries
`{ fileAssetId, start, trimStart, trimEnd, volume, fadeIn, fadeOut, muted }`, stored as
files through the existing FileAsset flow, played by one `AudioContext` slaved to the same
timeline clock (`time` → `source.start(when, offset)` on play/seek; no second timeline),
waveform from a one-time decoded peaks array cached with the asset, mixed into MP4/WebM
via `MediaStreamAudioDestinationNode` in the existing recorder/exporter. Needs the same
protocol gate plus storage quota rules; GIF and PPTX would report the loss.

### D4. Element names

Renaming requires an optional `name` on objects in the interchange validator (it keeps
only known keys today), with the same gate. Until then, numbered labels shared by Capas
and the timeline remove the ambiguity.

## Not done (known limits)

- Multi-selection of keyframes (move/copy several at once). Route-level operations cover
  the common cases (move all, retime, copy/paste, invert).
- Physical touch and stylus were not tested; only Chromium touch emulation (390 px,
  `hasTouch`) for tap-based flows. Pinch/pan vs point drag on real devices pending.
- Video export (MP4/WebM) of a drawn route was not exercised in the browser; it uses the
  unchanged `sceneAt` path that the existing export tests cover.
