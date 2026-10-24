import { useMemo, useState } from 'react'
import { Archive, FileText, LayoutPanelLeft, Shapes, Trash2, Users } from 'lucide-react'
import { Button, EmptyState, PageHeader, SearchInput } from '@runly/ui'
import { useToggleNoteFlag } from '../hooks/useNote.js'
import { applyClientFilters, splitPinned } from '../lib/notesView.js'
import { NoteGridCard } from './NoteGridCard.jsx'
import { NotesFilters } from './NotesFilters.jsx'
import { NotesMasonry, SectionLabel } from './NotesMasonry.jsx'
import { NotesSelectionBar } from './NotesSelectionBar.jsx'
import { QuickComposer } from './QuickComposer.jsx'

const TITLES = {
  all: 'Todas las notas',
  recent: 'Recientes',
  shared: 'Compartidas',
  archive: 'Archivo',
  trash: 'Papelera',
}

const EMPTY = {
  all: { icon: FileText, title: 'Sin notas', description: 'Escribe tu primera nota en el cuadro de arriba.' },
  recent: { icon: FileText, title: 'Sin notas recientes', description: 'Las notas que edites apareceran aqui.' },
  shared: { icon: Users, title: 'Nada compartido', description: 'Las notas que compartan contigo apareceran aqui.' },
  archive: { icon: Archive, title: 'Archivo vacio', description: 'Archiva las notas que ya no uses para sacarlas de la vista principal.' },
  trash: { icon: Trash2, title: 'Papelera vacia', description: 'Las notas eliminadas apareceran aqui.' },
}

function GridSkeleton() {
  const heights = ['h-28', 'h-40', 'h-32', 'h-48', 'h-24', 'h-36']
  return (
    <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5" aria-busy="true">
      {heights.map((h, i) => (
        <div key={i} className={`mb-3 break-inside-avoid animate-pulse rounded-md bg-muted ${h}`} />
      ))}
    </div>
  )
}

export function NotesHome({
  notes, isLoading, view, folderActive = false, search, onSearchChange,
  onOpen, onCreateCanvas, onTrash, onBulkTrash, onToggleLayout,
  canLoadMore = false, loadingMore = false, onLoadMore, isDark = false,
}) {
  const toggleFlag = useToggleNoteFlag()
  const [filters, setFilters] = useState({})
  const [selectedIds, setSelectedIds] = useState(() => new Set())

  const isTrash = view === 'trash'
  const isArchive = view === 'archive'
  const showComposer = (view === 'all' || folderActive) && !isTrash
  const selectMode = selectedIds.size > 0

  const filtered = useMemo(() => applyClientFilters(notes, filters), [notes, filters])
  const { pinned, others } = useMemo(
    () => (isTrash || isArchive ? { pinned: [], others: filtered } : splitPinned(filtered)),
    [filtered, isTrash, isArchive],
  )
  const selectedNotes = useMemo(() => notes.filter((n) => selectedIds.has(n.id)), [notes, selectedIds])
  const ownedSelected = selectedNotes.filter((n) => n.is_owner !== false)
  const hasFilters = Object.values(filters).some(Boolean)

  function toggleSelect(note) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(note.id)) next.delete(note.id)
      else next.add(note.id)
      return next
    })
  }
  const clearSelection = () => setSelectedIds(new Set())

  const patchOne = (note, patch) => toggleFlag.mutate({ noteId: note.id, patch })
  const patchMany = (list, patch) =>
    Promise.all(list.map((n) => toggleFlag.mutateAsync({ noteId: n.id, patch }))).then(clearSelection, clearSelection)

  function bulkPin() {
    const allPinned = ownedSelected.length > 0 && ownedSelected.every((n) => n.is_pinned)
    patchMany(ownedSelected, { isPinned: !allPinned })
  }

  function renderCard(note) {
    const owned = note.is_owner !== false
    const canMutate = !isTrash
    return (
      <NoteGridCard
        note={note}
        isDark={isDark}
        selected={selectedIds.has(note.id)}
        selectMode={selectMode}
        readOnly={!owned}
        onOpen={onOpen}
        onToggleSelect={isTrash ? undefined : toggleSelect}
        onPin={canMutate ? (n) => patchOne(n, { isPinned: !n.is_pinned }) : undefined}
        onArchive={canMutate ? (n) => patchOne(n, { isArchived: !n.is_archived }) : undefined}
        onColor={canMutate ? (n, hex) => patchOne(n, { backgroundColor: hex }) : undefined}
        onTrash={canMutate ? onTrash : undefined}
      />
    )
  }

  const empty = EMPTY[view] ?? EMPTY.all
  const noResults = !isLoading && notes.length > 0 && filtered.length === 0

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-background">
      <div className="shrink-0 px-4 pt-4">
        <PageHeader
          compact
          title={folderActive ? 'Carpeta' : (TITLES[view] ?? TITLES.all)}
          actions={(
            <>
              <Button type="button" size="sm" variant="ghost" onClick={onToggleLayout} className="hidden lg:inline-flex">
                <LayoutPanelLeft size={14} /> Vista de dos paneles
              </Button>
              {!isTrash && !isArchive && (
                <Button type="button" size="sm" variant="outline" onClick={onCreateCanvas}>
                  <Shapes size={14} /> Nuevo lienzo
                </Button>
              )}
            </>
          )}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {selectMode && (
          <NotesSelectionBar
            count={selectedIds.size}
            archiveView={isArchive}
            onClear={clearSelection}
            onPin={bulkPin}
            onArchive={() => patchMany(ownedSelected, { isArchived: !isArchive })}
            onColor={(hex) => patchMany(ownedSelected, { backgroundColor: hex })}
            onTrash={() => onBulkTrash?.(selectedNotes, clearSelection)}
          />
        )}

        <div className="mx-auto mb-4 max-w-xl">
          <SearchInput
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onClear={() => onSearchChange('')}
            placeholder="Buscar notas..."
          />
        </div>

        {showComposer && (
          <div className="mb-5">
            <QuickComposer onCreateCanvas={onCreateCanvas} isDark={isDark} />
          </div>
        )}

        {!isTrash && notes.length > 0 && (
          <div className="mb-4">
            <NotesFilters value={filters} onChange={setFilters} />
          </div>
        )}

        {isLoading ? (
          <GridSkeleton />
        ) : notes.length === 0 ? (
          <EmptyState
            icon={search ? undefined : empty.icon}
            title={search ? 'Sin resultados' : empty.title}
            description={search ? 'Intenta con otro termino de busqueda' : empty.description}
          />
        ) : noResults ? (
          <EmptyState
            title="Sin coincidencias"
            description={hasFilters ? 'Ninguna nota cargada cumple los filtros activos.' : 'No hay notas para mostrar.'}
            action={hasFilters ? { label: 'Quitar filtros', onClick: () => setFilters({}) } : undefined}
          />
        ) : (
          <div className="space-y-4">
            {pinned.length > 0 && (
              <section>
                <SectionLabel>Fijadas</SectionLabel>
                <NotesMasonry notes={pinned} renderCard={renderCard} />
              </section>
            )}
            {others.length > 0 && (
              <section>
                {pinned.length > 0 && <SectionLabel>Otras</SectionLabel>}
                <NotesMasonry notes={others} renderCard={renderCard} />
              </section>
            )}
            {canLoadMore && (
              <div className="flex justify-center pt-2">
                <Button type="button" variant="outline" onClick={onLoadMore} disabled={loadingMore}>
                  {loadingMore ? 'Cargando...' : 'Cargar mas'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
