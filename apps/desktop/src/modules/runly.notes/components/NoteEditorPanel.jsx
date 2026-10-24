import { lazy, Suspense } from 'react'
import {
  Plus, ArrowLeft, Settings2, Share2, RotateCcw, Trash2, PenLine,
  Maximize2, Minimize2, Fullscreen, Eye,
} from 'lucide-react'
import { Button } from '@runly/ui'
import { NoteIcon } from '../noteIcons.jsx'
import { DARK_BG_MAP } from '../lib/noteColors.js'
import { NoteEditor } from './NoteEditor.jsx'
import { NoteTitleEditor } from './NoteTitleEditor.jsx'
import { ZoomControl } from './ZoomControl.jsx'
import { SaveStatusBadge } from './SaveStatusBadge.jsx'

// Lazy so the Excalidraw bundle only loads when a canvas note is opened.
const CanvasEditor = lazy(() =>
  import('./CanvasEditor.jsx').then((m) => ({ default: m.CanvasEditor })),
)

const VIEW_MODE_LABELS = { normal: 'Vista despejada', clean: 'Pantalla completa', fullscreen: 'Vista normal (Esc)' }

// Editor pane (header + editor/canvas + zoom). Used by the split layout and,
// inside the overlay, by the quick-notes home layout.
export function NoteEditorPanel({
  note, isTrashView, isZenMode, isDark, viewMode,
  viewOnly, onToggleViewOnly, zoom, onZoomChange,
  settingsOpen, onOpenSettings, onOpenShare, onUpdate,
  onBack, backOnDesktop = false, onCreateNote,
  onRestore, onDeleteForever,
  className = '',
}) {
  const isCanvasNote = note?.note_type === 'canvas'

  const canvasBg = (() => {
    if (isZenMode || !isCanvasNote) return undefined
    const raw = note?.background_color
    if (!raw) return undefined
    return { backgroundColor: isDark ? (DARK_BG_MAP[raw] ?? raw) : raw }
  })()

  return (
    <div
      className={[
        'flex-1 min-w-0 flex flex-col overflow-hidden',
        // fixed inset-x-0 top-0 h-dvh (not bare inset-0) - see RunlyApp.jsx's
        // app-shell-root comment: plain inset-0 sizes against the
        // non-shrinking mobile layout viewport and breaks the h-full/
        // flex-1 min-h-0 chain NoteEditor's scroll/keyboard-avoidance logic
        // depends on.
        isZenMode ? 'fixed inset-x-0 top-0 h-dvh z-50 bg-background' : (isCanvasNote ? '' : 'bg-muted/30'),
        !isZenMode ? 'relative' : '',
        className,
      ].join(' ')}
      style={canvasBg}
    >
      <div className="flex items-center gap-2 px-3 h-11 border-b border-border shrink-0 bg-background/95 backdrop-blur-sm">
        <button
          className={`${backOnDesktop ? '' : 'lg:hidden '}p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors`}
          onClick={onBack}
          aria-label="Volver a la lista"
        >
          <ArrowLeft size={15} />
        </button>

        {note && !isTrashView && note.note_type === 'canvas' ? (
          <NoteTitleEditor note={note} onUpdate={onUpdate} />
        ) : (
          <span className="flex-1 flex items-center gap-1.5 min-w-0 text-xs text-muted-foreground truncate">
            {note?.icon && (
              <NoteIcon name={note.icon} size={13} className="text-amber-500 shrink-0" />
            )}
            {note ? (note.title || 'Sin titulo') : ''}
          </span>
        )}

        {note && (
          <div className="flex items-center gap-0.5">
            {isTrashView && onRestore && (
              <Button type="button" size="sm" variant="ghost" onClick={onRestore}>
                <RotateCcw size={13} />
                <span className="hidden sm:inline">Restaurar</span>
              </Button>
            )}
            {isTrashView && onDeleteForever && (
              <Button type="button" size="sm" variant="ghost" onClick={onDeleteForever} className="text-destructive">
                <Trash2 size={13} />
                <span className="hidden sm:inline">Eliminar</span>
              </Button>
            )}
            {!isTrashView && !isCanvasNote && !viewOnly && <SaveStatusBadge noteId={note.id} />}
            {!isTrashView && !isCanvasNote && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={viewOnly ? 'Editar nota' : 'Ver nota'}
                onClick={onToggleViewOnly}
              >
                {viewOnly ? <PenLine size={14} /> : <Eye size={14} />}
                {viewOnly ? 'Editar' : 'Ver'}
              </Button>
            )}
            <button
              onClick={onOpenShare}
              className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg transition-colors"
            >
              <Share2 size={13} />
              <span className="hidden sm:inline">Compartir</span>
            </button>
            <button
              onClick={viewMode.cycle}
              className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg transition-colors"
              title={VIEW_MODE_LABELS[viewMode.mode]}
            >
              {viewMode.mode === 'normal' ? <Maximize2 size={13} /> : viewMode.mode === 'clean' ? <Fullscreen size={13} /> : <Minimize2 size={13} />}
            </button>
            <button
              onClick={onOpenSettings}
              className={`flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                settingsOpen
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Settings2 size={13} />
              <span className="hidden sm:inline">Ajustes</span>
            </button>
          </div>
        )}
      </div>

      {!note ? (
        <EmptyEditor onCreateNote={!isTrashView ? onCreateNote : undefined} isTrash={isTrashView} />
      ) : (!isTrashView && note.note_type === 'canvas') ? (
        <Suspense fallback={
          <div className="h-full grid place-items-center text-sm text-muted-foreground">Cargando lienzo...</div>
        }>
          <CanvasEditor key={note.id} note={note} />
        </Suspense>
      ) : (
        <NoteEditor note={note} readOnly={isTrashView} viewOnly={viewOnly} zoom={zoom} />
      )}

      {!isTrashView && !isCanvasNote && note && (
        <ZoomControl zoom={zoom} onZoomChange={onZoomChange} onReset={() => onZoomChange(100)} />
      )}
    </div>
  )
}

function EmptyEditor({ onCreateNote, isTrash }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8 select-none">
      <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
        <PenLine size={22} className="text-amber-400" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground mb-1">
          {isTrash ? 'Papelera' : 'Selecciona una nota'}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-48">
          {isTrash
            ? 'Selecciona una nota para restaurarla o eliminarla definitivamente'
            : 'Elige una nota de la lista o crea una nueva'}
        </p>
      </div>
      {onCreateNote && (
        <button
          onClick={onCreateNote}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors shadow-sm"
        >
          <Plus size={13} />
          Nueva nota
        </button>
      )}
    </div>
  )
}
