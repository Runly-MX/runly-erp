# Notes polish and gaps: results (phase 5)

## UI audit

Audited against `docs/ai-context/ui-screen-audit-checklist.md` by reading the classes and props of each component.

| Component | Finding | Fixed |
|---|---|---|
| `home/NotesHome.jsx` | The list query had no error state (a failed load showed the empty state). | Yes: `ErrorState` with retry (props `isError`, `onRetry`). |
| `home/NoteGridCard.jsx` | Enter on the actions-menu trigger bubbled to the card and opened the note; Space did not activate the card; no visible focus ring; no selected semantics; decorative pin icon announced; 24px color swatches on touch. | Yes: key handler only for the card itself (Enter and Space), `focus-visible` ring, `aria-pressed` in select mode, pin `aria-hidden`, 36px swatches on coarse pointers. |
| `home/NotesFilters.jsx` | 36px chips and 32px swatches on touch; filter row not labeled. | Yes: 44px chips and 40px swatches on coarse pointers, `role="group"` with a label. |
| `home/NotesSelectionBar.jsx` | Bulk bar not exposed as a toolbar. | Yes: `role="toolbar"` with a label. |
| `home/QuickComposer.jsx` | Title, body and checklist inputs had only placeholders (no accessible name); failed create was silent; 32px swatches on touch. | Yes: `aria-label`s, error toast, 40px swatches on coarse pointers. |
| `components/NoteEditorPanel.jsx` | Share, view-mode and settings buttons had no accessible name on narrow screens (label hidden below `sm`); back/header buttons under 44px on touch. | Yes: `aria-label`s and 44px minimum targets on coarse pointers. |
| `components/SubpagesStrip.jsx` | A failed sub-pages query hid the strip silently; 32px chips on touch. | Yes: compact `ErrorState` with retry; 44px chips on coarse pointers. |
| `components/NoteBreadcrumb.jsx` | Ancestor buttons about 20px tall on touch. | Yes: 44px minimum on coarse pointers. |
| `components/EntityReferencePicker.jsx` | Search errors (non-403) used `EmptyState` without a retry. | Yes: `ErrorState` with retry. 403 keeps its dedicated empty state. |
| `components/OutlinePanel.jsx` | 24px close button on the rail for touch tablets. | Yes: larger padding on coarse pointers. |
| `components/SaveStatusBadge.jsx` | None (live region, text on `sm+`, `sr-only` below). | n/a |
| Mutations (`useNote.js`, `useNoteShares.js`, `NotesScreen.jsx`) | Trash, leave, restore, delete, publish, unpublish, update, flag toggle and create failed without feedback. | Yes: `sonner` error toasts. |
| `components/NoteShareModal.jsx` | Pre-existing native `<input type="text">` search box in the modal. | No: out of the audited list; replacing it needs a visual pass of the modal. |
| `NotesScreen.jsx` split list (`NotesList`) | The split-layout list query has no error state. | No: legacy layout, out of scope for the redesign screens. |
