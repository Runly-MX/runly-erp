# Notes Editor Touch + Structure (outline, contents, page breaks, paged view) Implementation Plan (Phases 3 and 3b, frontend only)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Long notes get a live outline panel, an insertable table of contents, page breaks, an optional paged view and print/PDF that honors breaks; touch devices get a formatting bar that rides above the keyboard and an autosave status indicator.

**Architecture:** Pure helpers (`outline`, `saveStatus`) are tested in isolation. New TipTap nodes (`tableOfContents`, `pageBreak`) live in `lib/extensions/` and are registered in `buildExtensions` so the public read-only view renders them too. Paged view is a presentation mode (CSS on the existing sheet + page counter), off by default and stored per note per viewer; editing stays one continuous document.

**Tech Stack:** TipTap 3.30.5 (`@tiptap/core`, `@tiptap/react` ReactNodeViewRenderer, `@tiptap/pm`), React, Tailwind, node:test.

Spec: `docs/superpowers/specs/2026-10-24-notes-quick-notes-redesign-design.md` sections 5.3 and 5.3b (sub-pages are a separate plan).

Conventions: JavaScript only, Spanish UI text, English code/comments, no emojis, `@runly/ui` first, flat selected states, controls `rounded-md` max, files under 1000 lines (`NoteToolbar.jsx` is 472, `NoteEditor.jsx` ~620: extract rather than grow). Tests with `node --test "<glob>"` (Node 22). Commit each task right away staging only your files (unrelated uncommitted changes exist in `docs/developers/*` and `packages/module-compiler/src/developer-docs.json`), branch `main`, commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never start/stop dev servers. Note that the FIRST paragraph of a note is its title (see `NoteEditor.jsx handleUpdate`): the outline only lists real `heading` nodes, never the title.

Base dir for relative paths: `apps/desktop/src/modules/runly.notes/`.

---

### Task 1: Pure helpers (outline, page count, save status) with tests

**Files:**
- Create: `lib/outline.js`, `lib/saveStatus.js`, `hooks/useSaveStatus.js`
- Create: `lib/__tests__/outline.test.js`, `lib/__tests__/save-status.test.js`

- [ ] **Step 1: Tests first.**

`lib/__tests__/outline.test.js`
```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { extractOutline, countPages, slugify } from '../outline.js'

const node = (name, text = '', attrs = {}) => ({ type: { name }, textContent: text, attrs })
const fakeDoc = (entries) => ({ descendants(cb) { entries.forEach(([n, pos]) => cb(n, pos)) } })

test('slugify strips accents and symbols', () => {
  assert.equal(slugify('Introducción: ¡Hola Mundo!'), 'introduccion-hola-mundo')
})

test('extracts headings with level, text, pos and unique ids', () => {
  const doc = fakeDoc([
    [node('paragraph', 'Titulo de la nota'), 0],
    [node('heading', 'Objetivo', { level: 1 }), 20],
    [node('heading', 'Objetivo', { level: 2 }), 60],
    [node('heading', '   ', { level: 2 }), 90],
  ])
  assert.deepEqual(extractOutline(doc), [
    { id: 'objetivo', level: 1, text: 'Objetivo', pos: 20 },
    { id: 'objetivo-1', level: 2, text: 'Objetivo', pos: 60 },
  ])
})

test('countPages is page breaks plus one', () => {
  assert.equal(countPages(fakeDoc([[node('paragraph'), 0]])), 1)
  assert.equal(countPages(fakeDoc([[node('pageBreak'), 0], [node('pageBreak'), 5]])), 3)
})
```

`lib/__tests__/save-status.test.js`
```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { setSaveStatus, getSaveStatus, subscribeSaveStatus } from '../saveStatus.js'

test('defaults to saved and notifies subscribers on change only', () => {
  assert.equal(getSaveStatus('n1'), 'saved')
  const seen = []
  const off = subscribeSaveStatus('n1', () => seen.push(getSaveStatus('n1')))
  setSaveStatus('n1', 'saving')
  setSaveStatus('n1', 'saving')
  setSaveStatus('n1', 'saved')
  off()
  setSaveStatus('n1', 'error')
  assert.deepEqual(seen, ['saving', 'saved'])
  assert.equal(getSaveStatus('n1'), 'error')
})

test('statuses are per note', () => {
  setSaveStatus('a', 'saving')
  assert.equal(getSaveStatus('b'), 'saved')
})
```

- [ ] **Step 2: Run, expect FAIL** (modules missing).

- [ ] **Step 3: Implement.**

`lib/outline.js`
```js
export function slugify(text) {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// `doc` is a ProseMirror node (or anything with descendants(cb)). Only real
// heading nodes are listed; the first paragraph (the title) is not a heading.
export function extractOutline(doc) {
  const items = []
  const seen = new Map()
  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return true
    const text = node.textContent.trim()
    if (!text) return false
    const base = slugify(text) || 'seccion'
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    items.push({ id: n ? `${base}-${n}` : base, level: node.attrs.level, text, pos })
    return false
  })
  return items
}

export function countPages(doc) {
  let breaks = 0
  doc.descendants((node) => {
    if (node.type.name === 'pageBreak') breaks += 1
    return true
  })
  return breaks + 1
}
```

`lib/saveStatus.js`
```js
// Tiny per-note pub/sub so the editor can publish autosave state to the page
// header without prop drilling. Status: 'saved' | 'saving' | 'error' | 'offline'.
const statuses = new Map()
const listeners = new Map()

export function getSaveStatus(noteId) {
  return statuses.get(noteId) ?? 'saved'
}

export function setSaveStatus(noteId, status) {
  if (getSaveStatus(noteId) === status) return
  statuses.set(noteId, status)
  listeners.get(noteId)?.forEach((fn) => fn())
}

export function subscribeSaveStatus(noteId, fn) {
  if (!listeners.has(noteId)) listeners.set(noteId, new Set())
  listeners.get(noteId).add(fn)
  return () => listeners.get(noteId)?.delete(fn)
}
```

`hooks/useSaveStatus.js`
```js
import { useSyncExternalStore } from 'react'
import { getSaveStatus, subscribeSaveStatus } from '../lib/saveStatus.js'

export function useSaveStatus(noteId) {
  return useSyncExternalStore(
    (fn) => subscribeSaveStatus(noteId, fn),
    () => getSaveStatus(noteId),
    () => 'saved',
  )
}
```

- [ ] **Step 4: Run both tests, expect pass. Commit** `feat(notes): outline, page count and save status helpers`.

---

### Task 2: Page break node, table of contents node, slash commands

**Files:**
- Create: `lib/extensions/PageBreak.js`, `lib/extensions/TableOfContents.jsx`, `components/TableOfContentsView.jsx`
- Modify: `lib/editor-extensions.js` (register both for editable and read-only), `lib/slashCommandItems.js` (two items), `components/NoteToolbar.jsx` (insert-page-break button), `lib/__tests__/` (slash items test if one exists: keep it passing), `apps/desktop/src/modules/runly.notes/styles.css` or wherever `.note-sheet` and `.tiptap` styles live (grep `note-sheet` for the file)

- [ ] **Step 1: `PageBreak.js`** — TipTap `Node.create({ name: 'pageBreak', group: 'block', atom: true, selectable: true, draggable: true })`; `parseHTML: [{ tag: 'div[data-type="page-break"]' }]`; `renderHTML` returns `['div', mergeAttributes(HTMLAttributes, { 'data-type': 'page-break', class: 'note-page-break' }), ['span', { class: 'note-page-break__label' }, 'Salto de pagina']]`; command `setPageBreak: () => ({ chain }) => chain().insertContent({ type: 'pageBreak' }).run()` (declare it in the `Commands` module augmentation comment style the other custom extensions use; if they have none, skip the augmentation); keyboard shortcut `Mod-Enter` runs `setPageBreak`. Because `TrailingNode` guarantees a trailing paragraph, a break at the document end stays usable.

- [ ] **Step 2: `TableOfContents.jsx`** — TipTap `Node.create({ name: 'tableOfContents', group: 'block', atom: true, selectable: true, draggable: true })`, `parseHTML` `div[data-type="table-of-contents"]`, `renderHTML` `['div', mergeAttributes(HTMLAttributes, { 'data-type': 'table-of-contents' })]`, `addNodeView() { return ReactNodeViewRenderer(TableOfContentsView) }`; command `insertTableOfContents`. `components/TableOfContentsView.jsx` is a `NodeViewWrapper` (contentEditable false) that subscribes to the editor (`editor.on('update', ...)`, debounced 200 ms, and once on mount) and renders `extractOutline(editor.state.doc)` as an indented list (padding by level) of buttons; clicking scrolls to the heading with `editor.view.nodeDOM(pos)?.scrollIntoView({ behavior: 'smooth', block: 'start' })` (resolve `pos` fresh at click time from a new `extractOutline` call matched by `id`). Empty outline shows muted text "Agrega titulos para generar el contenido". Header row "Contenido" with `ListTree` icon. Works in read-only editors (public view): clicking only scrolls within the page.

- [ ] **Step 3: Register** both nodes in `buildExtensions` base list (not only when editable) so public/readOnly notes render them. Add slash items to `buildSlashItems`: `{ title: 'Tabla de contenido', icon: ListTree, keywords: ['toc', 'contenido', 'indice'], run: ... insertTableOfContents }` and `{ title: 'Salto de pagina', icon: SeparatorHorizontal, keywords: ['page', 'pagina', 'salto', 'break'], run: ... setPageBreak }` (both NOT `allowedInTable`). Add a toolbar button (icon `SeparatorHorizontal`, title "Salto de pagina (Ctrl+Enter)") next to the existing insert buttons. Update the slash-items test expectations only if one counts items.

- [ ] **Step 4: Styles.** Edit mode: `.note-page-break` is a full-width dashed rule with the small centered label (muted, `contenteditable` off). `@media print`: `.note-page-break { break-after: page; height: 0; border: 0 }` and hide its label; `.tiptap [data-type="table-of-contents"] button { text-decoration: none }`. Keep styles beside the existing note styles (find the file defining `.note-sheet`).

- [ ] **Step 5: Verify** `node --test "apps/desktop/src/modules/runly.notes/lib/__tests__/*.test.js"`, `pnpm lint`, `pnpm --filter @runly/desktop build:web`. **Commit** `feat(notes): page break and table of contents blocks`.

---

### Task 3: Outline panel

**Files:**
- Create: `components/OutlinePanel.jsx`, `hooks/useOutline.js`, `hooks/useNoteOutlineOpen.js`
- Modify: `components/NoteEditor.jsx` (mount the panel inside `NoteEditorSurface`), `components/NoteToolbar.jsx` (toggle button), possibly `lib/NoteInteractionContext` (see `components/NoteInteractionContext.js`) to pass `outlineOpen`/`toggleOutline`

- [ ] **Step 1: `hooks/useOutline.js`** — `useOutline(editor)` returns `{ items, activeId }`. `items` recomputed from `extractOutline(editor.state.doc)` on `editor.on('update')` (debounced 200 ms) and once on mount. `activeId` computed on scroll of the editor's scroll container (pass the element or use `editor.view.dom.closest('[data-note-scroll]')`; add `data-note-scroll` to the scroll wrapper in `NoteEditor.jsx` if there is none): the last heading whose DOM top is at or above 25% of the container height. Use `requestAnimationFrame` throttling; clean up listeners.
- [ ] **Step 2: `hooks/useNoteOutlineOpen.js`** — per-viewer persisted boolean, localStorage key `runly:v1:notes-outline-open`, try/catch around storage (pattern: `getListCollapsed` in `NotesScreen.jsx`).
- [ ] **Step 3: `components/OutlinePanel.jsx`** — on `lg` and wider: right rail `w-64 shrink-0 border-l` inside the editor area, scrollable, heading "Contenido" with close button; below `lg`: a bottom sheet using the `@runly/ui` `Sheet` (side bottom, max height 60vh). Items are buttons (min 44px touch height on coarse pointers) indented by `level`, active item has a flat filled background (no ring), click scrolls (same scroll helper as the TOC node: extract it to `lib/scrollToHeading.js` and reuse in `TableOfContentsView.jsx`). Empty state via `EmptyState` ("Sin titulos", "Usa Titulo 1 a 3 para generar el contenido"). Hidden when the note is a canvas.
- [ ] **Step 4:** Toggle button (`ListTree`, title "Contenido") in `NoteToolbar.jsx`; mount `OutlinePanel` in `NoteEditorSurface` next to the scroll area (layout: the existing column becomes a row only when the panel is open on `lg`). Make sure the page-level layout, keyboard-inset logic and `shouldFocusDocumentEnd` click handler still work. Public read-only view: show the toggle too (a floating small button top-right of the sheet) since reading long notes benefits most.
- [ ] **Step 5: Verify** lint, build, notes tests. **Commit** `feat(notes): outline panel with scroll spy`.

---

### Task 4: Optional paged view and print/PDF that honors breaks

**Files:**
- Create: `hooks/useNotePagedView.js`, `components/PageCounterChip.jsx`
- Modify: `components/NoteSheet.jsx` (page-size classes), `components/NoteSettingsPanel.jsx` (toggle + page size select), `components/NoteEditor.jsx`, `lib/notePageExport.js`, `components/PublicNoteToolbar.jsx` only if its download buttons need the new option, style file from Task 2

- [ ] **Step 1: `hooks/useNotePagedView.js`** — `useNotePagedView(noteId)` returns `[{ enabled, size }, setPaged]` stored per note per viewer under localStorage `runly:v1:notes-paged:<noteId>` (`{ enabled: boolean, size: 'a4' | 'letter' }`, default `{ enabled: false, size: 'a4' }`), try/catch on storage. Default is the continuous view; nothing visual changes unless enabled.
- [ ] **Step 2: Paged presentation (CSS only).** When enabled, `NoteSheet` adds `data-paged="true"` and `data-page-size`. CSS: page width 794px (A4) / 816px (Carta) with `max-width: 100%`, horizontal page margins as sheet padding, a soft shadow on the sheet and a visible gray gutter at each `.note-page-break` (a full-bleed band using negative inline margins equal to the sheet padding, 28px tall, `background: hsl(var(--muted))`, with the label hidden and a subtle shadow above/below). No automatic height-based splitting in this phase; explicit breaks only (state this in the results file).
- [ ] **Step 3: `PageCounterChip`** — small floating chip bottom-left "N paginas" (from `countPages(editor.state.doc)`, debounced like the outline) shown only when paged view is enabled, using `useCurrentEditor`.
- [ ] **Step 4: Settings.** In `NoteSettingsPanel.jsx` add a "Vista por paginas" section: `Switch` (check `@runly/ui` exports; use `Checkbox` if there is no switch) and a `SelectField` for "Tamano de pagina" (A4, Carta) visible only when enabled. These are per viewer and do not call the API.
- [ ] **Step 5: Print and PDF.** Add `printNote()` to `lib/notePageExport.js`: `window.print()` after setting `document.body.dataset.notePrint = 'true'` and removing it in an `afterprint` listener; add `@media print` rules (hide app chrome: toolbar, sidebar, outline, chips, overlay backdrops, with `body[data-note-print] > *:not(...)` approach or a dedicated print root; use the least invasive approach that makes only the sheet print, keep `break-after: page` for `.note-page-break`, `break-inside: avoid` for images and table rows). Add an "Imprimir / guardar como PDF" button in the settings panel. In the existing html2canvas PDF export, split the canvas at the `.note-page-break` element offsets in addition to the A4 height (read the file first; if it already slices by height, slice at the nearest preceding break boundary instead when breaks exist; document the approach in a comment).
- [ ] **Step 6: Verify** lint, build, notes tests. **Commit** `feat(notes): optional paged view, page counter, print and PDF honoring page breaks`.

---

### Task 5: Touch formatting bar above the keyboard and save indicator

**Files:**
- Modify: `components/NoteEditor.jsx` (where `toolbarHost` is used, `flushSave`), `components/NoteToolbar.jsx`, `components/NoteEditorPanel.jsx` (header indicator)
- Create: `components/SaveStatusBadge.jsx`

- [ ] **Step 1: Save status publishing.** In `NoteEditorSurface`, wrap `flushSave` so it calls `setSaveStatus(note.id, 'saving')` before flushing and `'saved'` after the returned promise resolves (check `lib/flushNoteSave.js` for what it returns; if it resolves even when the request failed and retained the payload, inspect the shared refs `pendingRef.current || ydocDirtyRef.current` after the flush: if still dirty set `'error'`). On `handleUpdate` (a local edit queued) set `'saving'` too, so the badge shows pending work during the 1.5 s debounce. Listen to `window` `online`/`offline` events and set `'offline'` when offline and a flush is pending. Do not touch the behavior of the save engine itself, only publish status.
- [ ] **Step 2: `components/SaveStatusBadge.jsx`** — `useSaveStatus(noteId)`; renders a small muted text with icon: saved = `Check` "Guardado", saving = `Loader2` spinning "Guardando...", error = `AlertTriangle` "Error al guardar" (destructive color), offline = `CloudOff` "Sin conexion". `aria-live="polite"`. Mount it in the editor panel header next to the existing buttons (hidden for trash/read-only/canvas notes).
- [ ] **Step 3: Bottom toolbar on touch.** Using `useCoarsePointer()` and `useKeyboardInset()` from `@runly/ui` (already imported in these files): when the pointer is coarse and the keyboard is open (`keyboardInset > 0`) and the note is editable, render the toolbar content (`<NoteToolbar .../>`) into a fixed bar `position: fixed; left: 0; right: 0; bottom: <keyboardInset>px; z-index: 40` with a top border and `bg-background`, horizontally scrollable, single row, 44px buttons, instead of the sticky top host. When the keyboard is closed or the pointer is fine, keep today's behavior (sticky host). Add bottom padding to the scroll area equal to the bar height while it is shown so the caret is never hidden (reuse `handleSelectionUpdate`'s keyboard logic). Do not unmount the editor when switching hosts: only change the portal target.
- [ ] **Step 4: Verify** lint, build, notes tests. **Commit** `feat(notes): save status badge and keyboard-aware formatting bar on touch`.

---

### Task 6: Docs and evidence

**Files:** Modify `docs/TASKS.md`; create `docs/superpowers/plans/2026-10-24-notes-editor-structure-results.md`.

- [ ] Run `node --test "apps/desktop/src/modules/runly.notes/lib/__tests__/*.test.js"`, `node --test "apps/api/src/routes/notes/__tests__/*.test.js"`, `pnpm lint`, `pnpm --filter @runly/desktop build:web`; record exact counts.
- [ ] Results file: what shipped, deviations, known limits (paged view uses explicit breaks only, no automatic height pagination; outline and TOC only list real headings), and a manual QA checklist (phone 390px, tablet, desktop; light/dark; keyboard open/close with the formatting bar; S Pen writing with the bar visible; outline click/scroll spy; TOC node in a public note; paged view toggle persists per note; print preview shows breaks). Manual items stay unchecked.
- [ ] `docs/TASKS.md`: unchecked entry under the notes section. If `docs/ai-context/rme3-runtime-capabilities.md` lists editor extensions, add the two nodes. **Commit** `docs(notes): editor structure results and QA checklist`.
