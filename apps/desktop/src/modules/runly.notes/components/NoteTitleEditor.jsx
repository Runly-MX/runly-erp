import { useEffect, useRef, useState } from 'react'
import { Shapes } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@runly/ui'
import { NoteIcon } from '../noteIcons.jsx'
import { noteAccentColor } from '../lib/noteColors.js'
import { useIsDark } from '../hooks/useIsDark.js'
import { NoteIconPickerContent } from './NoteIconPicker.jsx'

// Inline icon + title editor for the Panel 2 header. Click the icon to pick one,
// click the title to rename (Enter / blur commits, Esc cancels). Used for canvas
// notes, which — unlike document notes — have no in-editor title/icon.
export function NoteTitleEditor({ note, onUpdate }) {
  const isDark = useIsDark()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note?.title ?? '')
  const inputRef = useRef(null)

  useEffect(() => {
    if (!editing) setDraft(note?.title ?? '')
  }, [note?.title, editing])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  function commit() {
    setEditing(false)
    const next = draft.trim()
    if (next !== (note?.title ?? '').trim()) onUpdate({ title: next })
  }

  return (
    <div className="flex-1 flex items-center gap-1.5 min-w-0">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Cambiar icono"
            className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center hover:bg-muted transition-colors"
          >
            {note?.icon ? (
              <NoteIcon name={note.icon} size={14} className="text-amber-500" color={noteAccentColor(note.background_color, isDark)} />
            ) : (
              <Shapes size={14} className="text-muted-foreground" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-84 p-3" side="bottom" align="start">
          <NoteIconPickerContent value={note?.icon} onChange={(icon) => onUpdate({ icon })} />
        </PopoverContent>
      </Popover>

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setDraft(note?.title ?? '')
              setEditing(false)
            }
          }}
          placeholder="Sin titulo"
          className="flex-1 min-w-0 bg-transparent border-b border-amber-400 text-xs text-foreground focus:outline-none py-0.5"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Cambiar nombre"
          className="flex-1 min-w-0 text-left text-xs text-muted-foreground hover:text-foreground truncate py-0.5"
        >
          {note?.title || 'Sin titulo'}
        </button>
      )}
    </div>
  )
}
