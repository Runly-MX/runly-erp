import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, MoreHorizontal, Pencil, Trash2, Plus, Check } from 'lucide-react'
import {
  Button, ConfirmDialog, Input,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@runly/ui'
import { toast } from 'sonner'
import { useCreateStatus, useUpdateStatus, useDeleteStatus } from '../hooks/useProjectsData'

export const COLUMN_DRAG_PREFIX = 'col:'

const COLUMN_COLORS = [
  '#64748b', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899',
]

/**
 * One kanban column that can be dragged by its header grip. The grip is the only
 * drag activator (touch-none), so the rest of the column keeps scrolling on touch.
 */
export function SortableColumn({ status, count, projectId, children }) {
  const updateStatus = useUpdateStatus(projectId)
  const deleteStatus = useDeleteStatus(projectId)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(status.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${COLUMN_DRAG_PREFIX}${status.id}`,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  function save(field, value) {
    updateStatus.mutate(
      { statusId: status.id, [field]: value },
      { onError: () => toast.error('No se pudo guardar el cambio') },
    )
  }

  function commitName() {
    const t = name.trim()
    setEditing(false)
    if (t && t !== status.name) save('name', t)
    else setName(status.name)
  }

  function handleDelete() {
    deleteStatus.mutate(status.id, {
      onSuccess: () => { toast.success('Columna eliminada'); setConfirmDelete(false) },
      onError: () => toast.error('No se pudo eliminar la columna'),
    })
  }

  return (
    <div ref={setNodeRef} style={style} className="shrink-0 w-72 flex flex-col">
      <div className="flex items-center gap-1 mb-2 px-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="text-muted-foreground shrink-0 p-1.5 -ml-1.5 cursor-grab active:cursor-grabbing touch-none opacity-60 hover:opacity-100"
          aria-label="Reordenar columna"
        >
          <GripVertical size={14} />
        </button>
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: status.color }} />
        {editing ? (
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName()
              if (e.key === 'Escape') { setName(status.name); setEditing(false) }
            }}
            className="h-7 text-xs flex-1"
          />
        ) : (
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground truncate flex-1">
            {status.name}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{count}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground p-1.5 -mr-1.5 rounded"
              aria-label="Opciones de columna"
            >
              <MoreHorizontal size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => { setName(status.name); setEditing(true) }} className="gap-2">
              <Pencil size={14} />
              Renombrar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">Color</DropdownMenuLabel>
            <div className="grid grid-cols-5 gap-2 px-2 pb-2">
              {COLUMN_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { if (c !== status.color) save('color', c) }}
                  className="w-6 h-6 rounded-full flex items-center justify-center border border-border"
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                >
                  {c === status.color && <Check size={12} className="text-white" />}
                </button>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={status.isDefault}
              onSelect={() => setConfirmDelete(true)}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <Trash2 size={14} />
              {status.isDefault ? 'Columna por defecto' : 'Eliminar'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {children}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar columna"
        description={`Las tareas en "${status.name}" se moveran a la columna por defecto.`}
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
      />
    </div>
  )
}

/** Trailing "new column" slot at the end of the board. */
export function AddColumn({ projectId }) {
  const createStatus = useCreateStatus(projectId)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  function close() { setOpen(false); setName('') }

  function submit(e) {
    e.preventDefault()
    const t = name.trim()
    if (!t) return
    createStatus.mutate(
      { name: t, color: '#64748b' },
      {
        onSuccess: () => { close(); toast.success('Columna creada') },
        onError: () => toast.error('No se pudo crear la columna'),
      },
    )
  }

  return (
    <div className="shrink-0 w-72">
      {open ? (
        <form onSubmit={submit} className="bg-muted/50 rounded-lg p-2 space-y-2">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && close()}
            placeholder="Nombre de la columna..."
          />
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={!name.trim() || createStatus.isPending}>
              Agregar
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={close}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/50 rounded-lg px-3 py-2.5 transition-colors"
        >
          <Plus size={14} />
          Nueva columna
        </button>
      )}
    </div>
  )
}
