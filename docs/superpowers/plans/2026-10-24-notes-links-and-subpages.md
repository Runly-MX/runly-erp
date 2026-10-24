# Notes Entity References and Sub-pages Implementation Plan (Phases 4 and 3b-subpages)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notes can embed live links to other Runly records (contacts, employees, vehicles, inventory items, projects, tasks, events, ledger accounts, files) and can have child notes (sub-pages) with breadcrumb navigation.

**Architecture:** References reuse the existing, already permission-aware `/relation-targets/:type/search` and `/relation-targets/:type/resolve` API (backed by the chat entity-reference resolvers; per-type permission, company scope, per-user visibility). The editor stores only `{ entityType, recordId }` in an inline atom node and resolves the label live, so a viewer without access never sees the title and titles never go stale. A `note_references` table is kept in sync on save for backlinks. Sub-pages add `notes.parent_note_id`; the main list shows root notes only, children are reached through a strip and breadcrumb in the editor panel.

**Tech Stack:** PostgreSQL (forward migration, raw SQL), Hono + `prisma.$queryRaw` (the notes tables are not Prisma models; see `apps/api/src/routes/notes/notes-service.js`), TipTap 3 node views, React Query, node:test.

Spec: `docs/superpowers/specs/2026-10-24-notes-quick-notes-redesign-design.md` sections 5.3b (sub-pages) and 5.4 (references).

Deviations from the spec (record in the results file): (1) no extraction of a shared `lib/entity-references`: the existing `/relation-targets` API already is that shared layer; (2) the node stores no title snapshot, only type and id, resolved live (stronger privacy than the spec's snapshot and no stale titles); (3) insertion is through a picker dialog (slash command `/vincular` and a toolbar button), not an `@` mention; (4) sub-pages have no inline link block in the document: they are listed in a strip under the editor header with a "Nueva subpagina" action, so removing text can never orphan a child; (5) card reference chips show a count, not titles.

Conventions: JavaScript only, Spanish UI text, English code/comments, no emojis, `@runly/ui` first (Dialog with `DialogHeader` icon, size md+, fixed header/footer and scrolling body; `SelectField`, `SearchInput`, `EmptyState`, `ConfirmDialog`), flat selected states, controls `rounded-md` max, files under 1000 lines. Never edit applied migrations; add a forward one. UUID v7 only (DB default `uuidv7()`, never generate ids in JS). Tests with `node --test "<glob>"` (Node 22). Commit each task right away, staging only your files (unrelated uncommitted changes exist in `docs/developers/*` and `packages/module-compiler/src/developer-docs.json`), branch `main`, commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never start/stop dev servers, never run migrations against the shared database (create the SQL and validate it by reading and by `pnpm exec prisma validate` only if relevant; the user applies migrations). Never print secrets.

Frontend base: `apps/desktop/src/modules/runly.notes/`. API base: `apps/api/src/routes/notes/`.

---

### Task 1: Migration

**Files:** Create `prisma/migrations/20261117000000_notes_references_and_subpages/migration.sql`.

- [ ] Read `prisma/migrations/20260627120000_atlas_notes_tables/migration.sql` and the later notes migrations (grep `ALTER TABLE notes`) to mirror how note tables handle RLS/grants/policies and realtime. Then write:

```sql
ALTER TABLE notes
  ADD COLUMN parent_note_id UUID REFERENCES notes(id) ON DELETE CASCADE;

CREATE INDEX idx_notes_parent_note_id ON notes (parent_note_id) WHERE parent_note_id IS NOT NULL;

CREATE TABLE note_references (
  note_id     UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  company_id  UUID REFERENCES "company"(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  record_id   UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, entity_type, record_id)
);

CREATE INDEX idx_note_references_record ON note_references (entity_type, record_id);
```
  plus whatever RLS/grant statements the existing note tables use (enable RLS and mirror policies only if the sibling tables do; the API connects with a privileged role, so if siblings have no RLS, add none). Verify `company` and `notes` quoting matches siblings.
- [ ] **Commit** `feat(notes): migration for note references and sub-pages`.

---

### Task 2: API for references (sync on save, backlinks)

**Files:**
- Create: `references-service.js`, `__tests__/note-references.test.js`
- Modify: `notes-service.js` (updateNote), `index.js` (route), `apps/api/src/mcp/adapters/notes.js` only if it writes content (check), `packages/sdk/src/index.js` or the notes SDK domain (add `byRecord`)

- [ ] **Step 1: Pure extractor test first.** `__tests__/note-references.test.js`
```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { extractEntityReferences } from '../references-service.js'

const U1 = '0195a000-0000-7000-8000-000000000001'
const U2 = '0195a000-0000-7000-8000-000000000002'

test('extracts unique type/id pairs from entity-reference nodes', () => {
  const html =
    `<p>x <span data-type="entity-reference" data-entity-type="contact" data-record-id="${U1}"></span>` +
    `<span data-type="entity-reference" data-record-id="${U2}" data-entity-type="vehicle"></span>` +
    `<span data-type="entity-reference" data-entity-type="contact" data-record-id="${U1}"></span></p>`
  assert.deepEqual(extractEntityReferences(html), [
    { entityType: 'contact', recordId: U1 },
    { entityType: 'vehicle', recordId: U2 },
  ])
})

test('ignores unknown types, malformed ids and non-strings', () => {
  assert.deepEqual(extractEntityReferences(null), [])
  assert.deepEqual(
    extractEntityReferences('<span data-type="entity-reference" data-entity-type="nope" data-record-id="' + U1 + '"></span>'),
    [],
  )
  assert.deepEqual(
    extractEntityReferences('<span data-type="entity-reference" data-entity-type="contact" data-record-id="abc"></span>'),
    [],
  )
})

test('caps the number of references per note', () => {
  const many = Array.from({ length: 80 }, (_, i) =>
    `<span data-type="entity-reference" data-entity-type="contact" data-record-id="0195a000-0000-7000-8000-${String(i).padStart(12, '0')}"></span>`).join('')
  assert.equal(extractEntityReferences(many).length, 50)
})
```

- [ ] **Step 2: Implement `references-service.js`.** Export `ALLOWED_TYPES` (import `EXTERNAL_RELATION_TARGETS` from `@runly/module-compiler` and use its keys; confirm the import path other API files use, e.g. `relation-targets-routes.js`), `extractEntityReferences(html)` (attribute-order independent regex over `<span ... data-type="entity-reference" ...>`, validates type in `ALLOWED_TYPES` and a UUID regex, de-duplicates, caps at 50), and `createNoteReferencesService({ prisma })` with `syncReferences({ noteId, companyId, html })` (delete rows not present, insert missing with `ON CONFLICT DO NOTHING`, all in one `prisma.$transaction`, using tagged `$queryRaw`/`$executeRaw`) and `listNotesByRecord({ userId, companyId, entityType, recordId })` returning ids/titles of notes that reference the record AND that the user can access (reuse the same accessibility conditions as `listNotes`: `public.runly_note_user_access(n.id, userId, false)`, not trashed, company scope, owner-or-share; copy the CTE guard exactly, do not loosen it).
- [ ] **Step 3: Wire.** In `notes-service.js` `updateNote`, when `data.content` is a string call `syncReferences` after a successful update (failure to sync must not fail the save: catch and `console.warn`). Add route `GET /notes/by-record?entityType=&recordId=` registered BEFORE `/:id` (permission `notes.notes.read`), validating `entityType` against `ALLOWED_TYPES` (400 otherwise). Add SDK method `runly.notes.byRecord({ entityType, recordId }, token)` next to the other notes methods.
- [ ] **Step 4: Verify** `node --test "apps/api/src/routes/notes/__tests__/*.test.js"` (extractor tests fail first, then pass; existing 52 keep passing), `pnpm lint`. Run `node scripts/check-company-scope.mjs` if the repo uses it for notes (grep `runly.notes` hit it earlier) and make sure the new queries keep company scoping. **Commit** `feat(notes): sync note references on save and backlinks endpoint`.

---

### Task 3: Editor reference node and picker

**Files:**
- Create: `lib/extensions/EntityReference.jsx`, `components/EntityReferenceChip.jsx`, `components/EntityReferencePicker.jsx`, `hooks/useRelationTargets.js`, `lib/entityReferenceTypes.js`, `lib/__tests__/entity-reference-types.test.js`
- Modify: `lib/editor-extensions.js`, `lib/slashCommandItems.js`, `components/NoteToolbar.jsx`, `components/NoteInteractionContext.js` + `components/NoteEditor.jsx` (add `isPublic` to the context value), `packages/sdk/src/domains/*` only if the SDK has no relation-targets search/resolve (grep `relation-targets` in `packages/sdk/src/domains/builder.js` and `canvas.js` and reuse; otherwise add `runly.relationTargets.search(type, q, token)` and `.resolve(type, ids, token)`)

- [ ] **Step 1: `lib/entityReferenceTypes.js`** — client registry (icon + label per type; same 9 keys as `EXTERNAL_RELATION_TARGETS`: contact, hr_employee, vehicle, inventory_item, project, task, calendar_event, ledger_account, file). Export `REFERENCE_TYPES` (array `{ value, label, Icon }` with lucide icons: User, IdCard, Car, Package, SquareKanban, CheckSquare, CalendarDays, Landmark, Paperclip; labels in Spanish: Contacto, Colaborador, Vehiculo, Articulo de inventario, Proyecto, Tarea, Evento, Cuenta, Archivo) and `referenceTypeOf(value)`. Test: every value is unique, has a label and an icon, and the set equals the API keys list hard-coded in the test (`['contact','hr_employee','vehicle','inventory_item','project','task','calendar_event','ledger_account','file']`).
- [ ] **Step 2: `hooks/useRelationTargets.js`** — `useReferenceSearch(type, q)` (React Query, key `['note-ref-search', type, q]`, `enabled` when token and type, `staleTime` 15 s, returns `data` array `{ id, title, subtitle }`) and `useResolvedReference(type, id)` (key `['note-ref', type, id]`, `staleTime` 60 s, calls resolve with `[id]`, returns `{ title, subtitle, url }` or `null` when the API returns nothing, `status`). Batch concurrent resolves of the same type with a microtask-debounced queue if simple; otherwise one request per chip is acceptable (cap noted in results).
- [ ] **Step 3: `lib/extensions/EntityReference.jsx`** — inline atom node `entityReference` (`group: 'inline', inline: true, atom: true, selectable: true`), attrs `entityType`, `recordId`; `parseHTML` `span[data-type="entity-reference"]` reading `data-entity-type`/`data-record-id`; `renderHTML` `['span', { 'data-type': 'entity-reference', 'data-entity-type': ..., 'data-record-id': ... }]`; `ReactNodeViewRenderer(EntityReferenceChip)`; command `insertEntityReference({ entityType, recordId })` inserting the node followed by a space. Register in `buildExtensions` base list (so read-only and public render it).
- [ ] **Step 4: `EntityReferenceChip.jsx`** — `NodeViewWrapper as="span"` inline chip, `rounded-md` flat `bg-muted` with the type icon and the resolved title (truncate 28ch); states: loading (skeleton text), resolved (click or Enter navigates to `url` via `useNavigate`; in a read-only/viewing editor still navigates; middle click/Ctrl-click opens a new tab via `<a href>` semantics if simple), unavailable (`null` after load): generic "Registro no disponible" with the type icon and no title, not clickable. Public view (`isPublic` from `NoteInteractionContext`): never call the API and never link; render the type icon and the neutral label "Registro vinculado". Selected state flat (no ring). Min 32px height, touch friendly.
- [ ] **Step 5: `EntityReferencePicker.jsx`** — `Dialog` (size md+, `DialogHeader` with `Link2` icon, title "Vincular registro", fixed header/footer, scrolling body). Body: type chips (from `REFERENCE_TYPES`; only types the user can use: on a 403 from search show an `EmptyState` "Sin permiso para ver este tipo de registro"), `SearchInput` (debounce 250 ms), result list (rows with title and subtitle, loading skeleton rows, `EmptyState` for no results). Selecting a row calls `onPick({ entityType, recordId })` and closes. Props: `open`, `onOpenChange`, `onPick`. Host it in the editor through a small store/context: `NoteInteractionContext` gets `openReferencePicker()` provided by `NoteEditorSurface` (state `pickerOpen`; on pick run `editor.chain().focus().insertEntityReference(...).run()`). Slash item `{ title: 'Vincular registro', keywords: ['link','vincular','registro','referencia','contacto'], run: delete range then context.openReferencePicker() }` — `buildSlashItems` has no context access today: pass an `openReferencePicker` getter option through `SlashCommand.configure` the same way `getToken` is passed (a ref-backed getter so the extensions memo does not change). Toolbar button (`Link2` is taken by the URL link: use `AtSign`, title "Vincular registro") that calls the same function. Not shown when `viewing`.
- [ ] **Step 6: Verify** `node --test "apps/desktop/src/modules/runly.notes/lib/__tests__/*.test.js"`, lint, `pnpm --filter @runly/desktop build:web`. Phase 1 invariants: do not add volatile values to the `extensions` memo deps. **Commit** `feat(notes): live entity reference chips with picker`.

---

### Task 4: Sub-pages backend

**Files:** Modify `notes-service.js`, `index.js`, `__tests__/` (add `note-subpages.test.js` for the pure parts), SDK notes domain.

- [ ] **Step 1: Pure helper + test.** Create `subpages.js` in the API notes folder exporting `MAX_DEPTH = 3` and `exceedsDepth(ancestorCount)` (`ancestorCount >= MAX_DEPTH`, where ancestorCount is the number of ancestors of the intended parent plus the parent itself... define precisely: a root note has depth 1; creating a child of a depth-3 note is rejected). Test: depth 1 and 2 parents allow a child, depth 3 does not.
- [ ] **Step 2: Create with parent.** `createNote` accepts `parentId` (optional). When present: load the parent with the same access rule used for editing (owner, or share with edit permission; reuse the existing helper that `updateNote`/share checks use), compute the parent's depth with a recursive CTE, reject with a 422 Spanish message "No se pueden anidar mas de 3 niveles." when exceeded, inherit `folder_id` and `company_id` from the parent, and copy the parent's `note_shares` rows to the child in the same transaction (read the table's columns first; copy everything that defines the grant, set a fresh id via DB default). Route `POST /notes` passes `parentId` from the body (validate UUID).
- [ ] **Step 3: List and detail.** `listNotes` gets `parentId` param: with it, return that parent's direct children (same access CTE); without it, add `AND n.parent_note_id IS NULL` so only roots appear in the main list, archive and trash views (children of a trashed root are trashed with it, see below). Each returned row includes `child_count` (a correlated count of non-trashed, non-deleted children). `GET /notes?parentId=` wired in `index.js`. `getNote` (the `/:id` route) additionally returns `ancestors: [{ id, title, icon }]` root-first, from a recursive CTE limited to notes the user can access (stop the chain at the first inaccessible ancestor).
- [ ] **Step 4: Trash and restore cascade.** `trashNote` marks the note and all its descendants (`WITH RECURSIVE`) `is_trashed = true, trashed_at = <same now()>` in one statement; `restoreNote` restores descendants whose `trashed_at` equals the parent's `trashed_at` (so children trashed independently earlier stay trashed). `permanentDelete` relies on `ON DELETE CASCADE`. Add tests for any pure SQL-free logic; for SQL paths read them carefully and keep every query company-scoped.
- [ ] **Step 5: SDK** `runly.notes.list` already forwards params; ensure `parentId` passes through `toQueryString`; `runly.notes.create` forwards `parentId`.
- [ ] **Step 6: Verify** API notes tests, lint, `node scripts/check-company-scope.mjs` if applicable. **Commit** `feat(notes): sub-pages (parent, depth limit, ancestors, cascade trash)`.

---

### Task 5: Sub-pages frontend

**Files:**
- Create: `components/SubpagesStrip.jsx`, `components/NoteBreadcrumb.jsx`, `hooks/useSubpages.js`
- Modify: `components/NoteEditorPanel.jsx`, `home/NoteGridCard.jsx` (child count), `components/NoteToolbar.jsx` (button "Subpagina"), `hooks/useNotes.js` if needed, `NotesScreen.jsx` (open child, `selectNote`)

- [ ] `useSubpages(noteId)`: `useNotes({ parentId: noteId })` wrapper returning `{ children, isLoading }`; creation reuses `useCreateNote` with `{ parentId, title: 'Nueva subpagina', content: '<p></p><p></p>' }`, then opens the child via the screen's `selectNote`.
- [ ] `NoteBreadcrumb`: renders `ancestors` from the note detail (`useNote` data) as "Padre > Hijo > Actual" with icons, each ancestor clickable (opens it), truncating middle items on small screens; hidden when no ancestors. Placed in the editor panel header above/in place of the plain title text.
- [ ] `SubpagesStrip`: below the header, horizontally scrollable chips (icon + title) for the children plus a "+ Subpagina" button (disabled at depth 3, tooltip "Maximo 3 niveles"); hidden for trash/read-only notes except the chips list. Uses `EmptyState` nowhere (a strip, not a screen); loading shows 2 skeleton chips.
- [ ] Toolbar button (`FilePlus2`, title "Nueva subpagina") and slash item `/subpagina` calling the same create-and-open action (via the context getter pattern used for the picker). Grid card shows a small `Layers` icon with `child_count` when > 0.
- [ ] Opening a child keeps the URL contract (`?note=<id>`); back button/breadcrumb navigates up. Deleting/trashing the open note while a child is open follows existing `clearIfSelected` behavior.
- [ ] **Verify** lint, build, notes tests. **Commit** `feat(notes): sub-pages strip, breadcrumb and creation`.

---

### Task 6: Docs, MirAI capability check and evidence

**Files:** `docs/TASKS.md`, results file `docs/superpowers/plans/2026-10-24-notes-links-and-subpages-results.md`, `docs/ai-context/mirai-module-capabilities.md` (only if the notes capability list should mention references/sub-pages; do not change MirAI behavior), `docs/ai-context/rme3-runtime-capabilities.md` only if it lists editor extensions.

- [ ] Run `node --test "apps/desktop/src/modules/runly.notes/lib/__tests__/*.test.js"`, `node --test "apps/api/src/routes/notes/__tests__/*.test.js"`, `pnpm lint`, `pnpm --filter @runly/desktop build:web`; record exact counts. Do not apply the migration; state that it must be applied with `pnpm db:migrate` by the user and the API restarted.
- [ ] Results file: what shipped, the five deviations from the plan header, known limits (one resolve request per chip, max 50 references per note, 3 levels), and a manual QA checklist (insert each of the 9 types; a user without permission for a type sees "Sin permiso" in the picker and "Registro no disponible" on an existing chip; public link shows neutral chips and no links; backlinks endpoint returns only accessible notes; create sub-page, breadcrumb, depth limit message at level 4, trash parent trashes children and restore brings back only those trashed together; two-session collaboration with chips; phone and tablet). Unchecked.
- [ ] `docs/TASKS.md` unchecked entry; `Verified:` only for what was actually run. **Commit** `docs(notes): links and sub-pages results and QA checklist`.
