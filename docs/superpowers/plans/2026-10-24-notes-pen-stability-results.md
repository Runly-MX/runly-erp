# Notes pen/IME stability - results (phase 1)

Plan: `docs/superpowers/plans/2026-10-24-notes-pen-stability.md`

## Automated verification (2026-10-24)

- `node --test "apps/desktop/src/modules/runly.notes/lib/__tests__/*.test.js"`: 163 tests, 163 pass, 0 fail
- `node --test "apps/api/src/routes/notes/__tests__/*.test.js"`: 52 tests, 52 pass, 0 fail
- `pnpm lint`: no errors
- `pnpm --filter @runly/desktop build:web`: build succeeds (only the existing chunk-size warning)

## Manual acceptance checklist (Galaxy Tab, S Pen)

Not yet run. Open the note with `?notesDebug=1`.

- [ ] Write three paragraphs with S Pen handwriting-to-text; no text is rewritten or erased
- [ ] A second session edits the same note meanwhile; its changes appear after the pen pause, nothing is lost on either side
- [ ] Autosave runs during writing (title/list update) without disturbing the composition
- [ ] Debug log shows `compositionstart`, and held updates are released after `compositionend`
- [ ] No `extensions rebuilt` entry appears while writing
- [ ] Drawing block and image annotation: after the pen touches the surface, palm/finger scrolls the note instead of drawing
