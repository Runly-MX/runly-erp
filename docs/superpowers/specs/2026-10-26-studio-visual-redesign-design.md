# runly.studio — visual redesign (home + editor)

Status: approved (autonomous roadmap decision, 2026-10-26)

## Problem

Studio works (persistence, realtime, sharing, resources, export) but its UI is a
stack of default buttons and selects: a three-column form-like grid inside the
standard module sidebar, text-only template cards, list items without previews,
and an editor whose tools, zoom and inspector are plain labelled buttons. It does
not meet the Runly bar (responsive, touch-first, beautiful).

## Goals

- Use the whole screen: Studio is declared `fullscreenPaths: ['/']`, so the
  Runly module sidebar is hidden on the home and in the editor (same mechanism as
  Canvas/Projects). The Runly topbar stays; the editor also supports the shared
  `useViewMode` clean/fullscreen cycle.
- Home inspired by the Stitch sketches, in Runly identity (tokens, light + dark,
  Studio fuchsia accent `#D946EF`), not a copy of Canva:
  hero with search and format categories, format grid, template gallery with real
  previews, "Tus diseños" grid with real vector thumbnails, blank/custom card.
- Editor: top bar (back, inline name, save state, undo/redo, presence, share,
  export menu, save), left icon rail with flyout panels (Elementos, Texto,
  Imágenes, Capas, Página), center viewport with floating zoom pill and a
  contextual selection bar, right inspector (transform, color, text, align,
  arrange). Phones: rail becomes a bottom bar, panels and inspector open as
  sheets, top bar collapses into an overflow menu.
- No fake features: nothing in the UI that the backend cannot do (no AI
  generator, no storage meter, no font picker — the document only allows
  sans-serif).

## Non-goals

Document schema, persistence, conflict/recovery semantics, realtime protocol and
permissions are unchanged. No new object types.

## Design decisions

- Thumbnails: `GET /studio/designs` adds a bounded `preview` (page + first 40
  objects, text cut to 120 chars) and `objectCount`; the client renders it as
  SVG (`StudioThumbnail`). Image objects render as a tinted placeholder (no
  signed URL per card). Templates reuse the same renderer over
  `templateDocument()`.
- Search: `GET /studio/designs?q=` filters by name (ILIKE, escaped, max 80).
- `ToolButton` (icon button + tooltip + shortcut) moves from runly.canvas to
  `@runly/ui`; Canvas re-exports it so nothing else changes.
- Export becomes a dropdown (PNG, JPG 100/90/70) instead of two selects.
- Delete via toolbar/Supr still asks `ConfirmDialog`.

## Acceptance

- Module sidebar hidden on `/app/m/runly.studio` (home and `?design=`).
- Home and editor usable at 360px, 768px, 1280px+, light and dark; touch
  targets ≥ 40px on phone bars; no horizontal page scroll.
- All previous editor capabilities remain reachable on every breakpoint.
- Existing studio tests + manifest test pass; `pnpm build:web` passes.
