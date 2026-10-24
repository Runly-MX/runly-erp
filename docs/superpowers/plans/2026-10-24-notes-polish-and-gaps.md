# Notes Polish and Gaps Implementation Plan (Phase 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gaps left by phases 1-4 of the notes redesign: real pagination in the grid, photo in the quick composer, per-note spellcheck toggle, sub-page cascades for sharing and archiving, safe Escape to close the overlay, MirAI/docs alignment and a UI audit pass.

**Architecture:** Small, independent changes on the existing notes module; pure logic gets node tests, SQL changes stay company-scoped and use `prisma.$queryRaw`. The migration `20261117000000_notes_references_and_subpages` is already applied (the `parent_note_id` column and `note_references` table exist).

**Tech Stack:** React, TanStack Query (`useInfiniteQuery`), TipTap 3, Hono + `$queryRaw`, node:test.

Spec: `docs/superpowers/specs/2026-10-24-notes-quick-notes-redesign-design.md` (sections 5.2, 5.3b, 5.5). Previous results files in `docs/superpowers/plans/2026-10-24-notes-*-results.md` list the known limits being closed here.

Dropped on purpose (record in results): drag-to-reorder pinned cards; toggling checklist items from a card (the Y.js document is the source of truth).

Conventions: JavaScript only, Spanish UI text, English code/comments, no emojis, `@runly/ui` first, flat selected states, controls `rounded-md` max, files under 1000 lines. Tests with `node --test "<glob>"` (Node 22). Commit each task right away staging only your files (unrelated uncommitted changes exist in `docs/developers/*` and `packages/module-compiler/src/developer-docs.json`), branch `main`, commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never start/stop dev servers, never run migrations, never print secrets. Phase 1 invariants: never add volatile values (token, profile) to the `extensions` memo deps of `NoteEditor.jsx`; pass editor-side callbacks through ref-backed getters.

Frontend base: `apps/desktop/src/modules/runly.notes/`. API base: `apps/api/src/routes/notes/`.

---

### Task 1: Real pagination in the grid

**Files:** Modify `hooks/useNotes.js` (add `useInfiniteNotes(params)`), `home/NotesHome.jsx`, `NotesScreen.jsx`; add `lib/__tests__/notes-pages.test.js` for a pure `flattenPages`/`hasMore` helper in `lib/notesPages.js`.

- [ ] Pure helper `lib/notesPages.js`: `flattenPages(pages)` returns the concatenated `notes` arrays de-duplicated by `id`; `hasMore(lastPage, pageSize)` returns `lastPage.notes.length === pageSize`. Test both (de-dup across pages, exact-size boundary, empty last page).
- [ ] `useInfiniteNotes(params)`: `useInfiniteQuery` with key `['notes', 'infinite', params]` (must stay under the `['notes']` prefix so existing `invalidateQueries({ queryKey: ['notes'] })` and `patchNoteInCache` keep working: update `patchNoteInCache` in `lib/noteCache.js` to also patch `data.pages[].notes` for infinite entries, with a test in the existing cache test file or a new one), `pageSize: 60`, `getNextPageParam` using `hasMore`.
- [ ] `NotesHome` uses it for the grid (pass `fetchNextPage`, `hasNextPage`, `isFetchingNextPage`); "Cargar mas" button replaces the size-bump logic and keeps going until no more pages; remove the 100-note cap note. The split layout list keeps `useNotes`.
- [ ] Verify tests, lint, build. **Commit** `feat(notes): paginate the quick-notes grid`.

---

### Task 2: Photo in the quick composer

**Files:** Modify `home/QuickComposer.jsx`, `lib/quickNoteContent.js` (+ its test), `lib/noteImageUpload.js` (reuse; extract a function that uploads a `File` and returns the public URL if only an editor-bound helper exists), `__tests__` as needed.

- [ ] Read `lib/noteImageUpload.js` and the `POST /notes/presign-image` route (`index.js` ~line 161) to learn how an upload is authorized (it may require an existing `noteId`). If it needs a note id, create the note first when the user adds a photo (silent draft creation on first photo) and then upload against it; keep the same note for the final save instead of creating a second one (update content on close).
- [ ] Add an image button (`ImagePlus`) to the expanded composer that opens `ImageSourceSheet` from `@runly/ui` (camera vs gallery, same as `NoteToolbar.jsx`), shows thumbnails of attached photos with a remove button, and on save appends `<img src="URL">` paragraphs after the body/checklist via `buildQuickNoteContent({ ..., images })` (add `images: string[]`, escape the URLs; test: images appended after content, empty composer with only images is valid, title falls back to "Nota con foto").
- [ ] Respect the existing image variant/aspect-ratio conventions (see how the editor inserts images: `aspectRatio` attribute, `lqip` preset) as far as plain HTML allows; do not block on exact parity.
- [ ] Verify tests, lint, build. **Commit** `feat(notes): attach photos from the quick composer`.

---

### Task 3: Per-note spellcheck toggle

**Files:** Create `hooks/useNoteSpellcheck.js`, `lib/__tests__/note-spellcheck.test.js` (pure resolver in `lib/spellcheckPref.js`); modify `components/NoteSettingsPanel.jsx`, `components/NoteEditor.jsx` (apply attribute via an effect, not via memo deps).

- [ ] `resolveSpellcheck(stored, isCoarse)`: `stored` is `true | false | undefined`; returns `stored` when defined, else `!isCoarse` (touch devices default off, desktop default on). Test the three cases.
- [ ] `useNoteSpellcheck(noteId)` stores per note per viewer in localStorage `runly:v1:notes-spellcheck:<noteId>` (try/catch) and returns `[enabled, setEnabled]` using `useCoarsePointer()` from `@runly/ui` for the default.
- [ ] In `NoteEditorSurface`, an effect sets `editor.view.dom.setAttribute('spellcheck', String(enabled))` and `autocorrect` (`on`/`off`) whenever the value changes; the initial `editorProps.attributes` keep today's defaults. Add a `Checkbox`/switch "Correccion ortografica" in `NoteSettingsPanel.jsx` (communicate through a small event or shared hook state; both read the same `useNoteSpellcheck` store: make the hook subscribe to a `storage`-like in-memory emitter so the panel and editor stay in sync in the same tab).
- [ ] Verify tests, lint, build. **Commit** `feat(notes): per-note spellcheck toggle`.

---

### Task 4: Sub-page cascades (share and archive)

**Files:** Modify `shares-service.js`, `notes-service.js` (`updateNote` archive path), `__tests__/` (pure parts), `apps/desktop/.../NoteShareModal.jsx` (info line).

- [ ] Read `shares-service.js` and the `note_shares` columns first. When a share is created or its permission updated on a note, apply the same grant to all non-deleted descendants (recursive CTE, `ON CONFLICT` upsert on the table's unique key, same company scope); when a share is removed, remove that user's share from descendants too. Do not touch descendants the actor cannot administer (the actor must already be owner/admin of the parent; descendants share the owner in practice, but filter by `owner_user_id = parent.owner_user_id` to be safe). Keep it one SQL statement per operation in a transaction.
- [ ] Archive: in `updateNote`, when `isArchived` changes, cascade the same value to descendants (recursive CTE, owner-only descendants), mirroring the trash cascade (restoring from archive only un-archives descendants archived together: use a shared `archived_at`-free approach: compare `updated_at` is unreliable, so add the cascade only for archiving and, for un-archiving, un-archive all descendants that are archived (document this simplification)).
- [ ] `NoteShareModal.jsx`: when the note has `child_count > 0` show a muted line "Las subpaginas heredan este acceso." 
- [ ] Verify API tests (existing 57 + any new pure tests), lint. **Commit** `feat(notes): share and archive cascade to sub-pages`.

---

### Task 5: Safe Escape closes the overlay

**Files:** Modify `NotesScreen.jsx` (or `components/NoteEditorPanel.jsx`), add `lib/overlayEscape.js` + test.

- [ ] Pure `shouldCloseOverlayOnEscape({ defaultPrevented, hasOpenDialog, zenMode, key })`: true only when `key === 'Escape'`, not `defaultPrevented`, no other dialog open and not in zen mode (zen has its own Escape). Test the matrix.
- [ ] In home layout while a note is open, a `keydown` listener (document, capture false) computes `hasOpenDialog` as `Boolean(document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'))` excluding nothing else, and closes the overlay (same `clearSelection` as the back button). Verify the selectors against how `@runly/ui` Dialog/Sheet/Popover render (read the components) and adjust.
- [ ] **Commit** `feat(notes): close the editor overlay with Escape when no dialog is open`.

---

### Task 6: MirAI capabilities and docs alignment

**Files:** `apps/api/src/routes/notes/mirai-capabilities.js`, `mirai-actions.js`, `notes-mirai-queries.js` (read), `docs/ai-context/mirai-module-capabilities.md`, `docs/ai-context/rme3-runtime-capabilities.md`.

- [ ] Read the notes MirAI capability files. If the capability description or tool list enumerates what notes support, add archive/sub-page/reference awareness only where it is purely descriptive text (e.g. the notes read tool should not return sub-pages as separate top-level hits without saying so). Do not add new write actions. Make sure MirAI queries still behave with `parent_note_id` (they use their own SQL; confirm and note it). Update the two docs files accordingly (notes extensions: `pageBreak`, `tableOfContents`, `entityReference`; module capability text).
- [ ] Run the notes API and MirAI tests (`node --test "apps/api/src/routes/notes/__tests__/*.test.js"`). **Commit** `docs(notes): align MirAI capability text and runtime docs with the redesign`.

---

### Task 7: UI audit pass

**Files:** the new screens/components: `home/*`, `components/NoteEditorPanel.jsx`, `components/OutlinePanel.jsx`, `components/EntityReferencePicker.jsx`, `components/SubpagesStrip.jsx`, `components/NoteBreadcrumb.jsx`, `components/SaveStatusBadge.jsx`.

- [ ] Read `docs/ai-context/ui-screen-audit-checklist.md` and audit each listed component against the 14 aspects (empty/loading/error states via `EmptyState`/`ErrorState`, never plain text; Spanish copy; aria labels on icon buttons; focus order and visible focus; 44px touch targets on coarse pointers; dark mode contrast; 390px/1024px/1440px layouts by reading the classes; modals with fixed header/footer and scrolling body; `PageHeader` on screens; no native dialogs or controls). Fix every finding that is a clear violation with minimal edits. Also check that every query in the new home/overlay has an error state (`ErrorState` with a retry) and that mutation failures show a toast (`sonner` is the shared toaster; follow how other notes code reports errors).
- [ ] Write the findings and fixes in the results file under a "UI audit" heading (table: component, finding, fixed yes/no).
- [ ] Verify lint, build, all notes tests. **Commit** `fix(notes): UI audit pass for the redesign screens`.

---

### Task 8: Results and TASKS

**Files:** `docs/superpowers/plans/2026-10-24-notes-polish-and-gaps-results.md`, `docs/TASKS.md`.

- [ ] Run `node --test "apps/desktop/src/modules/runly.notes/lib/__tests__/*.test.js"`, `node --test "apps/api/src/routes/notes/__tests__/*.test.js"`, `pnpm lint`, `pnpm --filter @runly/desktop build:web`; record exact counts. Results file: shipped items, dropped items, remaining known limits, manual QA checklist (unchecked): grid beyond 60 notes, photo from camera and gallery on phone, spellcheck toggle persists and defaults by device, sharing a parent shares children and unsharing removes, archive cascades, Escape behavior with and without dialogs, audit fixes at 390px. `docs/TASKS.md` unchecked entry with `Verified:` only for what was actually run. **Commit** `docs(notes): polish and gaps results`.
