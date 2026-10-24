import { useState } from 'react'
import { FileText, Clock, Users, Archive, Trash2, Folder, FolderPlus, Plus, X } from 'lucide-react'
import { useNoteFolders, useCreateNoteFolder } from '../hooks/useNoteFolders.js'

const NAV_ITEMS = [
  { id: 'all',    label: 'Todas las notas', Icon: FileText },
  { id: 'recent', label: 'Recientes',        Icon: Clock },
  { id: 'shared', label: 'Compartidas',      Icon: Users },
  { id: 'archive', label: 'Archivo',         Icon: Archive },
  { id: 'trash',  label: 'Papelera',         Icon: Trash2 },
]

function NavItem({ label, Icon, isActive, onClick, count }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
        isActive
          ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 font-semibold'
          : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] font-medium'
      }`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-600 dark:text-amber-400' : 'text-[hsl(var(--muted-foreground))]'}`} />
      <span className="flex-1 text-left truncate">{label}</span>
      {count != null && (
        <span className={`text-[11px] tabular-nums ${isActive ? 'text-amber-500 dark:text-amber-400' : 'text-[hsl(var(--muted-foreground))]'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

export function NotesSidebar({ activeView, onViewChange }) {
  const { data: foldersData } = useNoteFolders()
  const createFolder = useCreateNoteFolder()
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)

  const folders = foldersData?.folders ?? []

  function handleCreateFolder(e) {
    e.preventDefault()
    if (!newFolderName.trim()) return
    createFolder.mutate({ name: newFolderName.trim() }, {
      onSuccess: () => {
        setNewFolderName('')
        setShowNewFolder(false)
      },
    })
  }

  return (
    <div className="flex flex-col h-full bg-[hsl(var(--muted)/0.4)] py-4 px-2 gap-0.5 overflow-y-auto">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))] px-3 mb-1.5">
        Notas
      </p>

      {NAV_ITEMS.map(({ id, label, Icon }) => (
        <NavItem
          key={id}
          label={label}
          Icon={Icon}
          isActive={activeView === id}
          onClick={() => onViewChange(id)}
        />
      ))}

      <div className="h-px bg-[hsl(var(--border))] my-3 mx-1" />

      <div className="flex items-center justify-between px-3 mb-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
          Carpetas
        </p>
        <button
          onClick={() => setShowNewFolder(v => !v)}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
          title="Nueva carpeta"
        >
          {showNewFolder ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
      </div>

      {showNewFolder && (
        <form onSubmit={handleCreateFolder} className="px-2 mb-2">
          <div className="flex items-center gap-1 bg-[hsl(var(--background))] border border-amber-300 dark:border-amber-700 rounded-lg px-2 py-1.5 shadow-sm">
            <FolderPlus className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <input
              autoFocus
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder="Nombre de carpeta..."
              className="flex-1 text-xs bg-transparent outline-none text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]"
              onKeyDown={e => e.key === 'Escape' && setShowNewFolder(false)}
            />
          </div>
        </form>
      )}

      {folders.length === 0 && !showNewFolder ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))] px-3 py-1">Sin carpetas</p>
      ) : (
        folders.map(folder => (
          <NavItem
            key={folder.id}
            label={folder.name}
            Icon={Folder}
            isActive={activeView === `folder:${folder.id}`}
            onClick={() => onViewChange(`folder:${folder.id}`)}
            count={folder.note_count ?? undefined}
          />
        ))
      )}
    </div>
  )
}
