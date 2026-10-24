# Notes Quick Home (phase 2) - results

Plan: `docs/superpowers/plans/2026-10-24-notes-quick-home.md`. Spec: `docs/superpowers/specs/2026-10-24-notes-quick-notes-redesign-design.md` section 5.2.

## Automated verification (2026-10-24)

- `node --test "apps/desktop/src/modules/runly.notes/lib/__tests__/*.test.js"`: 174 tests, 174 pass, 0 fail (11 new: note preview, grid filters, quick-note content).
- `node --test "apps/api/src/routes/notes/__tests__/*.test.js"`: 52 tests, 52 pass, 0 fail.
- Also run: `rbac-granular-contract`, `runtime-module-aliases`, help and manifest tests: all pass.
- `pnpm lint`: clean.
- `pnpm --filter @runly/desktop build:web`: builds clean.

## Deviations from the spec

- Tapping a checklist item on a card does not toggle it. The Y.js document is the source of truth and the card only has the HTML snapshot, so a toggle from the card would be overwritten.
- The composer offers Texto, Checklist and Dibujo (creates a canvas note). Photo capture in the composer moves to phase 3.
- Manual reordering of pinned cards is out.

## Implementation notes and known limits

- Grid page size starts at 60 and "Cargar mas" raises it to the API cap of 100. `useNotes` has no multi-page support, so a view with more than 100 notes shows only the first 100 (known limit). Recientes keeps `pageSize: 20`.
- Filter chips (type, color, image, checklist) filter client-side over the loaded page only.
- Trash view in the grid: no card menu or multi-select; open a card to Restaurar / Eliminar from the editor header (the split layout keeps its list footer buttons).
- Shared (non-owned) cards offer only "Salir de la nota" in the menu; pin, archive and color are owner-only.
- Bulk "Papelera" asks for confirmation first; owned notes go to the trash, shared notes are left.
- The editor pane was extracted into `components/NoteEditorPanel.jsx` and is reused by both layouts (overlay in the grid layout). `NotesScreen.jsx` is about 500 lines.
- Layout choice persists in localStorage key `runly:v1:notes-layout`; switching from split to the grid closes the open note.
- `/notes/archive` added to the screen resolver, ModuleOutlet, the official manifest navigation (Todas, Recientes, Compartidas, Archivo, Papelera) and a help view (`archivo.md`). The `NotesSidebar` component (currently unused) also lists it.

## Manual QA checklist (pending)

- [ ] 390px phone, 1024px tablet and 1440px desktop widths.
- [ ] Light and dark themes (card colors, composer, overlay).
- [ ] S Pen handwriting in the composer textarea.
- [ ] Create a text note, a checklist and a drawing from the composer.
- [ ] Pin, archive, color and trash from the card menu.
- [ ] Multi-select (long press on touch, selection bar actions) including bulk trash confirmation.
- [ ] Deep link `?note=<id>` opens the editor overlay over the grid.
- [ ] Layout toggle (grid / two panes) persists after reload.
- [ ] Share modal, settings panel, zen mode and trash restore/delete work inside the overlay.
- [ ] Quick-notes floating widget still works.
