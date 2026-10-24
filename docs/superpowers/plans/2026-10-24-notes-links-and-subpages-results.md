# Notes entity references and sub-pages: results (phases 4 and 3b-subpages)

Plan: `docs/superpowers/plans/2026-10-24-notes-links-and-subpages.md`.

## What shipped

- Migration `prisma/migrations/20261117000000_notes_references_and_subpages/migration.sql`: `notes.parent_note_id` (self FK, `ON DELETE CASCADE`, partial index), table `note_references` (PK `note_id, entity_type, record_id`, lookup index on `entity_type, record_id`). The new table has RLS enabled and privileges revoked from `anon`/`authenticated`, same second boundary as every other backend-owned table. **Not applied**: the user must run `pnpm db:migrate` and restart the API.
- References API: `references-service.js` (`extractEntityReferences`, `createNoteReferencesService` with `syncReferences` and `listNotesByRecord`), sync on `updateNote` when `content` changes (a sync failure only logs a warning), `GET /notes/by-record?entityType=&recordId=` (registered before `/:id`, permission `notes.notes.read`, returns only notes the caller can open, company scoped). SDK: `runly.notes.byRecord`, `runly.relationTargets.search/resolve`.
- Editor: inline atom node `entityReference` (stores only `entityType` + `recordId`), `EntityReferenceChip` (loading, resolved and clickable, unavailable, neutral in public view), `EntityReferencePicker` (Dialog md with `DialogHeader` icon, `SelectField` for the type, `SearchInput` with 250 ms debounce, `EmptyState` for no results / no permission), toolbar button (`AtSign`) and slash item "Vincular registro". The picker opener travels through a ref-backed getter, so the extensions memo is unchanged. `isPublic` is part of `NoteInteractionContext`.
- Sub-pages API: `subpages.js` (`MAX_DEPTH = 3`, `exceedsDepth`), `createNote({ parentId })` (edit access to the parent, 422 "No se pueden anidar mas de 3 niveles.", inherits company and folder, copies the parent's `note_shares` and adds the parent's owner as editor when another user creates the page, all in one transaction), `GET /notes?parentId=` and `child_count` on every list row, `ancestors` on `GET /notes/:id`, cascade trash and selective restore (children come back only when their `trashed_at` equals the parent's).
- Sub-pages UI: `NoteBreadcrumb` (collapses to the closest ancestor on phones), `SubpagesStrip` (chips plus "Subpagina", disabled with a tooltip at level 3), toolbar button and `/subpagina` slash item, `Layers` count on grid cards. Opening a child keeps the `?note=<id>` contract. Entries opened from the breadcrumb or strip fetch the full note first so the editor never mounts with a partial row.

## Deviations from the spec (plan header)

1. No shared `lib/entity-references` extraction: the existing `/relation-targets` API is that layer.
2. The node stores no title snapshot, only type and id, resolved live (no stale titles, no leak to viewers without access).
3. Insertion is through a picker dialog (toolbar and `/vincular`), not an `@` mention.
4. Sub-pages have no inline link block in the document; they live in a strip under the header with a "Subpagina" action.
5. Card reference chips show a count, not titles (only the sub-page count is shown on cards).

## Deviations from the plan text

- The list filter `parent_note_id IS NULL` is refined: a child is also listed when it has no accessible parent in the same state (parent inaccessible to the user, or the child was trashed/archived on its own while the parent was not). This keeps independently trashed or archived pages recoverable and avoids hiding pages shared only on the child. Plain root listing is otherwise unchanged.
- `listNotes` has an `includeSubpages` flag. The MCP adapter (`notes_page`) passes `true`, so MCP keeps seeing every accessible note including sub-pages. MirAI uses its own queries (`notes-mirai-queries.js`) and is unaffected; the quick-notes widget and the home grid list roots, as before.
- The picker has no footer (closing is done with the header close button); header and search stay fixed and only the results scroll.

## Known limits

- Resolves are batched per type per tick (one POST per type for chips mounting together); there is no cache beyond React Query (`staleTime` 60 s).
- Maximum 50 references indexed per note (extra chips still render, only the first 50 feed backlinks).
- Maximum 3 levels of sub-pages. The ancestor chain stops at the first inaccessible ancestor, so the UI depth check can undercount; the API enforces the real limit.
- Sharing a parent after sub-pages exist does not retroactively share the children (shares are copied at creation).
- Archiving a parent does not archive its children (only trash cascades).
- The SQL (recursive CTEs, `INSERT ... SELECT ... UNION ALL ... ON CONFLICT`, new list conditions) was reviewed by reading and covered only for its pure parts; it has not been executed against a database because the migration is not applied.

## Automated verification (2026-10-24)

- `node --test "apps/desktop/src/modules/runly.notes/lib/__tests__/*.test.js"`: 184 tests, 184 pass.
- `node --test "apps/api/src/routes/notes/__tests__/*.test.js"`: 57 tests, 57 pass.
- `node --test "apps/desktop/src/modules/runly.notes/quick/__tests__/*.test.js"`: 6 tests, 6 pass.
- `pnpm lint`: clean.
- `pnpm --filter @runly/desktop build:web`: clean.

## Manual QA checklist (not done)

- [ ] Insert a reference of each of the 9 types from the toolbar and from `/vincular`.
- [ ] A user without permission for a type sees "Sin permiso para ver este tipo de registro" in the picker and "Registro no disponible" on an existing chip.
- [ ] Clicking a chip navigates to the record; Ctrl-click opens a new tab; a chip survives reload and a collaborator's edit.
- [ ] Public link shows neutral "Registro vinculado" chips and no links.
- [ ] `GET /notes/by-record` returns only notes the caller can open, and drops a reference after the chip is deleted and the note saved.
- [ ] Create a sub-page from the strip, the toolbar and `/subpagina`; breadcrumb shows the path and each ancestor opens.
- [ ] Creating a page under a level-3 note is blocked in the UI and returns the 422 message from the API.
- [ ] Trashing a parent trashes its children; restoring it brings back only the children trashed with it.
- [ ] A collaborator with edit access creates a sub-page; the owner and the other collaborators can open it.
- [ ] Two sessions editing a note with chips (collaboration, pen/IME behavior unchanged).
- [ ] Phone and tablet layouts (picker as bottom sheet, strip scrolls horizontally, breadcrumb collapses).
- [ ] Apply the migration (`pnpm db:migrate`), restart the API and re-run the checks above.
