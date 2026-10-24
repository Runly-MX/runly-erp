import { useState, useCallback, useEffect, useMemo } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { patchNoteInCache, toNoteRowPatch } from './lib/noteCache.js'
import { flattenPages } from './lib/notesPages.js'
import {
  Plus, RotateCcw, Trash2,
  FileText, Shapes, ChevronLeft, ChevronRight, LayoutGrid,
} from 'lucide-react'
import {
  ConfirmDialog, useViewMode,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@runly/ui'
import { useNotes, useInfiniteNotes, useCreateNote } from './hooks/useNotes.js'
import { useCreateSubpage, useFetchNote } from './hooks/useSubpages.js'
import {
  useNote, useUpdateNote, useTrashNote, useLeaveNote, useRestoreNote, usePermanentDeleteNote, isNoteOwner,
} from './hooks/useNote.js'
import { useAuth } from '../../auth/AuthProvider'
import { usePublishNote, useUnpublishNote } from './hooks/useNoteShares.js'
import { useIsDark } from './hooks/useIsDark.js'
import { NotesList } from './components/NotesList.jsx'
import { NoteEditorPanel } from './components/NoteEditorPanel.jsx'
import { NotesHome } from './home/NotesHome.jsx'
import { useNotesLayout } from './hooks/useNotesLayout.js'
import { NoteSettingsPanel } from './components/NoteSettingsPanel.jsx'
import { NoteShareModal } from './components/NoteShareModal.jsx'
import { useNoteZoom } from './hooks/useNoteZoom.js'
import { useMiraiRecordContext } from '../runly.chat/lib/miraiPageContext'
import { nextSelectedNote } from './lib/stableNoteIdentity.js'

function viewFromPath(pathname) {
  if (pathname.endsWith('/notes/recent')) return 'recent'
  if (pathname.endsWith('/notes/shared')) return 'shared'
  if (pathname.endsWith('/notes/trash'))  return 'trash'
  if (pathname.endsWith('/notes/archive')) return 'archive'
  return 'all'
}

const NOTES_LIST_COLLAPSED_KEY = 'atlas:v1:notes-list-collapsed'

function getListCollapsed() {
  try {
    return localStorage.getItem(NOTES_LIST_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function persistListCollapsed(val) {
  try {
    localStorage.setItem(NOTES_LIST_COLLAPSED_KEY, val ? '1' : '0')
  } catch {
    // localStorage unavailable (private mode, etc.) — collapse still works
    // for the session, it just won't persist across reloads.
  }
}

export default function NotesScreen() {
  const { pathname } = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeView = viewFromPath(pathname)
  const folderId   = searchParams.get('folder')
  const urlNoteId  = searchParams.get('note')
  const isTrashView = activeView === 'trash'
  const [layout, setLayout] = useNotesLayout()
  const isHome = layout === 'home'

  const [selectedNote, setSelectedNote] = useState(null)
  const queryClient = useQueryClient()
  useMiraiRecordContext({ recordType: 'note', recordId: selectedNote?.id, label: selectedNote?.title })
  const [viewingNoteId, setViewingNoteId] = useState(null)
  const viewOnly = viewingNoteId === selectedNote?.id
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shareOpen, setShareOpen]       = useState(false)
  const [restoreOpen, setRestoreOpen]   = useState(false)
  const [deleteOpen, setDeleteOpen]     = useState(false)
  const [noteToAction, setNoteToAction] = useState(null)
  const [removeTarget, setRemoveTarget] = useState(null)
  const [bulkTrash, setBulkTrash] = useState(null) // { notes, done }
  const { session } = useAuth()
  const userId = session?.user?.id ?? null
  const removeTargetIsOwned = isNoteOwner(removeTarget, userId)
  const [mobileView, setMobileView]     = useState('list')
  const [listCollapsed, setListCollapsed] = useState(getListCollapsed)
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = () => setIsDesktop(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const effectiveListCollapsed = listCollapsed && isDesktop

  const viewMode = useViewMode()
  const isZenMode = viewMode.isImmersive
  const [zoom, setZoom] = useNoteZoom()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => clearTimeout(handle)
  }, [search])

  const stepBackView = viewMode.stepBack
  useEffect(() => {
    if (!isZenMode) return
    function onKeyDown(e) {
      if (e.key === 'Escape' && !e.defaultPrevented) stepBackView()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isZenMode, stepBackView])

  // Restore selected note from URL on mount / page reload
  const { data: urlNoteData } = useNote(urlNoteId)
  useEffect(() => {
    if (urlNoteData?.note && !selectedNote) {
      setSelectedNote(urlNoteData.note)
      setMobileView('editor')
    }
  // Only run when the fetched note data arrives — not on every selectedNote change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlNoteData?.note?.id])

  // Keep selectedNote in sync with server after any mutation invalidates ['notes', id]
  const { data: liveNoteData } = useNote(selectedNote?.id)
  useEffect(() => {
    if (liveNoteData?.note && liveNoteData.note.id === selectedNote?.id) {
      setSelectedNote((prev) => nextSelectedNote(prev, liveNoteData.note))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveNoteData])

  // Home grid pages through useInfiniteNotes; the split list and the "recent"
  // view keep the single-page query.
  const useGrid = isHome && activeView !== 'recent'
  const queryParams = buildQueryParams(activeView, folderId, debouncedSearch)
  const gridQuery = useInfiniteNotes(queryParams, { enabled: useGrid })
  const listQuery = useNotes(queryParams, { enabled: !useGrid })
  const notes = useMemo(
    () => (useGrid ? flattenPages(gridQuery.data?.pages) : (listQuery.data?.notes ?? [])),
    [useGrid, gridQuery.data, listQuery.data],
  )
  const isLoading = useGrid ? gridQuery.isLoading : listQuery.isLoading
  const isListError = useGrid ? gridQuery.isError : listQuery.isError
  const refetchList = () => (useGrid ? gridQuery.refetch() : listQuery.refetch())
  const canLoadMore = useGrid && Boolean(gridQuery.hasNextPage)

  const isDark = useIsDark()

  const createNote      = useCreateNote()
  const updateNote      = useUpdateNote()
  const trashNote       = useTrashNote()
  const leaveNote       = useLeaveNote()
  const restoreNote     = useRestoreNote()
  const permanentDelete = usePermanentDeleteNote()
  const publishNote     = usePublishNote()
  const { createSubpage, isCreating: creatingSubpage } = useCreateSubpage()
  const fetchNote        = useFetchNote()
  const unpublishNote   = useUnpublishNote()

  function setNoteParam(noteId) {
    setSearchParams(p => {
      const next = new URLSearchParams(p)
      if (noteId) next.set('note', noteId)
      else next.delete('note')
      return next
    })
  }

  function handleCreateNote(noteType = 'document') {
    createNote.mutate(
      {
        title: noteType === 'canvas' ? 'Nuevo lienzo' : 'Nueva nota',
        content: noteType === 'canvas' ? '' : '<p></p><p></p>',
        noteType,
      },
      {
        onSuccess: (res) => {
          if (res?.note) {
            setSelectedNote(res.note)
            setViewingNoteId(null)
            setNoteParam(res.note.id)
            setMobileView('editor')
          }
        },
        onError: (err) => toast.error(err?.message ?? 'No se pudo crear la nota.'),
      },
    )
  }

  const handleUpdateNote = useCallback((patch) => {
    if (!selectedNote) return
    // Optimistic update so the UI reacts instantly: the open note (title bar,
    // bg color, etc.) and every cached list showing it.
    const localPatch = toNoteRowPatch(patch)
    setSelectedNote(prev => prev ? { ...prev, ...localPatch } : prev)
    patchNoteInCache(queryClient, selectedNote.id, patch)
    updateNote.mutate(
      { noteId: selectedNote.id, data: patch },
      {
        onSuccess: (res) => { if (res?.note) setSelectedNote(res.note) },
        onError: () => queryClient.invalidateQueries({ queryKey: ['notes'] }),
      },
    )
  }, [selectedNote, updateNote, queryClient])

  function clearSelection() {
    setSelectedNote(null)
    setNoteParam(null)
    setMobileView('list')
  }

  function changeLayout(next) {
    // Leaving the split view for the grid closes any open note first.
    if (next === 'home') clearSelection()
    setLayout(next)
  }

  // Confirmed bulk removal: owned notes go to the trash, shared ones are left.
  async function handleBulkTrash() {
    const target = bulkTrash
    setBulkTrash(null)
    if (!target) return
    await Promise.all(target.notes.map((n) =>
      (isNoteOwner(n, userId) ? trashNote : leaveNote).mutateAsync(n.id).catch(() => null)))
    target.done?.()
  }

  function clearIfSelected(target) {
    if (selectedNote?.id === target.id) {
      setSelectedNote(null)
      setNoteParam(null)
      setMobileView('list')
    }
  }

  // Already-confirmed removal: the owner trashes the note; a collaborator only
  // leaves it (drops their share) — they must never delete the owner's note.
  function handleRemove(note) {
    const target = note ?? selectedNote
    if (!target) return
    const mutation = isNoteOwner(target, userId) ? trashNote : leaveNote
    mutation.mutate(target.id, { onSuccess: () => clearIfSelected(target) })
  }

  function selectNote(note) {
    setViewingNoteId(null)
    setSelectedNote(note)
    setNoteParam(note.id)
    setMobileView('editor')
  }

  // Breadcrumb / sub-page strip entries only know an id: fetch the full row so
  // the editor never mounts with a partial note.
  async function openNoteById(noteId) {
    try {
      const note = await fetchNote(noteId)
      if (note) selectNote(note)
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo abrir la nota.')
    }
  }

  async function handleCreateSubpage() {
    if (!selectedNote) return
    try {
      const note = await createSubpage(selectedNote.id)
      if (note) selectNote(note)
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo crear la subpagina.')
    }
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">

      {/* Panel 1: card grid (home) or note list (split) */}
      {isHome ? (
        <div
          {...(isZenMode ? { inert: '' } : {})}
          aria-hidden={isZenMode || undefined}
          className={`${selectedNote ? 'hidden' : 'flex'} min-w-0 flex-1`}
        >
          <NotesHome
            notes={notes}
            isLoading={isLoading}
            isError={isListError}
            onRetry={refetchList}
            view={activeView}
            folderActive={Boolean(folderId)}
            search={search}
            onSearchChange={setSearch}
            onOpen={selectNote}
            onCreateCanvas={() => handleCreateNote('canvas')}
            onTrash={setRemoveTarget}
            onBulkTrash={(list, done) => setBulkTrash({ notes: list, done })}
            onToggleLayout={() => changeLayout('split')}
            canLoadMore={canLoadMore}
            loadingMore={gridQuery.isFetchingNextPage}
            onLoadMore={() => gridQuery.fetchNextPage()}
            isDark={isDark}
          />
        </div>
      ) : (
      <div
        {...(isZenMode ? { inert: '' } : {})}
        aria-hidden={isZenMode || undefined}
        className={[
          'shrink-0 border-r border-border flex flex-col bg-background',
          effectiveListCollapsed ? 'w-full lg:w-12' : 'w-full lg:w-72',
          mobileView === 'list' ? 'flex' : 'hidden lg:flex',
        ].join(' ')}
      >

        <div className={`flex items-center gap-2 h-11 border-b border-border shrink-0 ${effectiveListCollapsed ? 'justify-center px-1' : 'px-3'}`}>
          {!effectiveListCollapsed && (
            <span className="flex-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {folderId ? 'Carpeta' : VIEW_LABELS[activeView]}
            </span>
          )}
          {!effectiveListCollapsed && !isTrashView && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={createNote.isPending}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors disabled:opacity-50 shadow-sm"
                >
                  <Plus size={13} />
                  <span>Nueva</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => handleCreateNote('document')}>
                  <FileText size={13} className="mr-2" /> Documento
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleCreateNote('canvas')}>
                  <Shapes size={13} className="mr-2" /> Lienzo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button
            onClick={() => {
              const next = !listCollapsed
              setListCollapsed(next)
              persistListCollapsed(next)
            }}
            className="hidden lg:flex p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title={effectiveListCollapsed ? 'Expandir lista' : 'Colapsar lista'}
          >
            {effectiveListCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
          {!effectiveListCollapsed && (
            <button
              onClick={() => changeLayout('home')}
              className="hidden lg:flex p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title="Vista de tarjetas"
              aria-label="Vista de tarjetas"
            >
              <LayoutGrid size={15} />
            </button>
          )}
        </div>

        {!effectiveListCollapsed && (
          <>
            <NotesList
              notes={notes}
              selectedNoteId={selectedNote?.id}
              onSelect={selectNote}
              onTrash={!isTrashView ? setRemoveTarget : undefined}
              isLoading={isLoading}
              showTrash={isTrashView}
              search={search}
              onSearchChange={setSearch}
            />

            {isTrashView && selectedNote && (
              <div className="px-3 py-2 border-t border-border flex gap-2 shrink-0">
                <button
                  onClick={() => { setNoteToAction(selectedNote); setRestoreOpen(true) }}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 border border-border rounded-lg hover:bg-muted text-foreground transition-colors"
                >
                  <RotateCcw size={13} />
                  Restaurar
                </button>
                <button
                  onClick={() => { setNoteToAction(selectedNote); setDeleteOpen(true) }}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 border border-red-200 dark:border-red-900/50 text-red-500 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <Trash2 size={13} />
                  Eliminar
                </button>
              </div>
            )}
          </>
        )}
      </div>
      )}

      {/* Panel 2: Editor / Settings. Split layout: a pane next to the list. Home layout: a full page that replaces the grid (the grid is shown again with the back button). */}
      {(isHome ? Boolean(selectedNote) : true) && (
        <div className="contents">
          <NoteEditorPanel
            note={selectedNote}
            isTrashView={isTrashView}
            isZenMode={isZenMode}
            isDark={isDark}
            viewMode={viewMode}
            viewOnly={viewOnly}
            onToggleViewOnly={() => setViewingNoteId(viewOnly ? null : selectedNote.id)}
            zoom={zoom}
            onZoomChange={setZoom}
            settingsOpen={settingsOpen}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenShare={() => setShareOpen(true)}
            onUpdate={handleUpdateNote}
            onBack={isHome ? clearSelection : () => setMobileView('list')}
            backOnDesktop={isHome}
            onCreateNote={() => handleCreateNote('document')}
            onOpenNote={openNoteById}
            onCreateSubpage={handleCreateSubpage}
            creatingSubpage={creatingSubpage}
            onRestore={isHome ? () => { setNoteToAction(selectedNote); setRestoreOpen(true) } : undefined}
            onDeleteForever={isHome ? () => { setNoteToAction(selectedNote); setDeleteOpen(true) } : undefined}
            className={
              isHome || mobileView === 'editor' || isZenMode ? 'flex' : 'hidden lg:flex'
            }
          />
        </div>
      )}

      {selectedNote && (
        <NoteShareModal note={selectedNote} open={shareOpen} onOpenChange={setShareOpen} />
      )}

      {selectedNote && (
        <NoteSettingsPanel
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          note={selectedNote}
          onUpdate={handleUpdateNote}
          onPublish={() => publishNote.mutate(selectedNote.id, { onSuccess: r => r?.note && setSelectedNote(r.note) })}
          onUnpublish={() => unpublishNote.mutate(selectedNote.id, { onSuccess: r => r?.note && setSelectedNote(r.note) })}
          isOwner={isNoteOwner(selectedNote, userId)}
          onTrash={() => { setSettingsOpen(false); handleRemove(selectedNote) }}
        />
      )}

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null) }}
        title={removeTargetIsOwned ? 'Enviar nota a papelera' : 'Salir de la nota'}
        description={removeTargetIsOwned
          ? 'La nota se movera a la papelera para ti y para todos con quienes la compartiste. Puedes restaurarla desde alli.'
          : 'La nota dejara de aparecer en tu lista. No se elimina para su propietario ni para los demas colaboradores.'}
        confirmLabel={removeTargetIsOwned ? 'Mover a papelera' : 'Salir de la nota'}
        onConfirm={() => {
          const target = removeTarget
          setRemoveTarget(null)
          handleRemove(target)
        }}
      />

      <ConfirmDialog
        open={Boolean(bulkTrash)}
        onOpenChange={(open) => { if (!open) setBulkTrash(null) }}
        title="Quitar notas"
        description={`Se enviaran a la papelera las notas propias (${bulkTrash?.notes.filter((n) => isNoteOwner(n, userId)).length ?? 0}) y saldras de las compartidas. Total: ${bulkTrash?.notes.length ?? 0} notas.`}
        confirmLabel="Continuar"
        onConfirm={handleBulkTrash}
      />

      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title="Restaurar nota"
        description="La nota se movera de vuelta a tu lista de notas activas."
        confirmLabel="Restaurar"
        onConfirm={() => {
          setRestoreOpen(false)
          if (noteToAction) restoreNote.mutate(noteToAction.id, {
            onSuccess: () => { setSelectedNote(null); setNoteParam(null) }
          })
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Eliminar nota permanentemente"
        description="Esta accion no se puede deshacer. La nota se eliminara para siempre."
        confirmLabel="Eliminar permanentemente"
        onConfirm={() => {
          setDeleteOpen(false)
          if (noteToAction) permanentDelete.mutate(noteToAction.id, {
            onSuccess: () => { setSelectedNote(null); setNoteParam(null) }
          })
        }}
      />
    </div>
  )
}

const VIEW_LABELS = {
  all:    'Todas las notas',
  recent: 'Recientes',
  shared: 'Compartidas',
  archive: 'Archivo',
  trash:  'Papelera',
}

function buildQueryParams(view, folderId, q) {
  const base =
    view === 'trash'   ? { trashed: true } :
    view === 'archive' ? { archived: true } :
    view === 'recent'  ? { pageSize: 20 } :
    view === 'shared'  ? { shared: true } :
    folderId           ? { folderId } :
    {}
  return q ? { ...base, q } : base
}
