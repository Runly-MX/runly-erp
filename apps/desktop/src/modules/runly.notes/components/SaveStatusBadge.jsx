import { Check, Loader2, AlertTriangle, CloudOff } from 'lucide-react'
import { useSaveStatus } from '../hooks/useSaveStatus.js'

const STATUS = {
  saved: { Icon: Check, label: 'Guardado', className: 'text-muted-foreground' },
  saving: { Icon: Loader2, label: 'Guardando...', className: 'text-muted-foreground', spin: true },
  error: { Icon: AlertTriangle, label: 'Error al guardar', className: 'text-destructive' },
  offline: { Icon: CloudOff, label: 'Sin conexion', className: 'text-muted-foreground' },
}

// Autosave indicator for the editor panel header. The editor publishes the
// status through lib/saveStatus.js; this only renders it.
export function SaveStatusBadge({ noteId }) {
  const status = useSaveStatus(noteId)
  const { Icon, label, className, spin } = STATUS[status] ?? STATUS.saved
  return (
    <span
      aria-live="polite"
      title={label}
      className={`flex items-center gap-1 px-1.5 text-xs select-none ${className}`}
    >
      <Icon size={13} className={spin ? 'animate-spin' : undefined} />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </span>
  )
}
