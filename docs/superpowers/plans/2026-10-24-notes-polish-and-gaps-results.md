# Notes polish and gaps: results (phase 5)

## Shipped

- Grid pagination: `useInfiniteNotes` (`useInfiniteQuery`, key `['notes', 'infinite', params]`, 60 per page), `lib/notesPages.js` (`flattenPages`, `hasMore`), `patchNoteInCache` also patches infinite pages. "Cargar mas" keeps loading until the last page; the 100-note cap is gone. The "recent" view and the split list keep the single-page `useNotes`.
- Photo in the quick composer: image button (`ImageSourceSheet`), thumbnails with remove, photos uploaded against the shared `draft` key of `/notes/presign-image` (the route accepts it, so no draft note is created), appended as `<img>` (with `data-aspect-ratio`) by `buildQuickNoteContent({ images })`; an images-only note is titled "Nota con foto". Saving waits for pending uploads.
- Per-note spellcheck toggle: `lib/spellcheckPref.js`, `hooks/useNoteSpellcheck.js` (localStorage `runly:v1:notes-spellcheck:<noteId>`, in-memory emitter), `SpellcheckApplier` sets `spellcheck`/`autocorrect` on the editor DOM from an effect (no change to the extensions memo), switch "Correccion ortografica" in the settings panel. Default: on for desktop, off for coarse pointers.
- Sub-page cascades: sharing, changing permission and revoking a share apply to the note and its non-deleted sub-pages (same owner and company) in one recursive-CTE statement each; archiving cascades to descendants (un-archiving restores every archived descendant: documented simplification, no `archived_at`); the share modal shows "Las subpaginas heredan este acceso." when `child_count > 0`.
- Escape closes the editor overlay (home layout) via `lib/overlayEscape.js`: not when the event was handled, a dialog/alertdialog/menu/listbox is open, zen mode is on, or an IME composition is active. Canvas notes are excluded (their tools use Escape).
- MirAI and docs: `notes_search` / `notes_get` now return `subpaginaDe`, descriptions mention sub-pages and the trash cascade; the notes MirAI queries use their own SQL and did not need changes for `parent_note_id` beyond selecting it. `docs/ai-context/mirai-module-capabilities.md` and `rme3-runtime-capabilities.md` updated (`pageBreak`, `tableOfContents`, `entityReference`, sub-pages).
- UI audit (below) and error toasts for note mutations.

## Dropped on purpose

- Drag-to-reorder pinned cards.
- Toggling checklist items from a card (the Y.js document is the source of truth).

## Deviations

- Task 2: no silent draft note creation; the presign route already accepts `noteId: 'draft'`.
- Task 4: share and archive cascades are single CTE statements instead of an explicit transaction (atomic by construction, and compatible with the existing prisma stubs in the tests). Archive cascade runs after the parent update as a second statement.
- Task 5: Escape also ignores canvas notes and active IME composition, and treats open menus and listboxes as open layers.

## Remaining known limits

- Un-archiving a parent un-archives all archived descendants, including ones archived on their own earlier.
- Share cascade overwrites a different permission previously set on a descendant for that same user.
- Spellcheck preference is per browser, not synced across devices.
- A failed "Cargar mas" fetch shows no message (the button stays available).
- SQL changes (share and archive cascades) are covered by statement-shape tests only; they were not executed against a database in this session.

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

## Automated verification (2026-10-24)

- `node --test "apps/desktop/src/modules/runly.notes/lib/__tests__/*.test.js"`: 196 tests, 196 pass.
- `node --test "apps/api/src/routes/notes/__tests__/*.test.js"`: 60 tests, 60 pass.
- `pnpm lint`: clean.
- `pnpm --filter @runly/desktop build:web`: builds.

## Manual QA checklist (pending)

- [ ] Grid with more than 60 notes: "Cargar mas" appends pages, pin/archive on a card updates it in place.
- [ ] Photo from camera and from gallery on a phone in the quick composer; thumbnails, remove, save, the note shows the photos.
- [ ] Spellcheck toggle persists per note and defaults by device (on desktop, off on touch).
- [ ] Sharing a parent shares its children; changing permission and unsharing propagate.
- [ ] Archiving a parent archives its sub-pages; un-archiving brings them back.
- [ ] Escape closes the overlay with no dialog open; with a dialog, popover or menu open it only closes that layer; in zen mode it only leaves zen.
- [ ] UI audit fixes at 390px (header buttons, filters, strip, picker) and with a touch pointer.

## Image editing and cover fixes

- Cover paper alignment: the paper phase (`--note-paper-phase`) is now re-measured when the cover image loads (`load` captured on the container), when `.note-sheet` or any of its direct children (the cover) resize, and on `visualViewport` resize. The cover sits inside `.note-sheet` as a sibling of `.tiptap`, so its size changes never resized the previously observed elements.
- `AdvancedFileViewer` has a new optional `onEditImage(file)` prop: shows the same "Editar imagen" button for any image and calls the host (documented in `docs/ai-context/rme3-runtime-capabilities.md`). Other viewers (files, chat, inventory, pfm) do not pass it, so their behavior is unchanged.
- `NoteImagePreviewButton` takes `editable` + `onReplaceImage(editedFile)`; the viewer's edit button closes the viewer and opens `ImageEditorDialog` (the dialog is a regular z-50 dialog and its inner confirm and menus would hide behind the viewer's z-100). The cover uploads through the existing `uploadNoteImage` helper and calls `onChange(publicUrl)`; only offered when the note is editable.
- Inline images (and images in table cells) now have one edit button (PencilRuler, "Editar imagen") next to "Ver imagen"; it and double-click open `ImageEditorDialog` on the image `src`. Replacing uploads the file and sets `src`, `aspectRatio` (re-measured) and resets `crop`, `rotation`, `annotations`, `erasedAnnotations`.
- Removed: inline annotation edit mode and toolbar, `ImageEditModal`, `ImageCropModal`, `useImageAnnotationDrawing`, `lib/imageLoadState.js` (+ test), and the unused crop geometry in `lib/imageCrop.js` (kept: `cropToViewBox`, `normalizeRotation`, `effectiveNaturalSize`). Old `crop`, `rotation` and `annotations` still render (read-only SVG in `ImageAnnotationShapes.jsx`).
- Legacy images: when the user edits an old image the editor starts from the original `src`, so previous overlay crop, rotation and annotations are reset (not baked). The "Insertar como copia" option was dropped; only replace remains.

Verification: notes lib tests 172/172, notes API tests 60/60, `pnpm lint` clean, `build:web` builds.

### Manual QA (pending)

- [ ] Cover with lined and grid paper: text sits on the rules at 390px and desktop, after adding/changing/removing the cover and after zoom changes.
- [ ] Cover viewer shows "Editar imagen"; editing and replacing updates the cover and persists after reload; absent in view-only and public mode.
- [ ] Selecting an inline image and pressing "Editar imagen" (and double-click) opens the full editor; replacing updates the image.
- [ ] Image inside a table cell uses the same edit button.
- [ ] Old image with annotations/crop still renders correctly.
- [ ] Edit, undo (Ctrl+Z in the note) and reload: the replaced image persists.

## MCP append (notes.note.append)

MCP clients (ChatGPT/Claude) and MirAI can add text to an existing note through the approved action `notes.note.append` (`notes.notes.update` + `notes.notes.read`, input `{ noteId, content }`, max 20000 chars). Implementation: `routes/notes/append-blocks.js` (pure parsing, HTML/text rendering and Y.js node builders) and `notesSvc.appendToNote` in `notes-service.js`.

- With a Y.js snapshot (`note_ydoc_state`): the blocks are appended to the `default` XmlFragment using the editor schema names (paragraph, heading{level}, bulletList > listItem, taskList > taskItem{checked}), the incremental update is saved through `ydocService.saveState` (CRDT merge with optimistic retry), the HTML/text are appended to `content`/`content_text` and `word_count` through `updateNote`, and the update is broadcast on `note:ydoc:<id>` event `ydoc.update` (best effort: a failure is logged and never fails the append).
- Without a snapshot: only `content`/`content_text`/`word_count` change; the editor seeds from the HTML on first open.

Limits: appends at the end only (never replaces or deletes); markdown-lite only (headings `#`..`###`, bullets, `- [ ]`/`- [x]` tasks, paragraphs); no tables or links (images are covered in the next section); canvas and trashed notes are rejected; open editors receive it live only if the broadcast succeeds (otherwise they converge on the next save or reload). In the MCP path the broadcaster is built from `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` when both are set.

Verification: notes API tests, MCP tests and `pnpm lint` (see the final run of this change); not yet exercised against a real editor.

### Manual QA (pending)

- [ ] Create a note via MCP, append via MCP, reload the note: both texts present.
- [ ] Append to a note that is open in the editor in another tab: the text appears live (and after reload if the broadcast failed).
- [ ] Append to a note never opened in the editor: text present on first open, no duplication.
- [ ] A note shared with view-only permission is rejected.
- [ ] A user without `notes.notes.update` is rejected.

## MCP append images

`notes.note.append` (MCP and MirAI) now also adds images. Input: optional `images` (max 5, each `{ url | data+mimeType, alt }`) and/or markdown lines `![alt](https://...)` inside `content` (parsed as `image` blocks, in place; array images go after the content). Images are appended as the editor's `image` node: Y.js `image` element with `src`, `alt`, `annotations`/`erasedAnnotations` `'[]'`, `width` (editor default 60, reduced for tall images) and `aspectRatio` read from the PNG/JPEG/GIF/WebP header; the HTML mirror carries `<img src alt data-width data-aspect-ratio>`; plain text keeps only the alt.

Pipeline (`apps/api/src/routes/notes/append-images.js`, wired in `appendToNote`): after the access checks and BEFORE any write, every image is validated, downloaded/decoded, type-checked and uploaded to the public `runly-notes` bucket with the editor's key layout (`companies/<companyId>/notes/<noteId>/<ts>-<rand>.<ext>`); any failure removes the uploaded objects and leaves the note unchanged. Without a storage client the images part fails with a clear Spanish error.

Limits: 5 images per call, 10 MB each, png/jpeg/webp/gif only (type from magic bytes, never Content-Type; no SVG), https only on port 443 with no credentials, DNS must resolve only to public addresses (loopback, private, link-local incl. cloud metadata, CGNAT, unique-local, multicast, IPv4-mapped/NAT64/6to4 IPv6 forms are rejected), redirects followed manually (max 3) and re-validated on every hop, 10 s timeout, streamed size cap. Stored in the public bucket like the editor's images. The confirmation shows the image count and each URL host only. Only the host is ever logged or shown.

Known gap: DNS is resolved for validation and again by `fetch`, so a DNS rebinding race between the two is not pinned.

### Manual QA (pending)

- [ ] Append an image by https URL via MCP: image appears in the note.
- [ ] Append an image by base64 via MCP.
- [ ] A private/loopback URL (for example `https://127.0.0.1/a.png`, a host resolving to 10.x) is rejected and the note is unchanged.
- [ ] An oversized image (over 10 MB) is rejected and the note is unchanged.
- [ ] Note open in the editor in another tab shows the image live.
- [ ] Note never opened in the editor shows the image on first open, no duplication.
- [ ] The appended image can be opened and edited in the full image editor (crop, annotate).

