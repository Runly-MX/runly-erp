import { useRef, useState } from 'react'
import { Input } from '@runly/ui'
import { Pencil } from 'lucide-react'
import { EDITABLE_ITEM_FIELDS, isEditedField } from '../../lib/custody-api.js'

// Inline editor for one snapshot field of a custody row (spec §10.2): click
// to edit, Enter or blur saves, Esc cancels. Hand-edited cells carry a small
// dot; leaving the cell empty restores the item's own value.
export function CustodyEditableCell({ row, field, label, mono = false, clamp = false, disabled = false, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const cancelled = useRef(false)
  const value = row[field] ?? ''
  const edited = isEditedField(row, field)

  function start() {
    if (disabled) return
    cancelled.current = false
    setDraft(value)
    setEditing(true)
  }

  function finish() {
    setEditing(false)
    if (cancelled.current) return
    onSave?.(row, field, draft)
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        maxLength={EDITABLE_ITEM_FIELDS[field]}
        aria-label={label}
        placeholder="Vacío: usar el dato del artículo"
        className={`h-8 min-w-[9rem] px-2 text-sm sm:text-xs ${mono ? 'font-mono' : ''}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
          if (e.key === 'Escape') { e.preventDefault(); cancelled.current = true; e.currentTarget.blur() }
        }}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled}
      title={edited ? 'Editado a mano. Clic para cambiar; vacío restaura el dato del artículo.' : 'Clic para editar'}
      aria-label={`Editar ${label}`}
      className="group -mx-1.5 flex w-[calc(100%+0.75rem)] min-w-0 items-start gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      <span className={`min-w-0 flex-1 ${mono ? 'font-mono text-xs' : ''} ${clamp ? 'line-clamp-2' : ''} ${value ? '' : 'text-[hsl(var(--muted-foreground))]'}`}>
        {value || '—'}
      </span>
      {edited ? <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Editado a mano" /> : null}
      <Pencil className="mt-0.5 h-3 w-3 shrink-0 text-[hsl(var(--muted-foreground))] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
    </button>
  )
}
