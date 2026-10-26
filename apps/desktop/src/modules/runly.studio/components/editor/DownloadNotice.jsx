import { Button, cn } from '@runly/ui'
import { AlertTriangle, Check, Download, Loader2, X } from 'lucide-react'

// Download progress over the canvas, one line so it never covers the design.
// Phases are real steps of the flow; no time estimates are invented.
const TEXT = {
  preparing: 'Preparando el archivo…',
  processing: 'Procesando el PDF en el servidor…',
  downloading: 'Descargando…',
}

export function DownloadNotice({ download, onCancel, onClose }) {
  if (!download) return null
  const { phase, format, file, message } = download, active = phase in TEXT
  const Icon = phase === 'error' ? AlertTriangle : phase === 'done' ? Check : phase === 'cancelled' ? X : active ? Loader2 : Download
  const text = active ? TEXT[phase] : phase === 'done' ? `Se descargó ${file}.` : phase === 'cancelled' ? 'Descarga cancelada. No se guardó ningún archivo.' : message
  return (
    <div role={phase === 'error' ? 'alert' : 'status'} aria-live={phase === 'error' ? 'assertive' : 'polite'}
      className={cn('pointer-events-auto flex max-w-lg items-center gap-2.5 rounded-lg border bg-[hsl(var(--card))] px-3 py-2 text-sm shadow-lg', phase === 'error' ? 'border-[hsl(var(--destructive)/0.5)]' : 'border-[hsl(var(--border))]')}>
      <Icon className={cn('h-4 w-4 shrink-0', active && 'animate-spin motion-reduce:animate-none', phase === 'error' && 'text-[hsl(var(--destructive))]', phase === 'done' && 'text-emerald-600 dark:text-emerald-400')} aria-hidden />
      <span className="min-w-0 flex-1">
        {phase === 'error' ? <span className="mr-1 font-semibold">No se pudo descargar{format ? ` el ${format}` : ''}.</span> : null}{phase === 'error' ? ' ' : null}{text}
      </span>
      {active && phase !== 'downloading' ? <Button size="sm" variant="ghost" onClick={onCancel} className="h-7 shrink-0 px-2 text-xs">Cancelar</Button> : null}
      {!active ? <Button size="icon" variant="ghost" aria-label="Cerrar aviso de descarga" onClick={onClose} className="h-7 w-7 shrink-0"><X className="h-4 w-4" aria-hidden /></Button> : null}
    </div>
  )
}
