import { lazy, Suspense } from 'react'
import {
  Plus, ArrowLeft, Settings2, Share2, RotateCcw, Trash2, PenLine,
  Maximize2, Minimize2, Fullscreen, Eye, PanelTop, MoreVertical,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, useCoarsePointer,
} from '@runly/ui'
import { useAuth } from '../../../auth/AuthProvider'
import { NoteIcon } from '../noteIcons.jsx'
import { DARK_BG_MAP, noteAccentColor } from '../lib/noteColors.js'
import { NoteEditor } from './NoteEditor.jsx'
import { NoteTitleEditor } from './NoteTitleEditor.jsx'
import { ZoomControl } from './ZoomControl.jsx'
import { SaveStatusBadge } from './SaveStatusBadge.jsx'
import { NoteBreadcrumb } from './NoteBreadcrumb.jsx'
import { SubpagesStrip } from './SubpagesStrip.jsx'
import { useNoteAncestors } from '../hooks/useSubpages.js'
import { canCreateSubpageAtDepth, canEditNote, MAX_DEPTH_HINT } from '../lib/subpages.js'

// Lazy so the Excalidraw bundle only loads when a canvas note is opened.
const CanvasEditor = lazy(() =>
  import('./CanvasEditor.jsx').then((m) => ({ default: m.CanvasEditor })),
)

// Browser fullscreen is offered only where the API exists (not on iOS Safari).
const canFullscreen = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled)

// Editor pane (header + editor/canvas + zoom). Used by the split layout and,
// as a full page, by the quick-notes home layout.
export function NoteEditorPanel({
  note, isTrashView, isZenMode, isDark, viewMode,
  viewOnly, onToggleViewOnly, zoom, onZoomChange,
  settingsOpen, onOpenSettings, onOpenShare, onUpdate,
  onBack, backOnDesktop = false, onCreateNote,
  onRestore, onDeleteForever,
  onOpenNote, onCreateSubpage, creatingSubpage = false,
  className = '',
}) {
  const isCanvasNote = note?.note_type === 'canvas'
  const { userProfile } = useAuth()
  const coarse = useCoarsePointer()
  const ancestors = useNoteAncestors(note)
  const hasCrumbs = ancestors.length > 0
  const canCreateSubpage = Boolean(note) && !isTrashView && !viewOnly && canEditNote(note, userProfile?.id)
  const depthBlocked = !canCreateSubpageAtDepth(ancestors.length)
  // One entry point for the strip, toolbar and slash command.
  function handleCreateSubpage() {
    if (depthBlocked) { toast.error(`No se pueden anidar mas de 3 niveles. (${MAX_DEPTH_HINT})`); return }
    if (!creatingSubpage) onCreateSubpage?.()
  }

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
      style={isZenMode ? { ...canvasBg, '--shell-footer-height': '0px', paddingTop: 'var(--sat, 0px)', paddingBottom: 'var(--sab, 0px)' } : canvasBg}
    >
      <div className="flex items-center gap-2 px-3 h-11 border-b border-border shrink-0 bg-background/95 backdrop-blur-sm">
        <button
          className={`${backOnDesktop ? '' : 'lg:hidden '}p-1 [@media(pointer:coarse)]:p-3 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors`}
          onClick={onBack}
          aria-label="Volver a la lista"
        >
          <ArrowLeft size={15} />
        </button>

        {note && !isTrashView && note.note_type === 'canvas' ? (
          <NoteTitleEditor note={note} onUpdate={onUpdate} />
        ) : hasCrumbs && !isCanvasNote ? (
          <NoteBreadcrumb note={note} ancestors={ancestors} onOpenNote={onOpenNote} />
        ) : (
          <span className="flex-1 flex items-center gap-1.5 min-w-0 text-xs text-muted-foreground truncate">
            {note?.icon && (
              <NoteIcon name={note.icon} size={13} className="text-amber-500 shrink-0" color={noteAccentColor(note.background_color, isDark)} />
            )}
            {note ? (note.title || 'Sin titulo') : ''}
          </span>
        )}

        {note && (
          <div className="flex items-center gap-0.5">
            <SubpagesStrip
              key={note.id}
              note={note}
              canCreate={canCreateSubpage}
              depthBlocked={depthBlocked}
              creating={creatingSubpage}
              onOpenNote={onOpenNote}
              onCreate={handleCreateSubpage}
            />
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
                className="touch-target"
                aria-label={viewOnly ? 'Editar nota' : 'Ver nota'}
                onClick={onToggleViewOnly}
              >
                {viewOnly ? <PenLine size={14} /> : <Eye size={14} />}
                <span className="hidden sm:inline">{viewOnly ? 'Editar' : 'Ver'}</span>
              </Button>
            )}
            <button
              onClick={onOpenShare}
              type="button"
              aria-label="Compartir nota"
              className="hidden sm:flex items-center gap-1.5 px-2 py-1.5 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 [@media(pointer:coarse)]:justify-center text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg transition-colors"
            >
              <Share2 size={13} />
              <span className="hidden sm:inline">Compartir</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Mas opciones"
                  title="Mas opciones"
                  className="flex items-center gap-1.5 px-2 py-1.5 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 [@media(pointer:coarse)]:justify-center text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg transition-colors"
                >
                  <MoreVertical size={14} className="sm:hidden" />
                  <span className="hidden sm:inline">
                    {viewMode.isImmersive ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* Narrow screens: share and settings fold into this menu so
                    the header keeps room for the note title. */}
                <DropdownMenuItem className="sm:hidden" onSelect={onOpenShare}>
                  <Share2 size={13} className="mr-2" /> Compartir
                </DropdownMenuItem>
                <DropdownMenuItem className="sm:hidden" onSelect={onOpenSettings}>
                  <Settings2 size={13} className="mr-2" /> Ajustes de la nota
                </DropdownMenuItem>
                {viewMode.mode !== 'normal' && (
                  <DropdownMenuItem onSelect={() => viewMode.setMode('normal')}>
                    <PanelTop size={13} className="mr-2" /> Vista normal
                  </DropdownMenuItem>
                )}
                {viewMode.mode !== 'clean' && (
                  <DropdownMenuItem onSelect={() => viewMode.setMode('clean')}>
                    <Maximize2 size={13} className="mr-2" /> Vista despejada
                  </DropdownMenuItem>
                )}
                {canFullscreen && viewMode.mode !== 'fullscreen' && (
                  <DropdownMenuItem onSelect={() => viewMode.setMode('fullscreen')}>
                    <Fullscreen size={13} className="mr-2" /> Pantalla completa
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={onOpenSettings}
              type="button"
              aria-label="Ajustes de la nota"
              className={`hidden sm:flex items-center gap-1.5 px-2 py-1.5 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 [@media(pointer:coarse)]:justify-center text-xs font-medium rounded-lg transition-colors ${
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

      {hasCrumbs && isCanvasNote && (
        <div className="flex shrink-0 border-b border-border bg-background/95 px-3 py-1">
          <NoteBreadcrumb note={note} ancestors={ancestors} onOpenNote={onOpenNote} showCurrent={false} />
        </div>
      )}

      {!note ? (
        <EmptyEditor onCreateNote={!isTrashView ? onCreateNote : undefined} isTrash={isTrashView} />
      ) : (!isTrashView && note.note_type === 'canvas') ? (
        <Suspense fallback={
          <div className="h-full grid place-items-center text-sm text-muted-foreground">Cargando lienzo...</div>
        }>
          <CanvasEditor key={note.id} note={note} />
        </Suspense>
      ) : (
        <NoteEditor
          note={note}
          readOnly={isTrashView}
          viewOnly={viewOnly}
          zoom={zoom}
          onCreateSubpage={canCreateSubpage ? handleCreateSubpage : undefined}
        />
      )}

      {/* Touch editing: pinch zooms, and the floating control would sit on
          top of the formatting bar. */}
      {!isTrashView && !isCanvasNote && note && !(coarse && !viewOnly) && (
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
