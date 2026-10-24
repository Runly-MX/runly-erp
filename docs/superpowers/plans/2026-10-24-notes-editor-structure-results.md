# Notes editor structure: results (phases 3 and 3b)

Plan: `docs/superpowers/plans/2026-10-24-notes-editor-structure.md`. Frontend only.

## What shipped

- Pure helpers: `lib/outline.js` (`extractOutline`, `countPages`, `slugify`), `lib/saveStatus.js` + `hooks/useSaveStatus.js`.
- Blocks: `pageBreak` and `tableOfContents` TipTap nodes (registered in `buildExtensions` for editable and read-only editors), slash items and a toolbar page-break button (Ctrl+Enter). Styles live in `packages/ui/src/runtime.css` (where `.tiptap` and `.note-sheet` are defined).
- Outline panel: right rail on `lg+`, bottom `Sheet` below `lg` and on pages where the document owns the scroll (public view). Scroll spy at 25% of the container. Toggle in the toolbar and a floating button when viewing. Open state persisted per viewer (`runly:v1:notes-outline-open`).
- Paged view: per note, per viewer (`runly:v1:notes-paged:<noteId>`), A4 or Carta width, gray gutter at each break, floating page counter. Settings panel section "Vista por paginas".
- Print: `printNote()` plus `@media print` rules (body `data-note-print` keeps only the sheet and its ancestors, breaks honored, images and table rows kept whole). PDF export now cuts the raster at the page break offsets, one PDF page per segment.
- Save status badge in the editor panel header (saved, saving, error, offline), published from `NoteEditorSurface` without changing the save engine.
- Touch: the formatting toolbar is portaled into a fixed bar above the keyboard when the pointer is coarse and the keyboard is open; scroll padding and the caret-visibility check account for the 48px bar.

## Deviations

- PDF export: the existing export produced a single page the size of the whole canvas (no height slicing), so there was nothing to "slice at the nearest preceding break". With breaks present it now emits one page per break-delimited segment; without breaks it is unchanged. No automatic A4-height split.
- The `online` event triggers one normal flush when work is pending (so the badge does not stay in "Sin conexion"); the save engine itself is untouched.
- The touch bar changes the portal target of `NoteToolbar`, so toolbar-local state (an open link popover) resets when the keyboard opens or closes. The editor is not remounted.
- Extension memo dependencies unchanged; `updateGate`, `CompositionGuard` and stable-extensions logic untouched.

## Known limits

- Paged view uses explicit breaks only; there is no automatic height pagination.
- Outline and table of contents list real headings only (never the title paragraph).
- Print relies on `:has()` selectors (current evergreen browsers).

## Automated verification (2026-10-24)

- `node --test "apps/desktop/src/modules/runly.notes/lib/__tests__/*.test.js"`: 179 tests, 179 pass.
- `node --test "apps/api/src/routes/notes/__tests__/*.test.js"`: 52 tests, 52 pass.
- `pnpm lint`: clean.
- `pnpm --filter @runly/desktop build:web`: builds.

## Manual QA checklist (pending)

- [ ] Phone 390px, tablet and desktop; light and dark.
- [ ] Keyboard open and close with the formatting bar; caret never hidden behind the bar.
- [ ] S Pen writing with the bar visible.
- [ ] Outline click and scroll spy (rail on desktop, sheet on phone).
- [ ] Table of contents block in a public note.
- [ ] Paged view toggle persists per note; page counter updates.
- [ ] Print preview shows only the sheet and breaks; PDF export splits at breaks.
- [ ] Save badge: saving, saved, offline and error states.
