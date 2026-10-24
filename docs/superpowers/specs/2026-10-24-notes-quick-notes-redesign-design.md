# runly.notes — Quick-notes redesign, pen stability and entity references

Date: 2026-10-24
Status: Draft (awaiting approval)
Spec file: docs/superpowers/specs/2026-10-24-notes-quick-notes-redesign-design.md

Process note: per the standing instruction to decide autonomously on roadmap work, this spec was written directly from a code review instead of interactive Q&A. Open decisions are stated with a recommendation.

## 1. Problem

The module is a split-pane "document" app (list + TipTap/Y.js editor, Notion-like). It lacks what makes Keep / Samsung Notes / OneNote feel fast:

1. No quick capture: creating a note means picking a mode and entering a full editor. No visual overview (the list is text-only: icon, title, 100-char excerpt).
2. Pen input on Galaxy Tab is unreliable: text written with the S Pen (Samsung keyboard handwriting-to-text) gets corrected, replaced or erased by itself.
3. Notes cannot point at other Runly records (contacts, files, ledger accounts, employees), unlike chat.
4. The UI does not read as a notes app: amber list rows, small text, desktop-first density.

## 2. Goals

1. Pen/IME input never loses or rewrites text while composing.
2. Open the module and capture a note in one tap (text, checklist, photo, pen sketch).
3. Keep-style visual overview: card grid with color, pin, checklist and image previews, labels, folders.
4. Notion-class editor retained for long notes (no regression to tables, images, canvas, sharing, collab, public links, MirAI, quick-notes floating widget).
5. Entity references in notes, reusing the chat registry.
6. Touch/tablet first: 44px targets, bottom sheets, palm rejection, keyboard-safe layout.

## 3. Non-goals

- New note types beyond document and canvas (checklist is a document with a task list, not a new type).
- Reminders/notifications (follow-up; needs calendar integration).
- OCR / handwriting recognition of ink (Samsung's own keyboard does text conversion).
- Rewriting the Y.js sync layer, canvas editor or sharing model.
- Schema churn: `is_pinned`, `is_archived`, `background_color`, folders, tags already exist.

## 4. Findings from code review

- `NoteEditor` builds its extensions with a `useMemo` whose deps include `session.user.email`, `userProfile.avatarUrl/displayName`, `note.id`, `token`, `ydoc`, `provider`. Any late profile load or token change rebuilds the extension list; if the editor is re-created mid-input, an active IME/handwriting composition is destroyed. Strongest suspect for the pen bug.
- `NotesScreen` replaces `selectedNote` with server data after every mutation (`liveNoteData` effect), re-rendering the editor tree while the user is writing.
- Y.js (y-prosemirror) re-renders the affected ProseMirror range on remote/own-echo updates and when persisted state loads late; during an Android composition this replaces the composing text node. `TrailingNode` and `Placeholder` also add decorations/transactions on every change.
- Samsung handwriting-to-text inserts through composition events (`compositionstart/update/end`, `beforeinput` with `insertCompositionText`) and is sensitive to spellcheck/autocorrect and DOM replacement of the active text node.
- These are hypotheses: the first deliverable of the plan is a reproduction harness with logging that confirms the cause before fixing it.
- Entity references: chat already has `chat-entity-references-service.js` (server registry: Contact, FileAsset, LedgerAccount, HrEmployee, permission-checked `getById`) and `runly.chat/lib/entityReferenceTypes.js` (client icons/routes). Reusable.
- Existing doc-note structure to keep: `notes` table (`is_pinned`, `is_archived`, `background_color`, `folder_id`), `note_tags`, `note_folders`, Y.js persistence, `/:id/canvas`, shares, public slug.

## 5. Design

### 5.1 Phase 1 — Pen and IME stability (ship first, independently)

1. Reproduction harness: dev-only `?notesDebug=1` overlay logging composition events, editor create/destroy, `setContent`/Y.js applied updates and extension rebuilds with timestamps. Confirm the culprit on the real tablet before fixing.
2. Stable editor identity: extensions must not depend on volatile profile fields. Pass user info through a ref read lazily by the collaboration caret user (`provider.awareness.setLocalStateField('user', ...)` updated imperatively), so the editor is created once per `note.id`.
3. Composition guard: a small TipTap extension that tracks `view.composing` and (a) defers autosave state syncing, (b) buffers remote Y.js updates by applying them on `compositionend` (inbound only, outbound persists as usual), (c) skips `TrailingNode`/placeholder-driven transactions while composing.
4. Stop `NotesScreen` from swapping `selectedNote` into the editor on every mutation; the editor keeps its own state, the list reads from the query cache.
5. Editor attributes for pen: `spellcheck=false`, `autocorrect=off`, `autocapitalize=sentences` configurable per note ("Corrección ortográfica" toggle, off by default on touch devices).
6. Pen mode, native ink: `DrawingBlock`/canvas already exist; add pointer-type handling (`pointerType === 'pen'` draws, `touch` scrolls/pans = palm rejection, `touch-action` per surface) and a "Escribir a mano" button in the quick composer that inserts an ink block.
7. Regression test: Node test for the composition buffer logic (pure module) plus a fixture script like `scripts/fixtures/notes-inflight-save.mjs` simulating composition + remote update.

### 5.2 Phase 2 — Quick-notes home (Keep-style)

- New default view `/notes`: responsive masonry grid (1/2/3/4+ columns) of `NoteGridCard`: background color, title, 6-line excerpt or checklist preview (first 5 items with checkboxes, tappable without opening), first image thumbnail, tag chips, pin indicator, reference chips, shared avatar stack.
- Sections: "Fijadas" then "Otras"; list/grid toggle persisted in localStorage.
- Quick composer pinned at the top: collapsed shows "Escribe una nota..." plus icons (checklist, pen, photo). On focus expands inline (title, body, checklist mode, color, pin, label, image, reference) and saves on blur/close. Uses the same TipTap content so every quick note is a normal note.
- Tapping a card opens the editor as a full sheet/dialog over the grid on tablet and desktop (Keep behavior), and full screen on phone. The current split-pane remains available as "Vista de dos paneles" (existing `notes-side-by-side-layout`), so no feature is lost.
- Sidebar: Notas, Recordatorios hidden (non-goal), Archivo, Papelera, Compartidas, Recientes, then Carpetas and Etiquetas. On tablet it is a collapsible rail; on phone a bottom sheet. Add the missing "Archivo" view backed by `is_archived` and a swipe/menu action.
- Multi-select mode (long-press) for pin, color, label, archive, trash, move to folder.
- Search always visible, searches title and `content_text`, with tag/color/type/has-image filters.
- Visual language: follow the Runly identity (rounded-md controls, flat selected fill, no ring/glow). Remove the amber-everywhere selected row; use note background color as the card identity. Sizes for touch (44px). All text Spanish, `@runly/ui` primitives only (`Dialog`, `Sheet`, `DropdownMenu`, `EmptyState`, `PageHeader`).

### 5.3 Phase 3 — Editor refresh for touch

- Bottom formatting bar that rides above the keyboard on touch (visualViewport aware), with the same commands as today's toolbar; floating bubble menu on selection on desktop.
- Larger default type on tablet, optional zoom retained.
- Checklist as a first-class slash command and quick-composer mode with "move checked to bottom".
- Autosave state indicator ("Guardado", "Guardando...", "Sin conexión") in the header.

### 5.4 Phase 4 — Entity references in notes

- New TipTap node `entityReference` (inline atom, rendered as a chip with icon + title) inserted via `@` mention picker or a "Vincular registro" button, using the chat registry types. Stored in the doc as `{ entityType, recordId, title, url }` snapshot (same tradeoff as chat: title can go stale, link is live).
- Add a `note_references` table (note_id, entity_type, record_id, title snapshot, created_at) maintained on save, so a record's page can later list "Notas vinculadas" and a card can show reference chips without parsing the Y.js doc. Forward migration only.
- Server side: extract the chat registry's resolve/permission logic into a shared `lib/entity-references` module used by chat and notes (chat tests must keep passing); notes validates read permission of the target when a reference is added, and a viewer without access sees the chip as "Registro no disponible" without leaking title.
- Public notes and shares: references render as plain text for public links (never a link into internal records), consistent with the chat `external_support` rule.
- Register more entity types later by adding registry entries only.

### 5.5 Phase 5 — Polish

- Archive view, multi-select, drag to reorder pinned cards (optional), empty states, skeleton loading, accessibility pass using `ui-screen-audit-checklist.md`, MirAI capability for "crear nota rápida" and "buscar notas" kept working.
- Update `docs/ai-context/mirai-module-capabilities.md`, `docs/TASKS.md`, `docs/ai-context/rme3-runtime-capabilities.md` if a new `@runly/ui` component is extracted (the masonry grid and color picker are good candidates).

## 6. Approaches considered

| Option | Summary | Verdict |
|---|---|---|
| A. Evolve in place | Keep split-pane, restyle, add composer and grid inside the left pane | Cheap but keeps the "document app" feel |
| B. Keep home + document editor (chosen) | Grid home with quick composer, editor opens as sheet; split-pane kept as an option | Matches Keep/Samsung feel, reuses editor and data model |
| C. Rewrite on a new editor (e.g. plain textarea for quick notes) | Separate quick-note type | Fragments data, loses sharing/search/MirAI parity; rejected |

Recommendation: B. Pen fix first because it is independent and the biggest daily pain.

## 7. Files expected to change or be added

- Frontend (`apps/desktop/src/modules/runly.notes/`): `NotesScreen.jsx` (split: it is 523 lines and will be decomposed), new `home/NotesHome.jsx`, `home/NoteGridCard.jsx`, `home/QuickComposer.jsx`, `home/NotesMasonry.jsx`, `lib/compositionGuard.js` + extension, `lib/extensions/EntityReference.jsx`, `components/NoteEditor.jsx` (stable extensions), `components/NotesSidebar.jsx`, hooks for archive/multi-select.
- API (`apps/api/src/routes/notes/`): archive endpoint(s), `references-service.js`, shared `lib/entity-references`, `notes-service.js` list filters (archived, has-image, color).
- DB: forward migration `note_references` (and optional `has_image`/`checklist_total/done` summary columns for card previews if parsing is too slow; decide during plan).
- Docs/tests: per Phase checklists, node tests for composition guard, reference resolution/permissions, list filters.

## 8. Testing and verification

- Automated: `node --test` for composition guard, references service (permission denied, stale title, public link stripped), notes list filters; `pnpm lint`; `pnpm build:web`.
- Manual on Galaxy Tab with S Pen (Phase 1 acceptance: write 3 paragraphs by handwriting-to-text with collab on, autosave running and a second session editing, no text lost or rewritten), 390px and 1440px, both themes, per the 14-aspect checklist.
- Evidence recorded in `docs/TASKS.md` with `Verified: YYYY-MM-DD` only after running.

## 9. Risks

- Pen bug cause may differ from the hypotheses; the harness in 5.1.1 de-risks that before code is written.
- Deferring remote Y.js updates during composition can delay collaborator edits by the length of a composition; acceptable.
- Changing the default home affects muscle memory; the two-pane view stays one click away.
- Reference table adds write work on every save; keep extraction diff-based and debounced with the existing autosave.

## 10. Delivery order

1. Phase 1 (pen stability) — own plan, own commit series, deployable alone.
2. Phase 2 (home grid + quick composer + archive).
3. Phase 3 (touch editor).
4. Phase 4 (entity references).
5. Phase 5 (polish).
