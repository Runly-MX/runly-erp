# Notes Quick Home (Keep-style grid, quick composer, archive) Implementation Plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opening Notes shows a visual card grid with a quick composer and an Archive view; opening a note shows the existing editor as a sheet over the grid. The current two-pane layout stays as an option.

**Architecture:** Pure helpers (`notePreview`, `notesView`, `quickNoteContent`) feed new presentational components under `home/`. `NotesScreen` keeps all selection/mutation logic and gets a `layout` state (`home` default | `split`); in `home` the list panel becomes the grid and the editor panel renders as an overlay sheet. API already supports `isPinned`, `isArchived`, `archived=true` list filter, and returns `content` HTML plus `tags` in list rows, so no backend or schema change is needed in this phase.

**Tech Stack:** React 18, TanStack Query, Tailwind, `@runly/ui` (Dialog, DropdownMenu, EmptyState, PageHeader, SearchInput), node:test.

Spec: `docs/superpowers/specs/2026-10-24-notes-quick-notes-redesign-design.md` section 5.2.

Deviations from the spec for this phase (record them in the results file): tapping a checklist item on a card does not toggle it (the Y.js document is the source of truth and the card only has the HTML snapshot; toggling from the card would be overwritten); the composer offers Texto, Checklist and Dibujo (creates a canvas note); photo capture in the composer moves to Phase 3; manual "reorder pinned cards" is out.

Conventions: JavaScript only, all UI text Spanish, code/comments English, no emojis, Tailwind only, `@runly/ui` primitives first (no native select/checkbox/dialog, no window.confirm), flat selected state (no ring/glow), inputs/controls `rounded-md` max, modals with fixed header/footer and scrolling body, dialogs size md+ with `DialogHeader` icon. Files under 1000 lines (NotesScreen is 523 lines: extract rather than grow it past ~700). Tests with `node --test "<glob>"` (Node 22 needs the glob, not a directory). Commit each task right away staging only your files (the repo has unrelated uncommitted changes), branch `main`, commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never start/stop dev servers. Every new screen follows `docs/ai-context/ui-screen-audit-checklist.md`.

Base dir for relative paths: `apps/desktop/src/modules/runly.notes/`.

---

### Task 1: Pure helpers with tests

**Files:**
- Create: `lib/notePreview.js`, `lib/notesView.js`, `lib/quickNoteContent.js`
- Create: `lib/__tests__/note-preview.test.js`, `lib/__tests__/notes-view.test.js`, `lib/__tests__/quick-note-content.test.js`

- [ ] **Step 1: Tests first.**

`lib/__tests__/note-preview.test.js`
```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { extractPreview } from '../notePreview.js'

const checklistHtml =
  '<p>Compras</p><ul data-type="taskList">' +
  '<li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked><span></span></label><div><p>Leche</p></div></li>' +
  '<li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Pan</p></div></li>' +
  '</ul>'

test('extracts checklist items with checked state and counts', () => {
  const p = extractPreview(checklistHtml, 'Compras')
  assert.deepEqual(p.checklist.items, [{ checked: true, text: 'Leche' }, { checked: false, text: 'Pan' }])
  assert.equal(p.checklist.total, 2)
  assert.equal(p.checklist.done, 1)
})

test('limits visible checklist items to 5 but counts all', () => {
  const li = (i) => `<li data-checked="false" data-type="taskItem"><div><p>t${i}</p></div></li>`
  const html = `<ul data-type="taskList">${[1, 2, 3, 4, 5, 6, 7].map(li).join('')}</ul>`
  const p = extractPreview(html, '')
  assert.equal(p.checklist.items.length, 5)
  assert.equal(p.checklist.total, 7)
})

test('excerpt drops the title line and checklist text, trims to 240 chars', () => {
  const p = extractPreview('<p>Titulo</p><p>' + 'a'.repeat(400) + '</p>', 'Titulo')
  assert.equal(p.excerpt.startsWith('Titulo'), false)
  assert.equal(p.excerpt.length <= 240, true)
})

test('finds the first image src', () => {
  const p = extractPreview('<p>x</p><img src="https://a/b.png" alt=""><img src="https://a/c.png">', '')
  assert.equal(p.firstImage, 'https://a/b.png')
})

test('non-string content yields an empty preview', () => {
  const p = extractPreview(null, '')
  assert.deepEqual(p, { excerpt: '', checklist: null, firstImage: null })
})
```

`lib/__tests__/notes-view.test.js`
```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { splitPinned, applyClientFilters } from '../notesView.js'

const notes = [
  { id: '1', is_pinned: true, note_type: 'document', background_color: null, content: '<p>a</p>' },
  { id: '2', is_pinned: false, note_type: 'canvas', background_color: '#fefce8', content: '' },
  { id: '3', is_pinned: false, note_type: 'document', background_color: null, content: '<img src="x"><ul data-type="taskList"><li data-type="taskItem"></li></ul>' },
]

test('splitPinned separates pinned from the rest preserving order', () => {
  const { pinned, others } = splitPinned(notes)
  assert.deepEqual(pinned.map(n => n.id), ['1'])
  assert.deepEqual(others.map(n => n.id), ['2', '3'])
})

test('applyClientFilters by type, color, image and checklist', () => {
  assert.deepEqual(applyClientFilters(notes, { type: 'canvas' }).map(n => n.id), ['2'])
  assert.deepEqual(applyClientFilters(notes, { color: '#fefce8' }).map(n => n.id), ['2'])
  assert.deepEqual(applyClientFilters(notes, { hasImage: true }).map(n => n.id), ['3'])
  assert.deepEqual(applyClientFilters(notes, { hasChecklist: true }).map(n => n.id), ['3'])
  assert.equal(applyClientFilters(notes, {}).length, 3)
})
```

`lib/__tests__/quick-note-content.test.js`
```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildQuickNoteContent } from '../quickNoteContent.js'

test('text note: title paragraph then body paragraphs, html escaped', () => {
  const { title, content } = buildQuickNoteContent({ mode: 'text', title: 'A <b>', body: 'l1\nl2' })
  assert.equal(title, 'A <b>')
  assert.equal(content, '<p>A &lt;b&gt;</p><p>l1</p><p>l2</p>')
})

test('checklist note: task list items with checked state', () => {
  const { content } = buildQuickNoteContent({
    mode: 'checklist', title: 'Compras',
    items: [{ text: 'Leche', checked: false }, { text: 'Pan', checked: true }, { text: '  ', checked: false }],
  })
  assert.match(content, /^<p>Compras<\/p><ul data-type="taskList">/)
  assert.match(content, /data-checked="true"/)
  assert.equal((content.match(/data-type="taskItem"/g) ?? []).length, 2)
})

test('empty composer yields null so nothing is created', () => {
  assert.equal(buildQuickNoteContent({ mode: 'text', title: ' ', body: '' }), null)
  assert.equal(buildQuickNoteContent({ mode: 'checklist', title: '', items: [{ text: '', checked: false }] }), null)
})

test('body without title uses the first body line as the title', () => {
  const { title, content } = buildQuickNoteContent({ mode: 'text', title: '', body: 'Recordar\nllamar' })
  assert.equal(title, 'Recordar')
  assert.equal(content, '<p>Recordar</p><p>llamar</p>')
})
```

- [ ] **Step 2: Run, expect FAIL** (`node --test "apps/desktop/src/modules/runly.notes/lib/__tests__/note-preview.test.js"` etc.: modules missing).

- [ ] **Step 3: Implement.**

`lib/notePreview.js`
```js
// Card preview derived from the list row's HTML snapshot (notes.content). The
// editor's Y.js document is the live source of truth; this is display only.
const MAX_ITEMS = 5
const EXCERPT_MAX = 240

const decode = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

const strip = (html) => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()

export function extractPreview(html, title = '') {
  if (!html || typeof html !== 'string') return { excerpt: '', checklist: null, firstImage: null }

  const items = []
  const itemRe = /<li[^>]*data-type="taskItem"[^>]*>([\s\S]*?)<\/li>/gi
  let m
  while ((m = itemRe.exec(html)) !== null) {
    const tag = m[0].slice(0, m[0].indexOf('>') + 1)
    items.push({ checked: /data-checked="true"/.test(tag), text: strip(m[1]) })
  }
  const checklist = items.length
    ? { items: items.slice(0, MAX_ITEMS), total: items.length, done: items.filter(i => i.checked).length }
    : null

  const img = /<img[^>]*\ssrc="([^"]+)"/i.exec(html)

  const withoutLists = html.replace(/<ul[^>]*data-type="taskList"[\s\S]*?<\/ul>/gi, ' ')
  const spaced = withoutLists.replace(/<\/(p|div|h[1-6]|li)>|<br\s*\/?>/gi, ' ')
  let text = strip(spaced)
  const t = (title || '').trim()
  if (t && text.startsWith(t)) text = text.slice(t.length).trim()

  return { excerpt: text.slice(0, EXCERPT_MAX), checklist, firstImage: img ? img[1] : null }
}
```

`lib/notesView.js`
```js
import { extractPreview } from './notePreview.js'

export function splitPinned(notes) {
  const pinned = []
  const others = []
  for (const n of notes) (n.is_pinned ? pinned : others).push(n)
  return { pinned, others }
}

// type: 'document' | 'canvas'; color: stored background hex; hasImage / hasChecklist: booleans.
export function applyClientFilters(notes, { type, color, hasImage, hasChecklist } = {}) {
  return notes.filter((n) => {
    if (type && n.note_type !== type) return false
    if (color && n.background_color !== color) return false
    if (hasImage || hasChecklist) {
      const p = extractPreview(n.content, n.title)
      if (hasImage && !p.firstImage) return false
      if (hasChecklist && !p.checklist) return false
    }
    return true
  })
}
```

`lib/quickNoteContent.js`
```js
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The note title is the first paragraph (see NoteEditor handleUpdate), so the
// composer emits it as the first <p>. Returns null when there is nothing to save.
export function buildQuickNoteContent({ mode, title = '', body = '', items = [] }) {
  const t = title.trim()
  if (mode === 'checklist') {
    const rows = items.filter(i => i.text.trim())
    if (!t && rows.length === 0) return null
    const lis = rows.map(i =>
      `<li data-checked="${i.checked ? 'true' : 'false'}" data-type="taskItem"><label><input type="checkbox"${i.checked ? ' checked' : ''}><span></span></label><div><p>${esc(i.text.trim())}</p></div></li>`,
    ).join('')
    const resolvedTitle = t || rows[0].text.trim()
    return { title: resolvedTitle, content: `<p>${esc(resolvedTitle)}</p><ul data-type="taskList">${lis}</ul>` }
  }
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean)
  if (!t && lines.length === 0) return null
  if (!t) {
    const [first, ...rest] = lines
    return { title: first, content: `<p>${esc(first)}</p>${rest.map(l => `<p>${esc(l)}</p>`).join('')}` }
  }
  return { title: t, content: `<p>${esc(t)}</p>${lines.map(l => `<p>${esc(l)}</p>`).join('')}` }
}
```
Note: in the checklist case without a title the first item becomes the title and is also kept as the first item (acceptable and intended).

- [ ] **Step 4: Run the three tests, expect all pass.**
- [ ] **Step 5: Commit** `feat(notes): pure helpers for card previews, grid filters and quick-note content`.

---

### Task 2: Grid components

**Files:**
- Create: `home/NoteGridCard.jsx`, `home/NotesMasonry.jsx`, `home/NotesFilters.jsx`
- Modify: `hooks/useNote.js` (add `useToggleNoteFlag`)

- [ ] **Step 1: `useToggleNoteFlag`** in `hooks/useNote.js` (read the file first and match its `useToken` / mutation style): `mutate({ noteId, patch })` where `patch` is `{ isPinned }`, `{ isArchived }` or `{ backgroundColor }`; optimistic via `patchNoteInCache(queryClient, noteId, patch)` before the request, `runly.notes.update(noteId, patch, token)`, `onError` invalidates `['notes']`, `onSuccess` invalidates `['notes']`.

- [ ] **Step 2: `home/NoteGridCard.jsx`.** Props: `note`, `selected` (multi-select), `selectMode`, `isDark`, `onOpen(note)`, `onToggleSelect(note)`, `onPin(note)`, `onArchive(note)`, `onTrash(note)`, `onColor(note, hex|null)`, `readOnly` (trash/archive/shared no actions as appropriate). Behavior: `extractPreview(note.content, note.title)` memoized; background = `isDark ? DARK_BG_MAP[note.background_color] ?? note.background_color : note.background_color` else `bg-card`; `border border-border rounded-md`; first image shown as top thumbnail (`loading="lazy"`, `object-cover`, max h 160); title (font-medium, 2 lines clamp, `NoteIcon` when `note.icon`; canvas notes show the `Shapes` icon); checklist rows (max 5, a visual checkbox square that is non-interactive, checked rows line-through muted) plus "+N más" when `total > 5` and `done/total` counter; otherwise excerpt (6 lines clamp); tag chips (max 3 + "+N"); pin indicator (`Pin` icon filled) top-right; shared indicator when `!note.is_owner`/shared (use whatever the list row exposes, e.g. `my_share_permission`). Actions: a `DropdownMenu` (three-dots, visible on hover and always visible on coarse pointers) with Fijar/Desfijar, Archivar/Desarchivar, color row using `NOTE_BACKGROUND_COLORS` swatches, Mover a papelera. Click opens (or toggles selection in `selectMode`); long-press (500 ms, cancelled by move > 8px, ignore `pointerType === 'mouse'`) enters select mode via `onToggleSelect`. Selected state: flat fill + 2px solid `border-foreground/60`, no ring/glow. Min touch target 44px for the menu trigger and all buttons. All text Spanish.

- [ ] **Step 3: `home/NotesMasonry.jsx`.** CSS-columns masonry: wrapper `columns-1 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5 gap-3` and each child wrapped in `mb-3 break-inside-avoid`. Props: `notes`, `renderCard(note)`. Section label component `SectionLabel` ("Fijadas", "Otras") exported from the same file.

- [ ] **Step 4: `home/NotesFilters.jsx`.** A horizontally scrollable row of filter chips: Todas, Documentos, Lienzos, Con imagen, Checklists, and a color popover (swatches from `NOTE_BACKGROUND_COLORS`). Props: `value` (`{ type, color, hasImage, hasChecklist }`), `onChange(next)`. Active chip = flat filled (`bg-foreground text-background`), inactive = `bg-muted`. Built with `@runly/ui` `Popover` for colors.

- [ ] **Step 5: Verify** `pnpm lint`, `pnpm --filter @runly/desktop build:web`. **Commit** `feat(notes): grid card, masonry layout and filter chips`.

---

### Task 3: Quick composer

**Files:**
- Create: `home/QuickComposer.jsx`

- [ ] **Step 1:** Props `{ onCreated(note), onCreateCanvas(), disabled }`. Uses `useCreateNote()` from `hooks/useNotes.js`. Collapsed state: a single card-like bar (`rounded-md border bg-card shadow-sm`) reading "Escribe una nota..." with three icon buttons on the right: checklist (`ListChecks`), dibujo (`PenLine`, calls `onCreateCanvas`), and the bar itself expands on click/focus. Expanded: optional title input (placeholder "Titulo"), then either a `Textarea` (autosizing, placeholder "Escribe una nota...") or the checklist editor (rows with checkbox + text input, Enter adds a row, Backspace on an empty row removes it, "+ Elemento" button). Footer: mode toggle (Texto/Checklist), color picker button (swatch popover from `NOTE_BACKGROUND_COLORS`), pin toggle, and "Cerrar" button. Closing (button, Escape, or click outside) calls `buildQuickNoteContent`; if it returns a value, create with `{ title, content, backgroundColor, noteType: 'document' }` and, when pinned, follow with an update `{ isPinned: true }` via `runly.notes.update` in the mutation's `onSuccess`; then reset the composer and call `onCreated(res.note)` (the parent does NOT open the note; it only refreshes). If it returns null just collapse. Keyboard: Ctrl+Enter saves and closes. Disabled while `createNote.isPending`. On touch use `inputMode`/`enterKeyHint` sensibly; spellcheck/autocorrect off on the textarea (pen handwriting friendly). Use `@runly/ui` `Textarea`/`Input`/`Checkbox`/`Popover`; no native controls.

- [ ] **Step 2: Verify** `pnpm lint`, `pnpm --filter @runly/desktop build:web`. **Commit** `feat(notes): quick composer with text, checklist and drawing entry points`.

---

### Task 4: NotesHome, selection bar, layout switch and sheet

**Files:**
- Create: `home/NotesHome.jsx`, `home/NotesSelectionBar.jsx`, `home/NoteSheet.jsx` (if the name clashes with the existing `components/NoteSheet.jsx`, use `home/NoteEditorOverlay.jsx`)
- Create: `hooks/useNotesLayout.js`
- Modify: `NotesScreen.jsx`

- [ ] **Step 1: `hooks/useNotesLayout.js`**: `useNotesLayout()` returns `[layout, setLayout]`, `layout` in `'home' | 'split'`, default `'home'`, persisted under localStorage key `runly:v1:notes-layout` with try/catch (see `getListCollapsed` in `NotesScreen.jsx` for the pattern).

- [ ] **Step 2: `home/NotesHome.jsx`.** Props: `notes`, `isLoading`, `view` (`all|recent|shared|trash|archive`), `search`, `onSearchChange`, `onOpen(note)`, `onCreateCanvas`, `onCreated`, `onTrash(note)`, `onToggleLayout`, `isDark`. Renders: `PageHeader` (title by view; actions: layout toggle button "Vista de dos paneles", and for `all` a "Nuevo lienzo" button); `SearchInput` always visible (search matches server-side via the existing `q` param); `QuickComposer` only for `all` and folder views; `NotesFilters`; `splitPinned` sections with `NotesMasonry` and `NoteGridCard` (pinned section only when it has items; for `trash`/`archive` no pinned split); `EmptyState` per view (never plain text); loading skeleton of 6 pulsing cards (never a spinner-only state); multi-select state (`Set` of ids) with `NotesSelectionBar` fixed at the top of the grid while non-empty.

- [ ] **Step 3: `home/NotesSelectionBar.jsx`.** Props `count`, `onClear`, `onPin`, `onArchive`, `onTrash`, `onColor(hex|null)`. Bulk actions call the parent handlers once per selected id (use `Promise.all` of `useToggleNoteFlag().mutateAsync`; trash goes through the existing `ConfirmDialog` flow in `NotesScreen` with a bulk description "Se enviaran N notas a la papelera" for owned notes; leaving shared notes uses the existing `leaveNote`). Labels in Spanish ("N seleccionadas", "Fijar", "Archivar", "Color", "Papelera", "Cancelar").

- [ ] **Step 4: Editor overlay.** `NotesScreen.jsx` currently renders Panel 1 (list) and Panel 2 (editor). In `layout === 'home'`: Panel 1 renders `NotesHome` taking `flex-1`; Panel 2 renders only when `selectedNote` exists, as an overlay: `fixed inset-0 z-40 bg-background lg:bg-black/40 lg:p-6 flex` containing the existing Panel 2 content in a `flex-1 min-w-0 flex flex-col bg-background lg:rounded-md lg:max-w-4xl lg:mx-auto lg:shadow-xl overflow-hidden`; clicking the dark backdrop on `lg` or the header back button calls `clearSelection` (set `selectedNote` null and `setNoteParam(null)`; reuse `clearIfSelected` logic) so the grid is visible again. Zen/fullscreen mode keeps its existing `fixed inset-x-0 top-0 h-dvh z-50` behavior. The existing header buttons (Compartir, Ajustes, modo vista) stay as they are. In `layout === 'split'` nothing changes. Extract the Panel 2 JSX into `components/NoteEditorPanel.jsx` (props: everything it reads today) so `NotesScreen.jsx` stays well under 700 lines and both layouts reuse it. Keep `urlNoteId` deep links working: a URL with `?note=` opens the overlay in home layout.

- [ ] **Step 5: Query params.** In `buildQueryParams` add `archive: { archived: true }`; make `viewFromPath` return `'archive'` for `/notes/archive`; `VIEW_LABELS.archive = 'Archivo'`. In `home` layout `recent` shows `pageSize: 20` as before. Default `all` page size: pass `pageSize: 60` for the grid (API caps at 100); add a "Cargar más" button at the end of the grid when the response length equals `pageSize` (increase `pageSize` by 60, max 100 then use `page` param incrementally if `useNotes` supports it; if not, cap at 100 and note it as a known limit in the results file).

- [ ] **Step 6: Verify** `pnpm lint`, `node --test "apps/desktop/src/modules/runly.notes/lib/__tests__/*.test.js"`, `pnpm --filter @runly/desktop build:web`. **Commit** `feat(notes): quick-notes home with grid, selection bar and editor overlay`.

---

### Task 5: Archive route, navigation and sidebar

**Files:**
- Modify: `apps/desktop/src/app/module-screen-resolver.js` (the `runly.notes` block near line 235), `apps/desktop/src/app/ModuleOutlet.jsx` (screen map entries for `runly.notes:*`), `apps/api/src/manifests/official/core-modules.js` (notes navigation), `components/NotesSidebar.jsx`, `components/NotesSidebarSlot.jsx`, `apps/desktop/src/lib/commandPalette.js` / `apps/desktop/src/components/CommandPalette.jsx` only if they enumerate notes sub-routes
- Test: any existing resolver/manifest test that lists the notes routes (grep `notes/trash` in tests)

- [ ] **Step 1:** Grep for `notes/trash` and `runly.notes:/notes/trash` across `apps/` and `docs/` to find every place a notes sub-route is enumerated; add `/notes/archive` ("Archivo", icon `Archive`) next to trash everywhere it is enumerated, in the same order (Todas, Recientes, Compartidas, Archivo, Papelera).
- [ ] **Step 2:** `NotesSidebar.jsx` `NAV_ITEMS`: add `{ id: 'archive', label: 'Archivo', Icon: Archive }` before trash; make sure the nav click navigates to `/notes/archive` using the same mechanism the other items use.
- [ ] **Step 3:** API manifest: add the navigation entry and, if the permission catalog needs no new key (archiving reuses `notes.notes.update`), change nothing else. Run `node --test "apps/api/src/services/__tests__/rbac-granular-contract.test.js"` and any manifest tests; note pre-existing failures.
- [ ] **Step 4: Verify** lint, build, relevant node tests. **Commit** `feat(notes): archive view and navigation`.

---

### Task 6: Docs and evidence

**Files:** Modify `docs/TASKS.md`; create `docs/superpowers/plans/2026-10-24-notes-quick-home-results.md`.

- [ ] Run: `node --test "apps/desktop/src/modules/runly.notes/lib/__tests__/*.test.js"`, `node --test "apps/api/src/routes/notes/__tests__/*.test.js"`, `pnpm lint`, `pnpm --filter @runly/desktop build:web`; record exact counts.
- [ ] Results file: list the spec deviations stated at the top, the known limits (page size cap, no checklist toggle on cards), and a manual QA checklist (390px phone, 1024px tablet, 1440px desktop, light/dark, S Pen in the composer textarea, create text/checklist/drawing from the composer, pin/archive/color/trash from card menu and multi-select, deep link `?note=`, split layout toggle persists). Leave manual items unchecked.
- [ ] `docs/TASKS.md`: add an unchecked entry under the notes section referencing spec, plan and results; `Verified:` only for what was actually run.
- [ ] Update `docs/ai-context/mirai-module-capabilities.md` only if a notes capability changes (it should not in this phase). **Commit** `docs(notes): quick home results and QA checklist`.
