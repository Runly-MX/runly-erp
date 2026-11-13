import { useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, FolderOpen, Share2, Users } from 'lucide-react'
import { useNoteFolders, useCreateNoteFolder } from '../hooks/useNoteFolders.js'
import { NoteShareModal } from './NoteShareModal.jsx'

export function NotesSidebarSlot() {
  const navigate    = useNavigate()
  const [searchParams] = useSearchParams()
  const activeFolderId = searchParams.get('folder')

  const { data } = useNoteFolders()
  const folders = data?.folders ?? []

  const createFolder = useCreateNoteFolder()
  const [shareFolder, setShareFolder] = useState(null)
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
            <div
              key={folder.id}
              style={isActive
                ? { backgroundColor: '#f59e0b14', borderLeft: '2px solid #f59e0b' }
                : { borderLeft: '2px solid transparent' }
              }
              className={`group flex items-center rounded-lg transition-colors ${
                isActive
                  ? 'text-[hsl(var(--foreground))] font-medium'
                  : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]'
              }`}
            >
              <button type="button"
                onClick={() => handleFolderClick(folder.id)}
                title={folder.is_shared_with_me ? `Compartida por ${folder.owner_display_name}` : undefined}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 h-8 text-left"
              >
                <FolderOpen size={13} className="shrink-0 text-amber-500/70" />
                <span className="truncate text-xs">{folder.name}</span>
                {folder.is_shared && <Users size={11} className="shrink-0 opacity-60" aria-label="Compartida" />}
              </button>
              {!folder.is_shared_with_me && (
                <button type="button"
                  onClick={() => setShareFolder(folder)}
                  title="Compartir carpeta"
                  aria-label="Compartir carpeta"
                  className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-[hsl(var(--background))] focus-visible:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100"
                >
                  <Share2 size={12} />
                </button>
              )}
            </div>
          )
        })
      )}

      {shareFolder && (
        <NoteShareModal folder={shareFolder} open onOpenChange={(o) => { if (!o) setShareFolder(null) }} />
      )}
    </div>
  )
}
