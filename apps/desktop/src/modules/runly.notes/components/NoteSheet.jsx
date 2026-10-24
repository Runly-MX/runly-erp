import { DARK_BG_MAP } from '../lib/noteColors.js'

// Shared responsive sheet for the editor and public view. CSS zoom reflows
// the content within the available width instead of scaling a fixed page.
export const NOTE_SHEET_MAX_WIDTH_CLASS = 'max-w-3xl mx-auto'

const PAGE_WIDTH_PX = { a4: 794, letter: 816 }

export function NoteSheet({ note, isDark = false, zoom = 100, paged = null, children }) {
  const raw = note?.background_color ?? null
  const backgroundColor = raw ? (isDark ? (DARK_BG_MAP[raw] ?? raw) : raw) : undefined

  return (
    <div
      className={`${NOTE_SHEET_MAX_WIDTH_CLASS} min-h-full bg-card note-sheet`}
      data-paged={paged?.enabled ? 'true' : undefined}
      data-page-size={paged?.enabled ? paged.size : undefined}
      style={{
        // Paged view: fixed page width (never wider than the viewport).
        ...(paged?.enabled ? { width: `${PAGE_WIDTH_PX[paged.size] ?? PAGE_WIDTH_PX.a4}px`, maxWidth: '100%' } : {}),
        zoom: `${zoom}%`,
        // Exposed as a custom property (not just the `backgroundColor` style
        // field) so specific descendants — the title row, which needs to sit
        // OPAQUE on top of the ruled/grid pattern instead of showing it
        // through — can reference the sheet's actual resolved background via
        // var(), which threads through intervening unstyled wrapper elements
        // the way a plain inherited `background-color` would not (that
        // property isn't inherited by default).
        '--note-sheet-bg': backgroundColor ?? 'hsl(var(--card))',
        ...(backgroundColor ? { backgroundColor } : {}),
      }}
    >
      {children}
    </div>
  )
}
