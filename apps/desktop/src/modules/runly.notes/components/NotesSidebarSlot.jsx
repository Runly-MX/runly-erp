import { useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, FolderOpen } from 'lucide-react'
import { useNoteFolders, useCreateNoteFolder } from '../hooks/useNoteFolders.js'

export function NotesSidebarSlot() {
  const navigate    = useNavigate()
  const [searchParams] = useSearchParams()
  const activeFolderId = searchParams.get('folder')

  const { data } = useNoteFolders()
  const folders = data?.folders ?? []

  const createFolder = useCreateNoteFolder()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName]   = useState('')
  const inputRef = useRef(null)

  function startCreating() {
    setCreating(true)
    setTimeout(() => inputRef.current?.focus(), 40)
  }

  function commitCreate() {
    const name = newName.trim()
    setCreating(false)
    setNewName('')
    if (!name) return
    createFolder.mutate({ name })
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); commitCreate() }
    if (e.key === 'Escape') { setCreating(false); setNewName('') }
  }

  function handleFolderClick(folderId) {
    navigate(`/app/m/runly.notes/notes?folder=${folderId}`)
  }

  return (
    <div className="px-2 pt-2.5 pb-2">
      <div className="flex items-center gap-1 px-1.5 mb-1.5">
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]/70">
          Carpetas
        </span>
        <button type="button"
          onClick={startCreating}
          title="Nueva carpeta"
          className="h-5 w-5 flex items-center justify-center rounded hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          <Plus size={11} />
        </button>
      </div>

      {creating && (
        <div className="px-1 mb-1">
          <input
            ref={inputRef}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitCreate}
            placeholder="Nombre..."
            className="w-full text-xs px-2 py-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
      )}

      {folders.length === 0 && !creating ? (
        <p className="px-1.5 text-xs text-[hsl(var(--muted-foreground))]/60 leading-none">Sin carpetas</p>
      ) : (
        folders.map(folder => {
          const isActive = activeFolderId === folder.id
          return (
            <button type="button"
              key={folder.id}
              onClick={() => handleFolderClick(folder.id)}
              style={isActive
                ? { backgroundColor: '#f59e0b14', borderLeft: '2px solid #f59e0b' }
                : { borderLeft: '2px solid transparent' }
              }
              className={`w-full flex items-center gap-2 px-2 h-8 rounded-lg transition-colors text-left ${
                isActive
                  ? 'text-[hsl(var(--foreground))] font-medium'
                  : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]'
              }`}
            >
              <FolderOpen size={13} className="shrink-0 text-amber-500/70" />
              <span className="truncate text-xs">{folder.name}</span>
            </button>
          )
        })
      )}
    </div>
  )
}
