import { useEffect, useState } from 'react'
import { Button, cn } from '@runly/ui'
import { Check, CloudOff, Loader2, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react'

// Four editor states (every change is shared automatically, no save button) plus
// the live-channel state: edits can be synced while the channel reconnects, in
// which case collaborators' changes may arrive late.
const STATES = {
  synced: { icon: Check, text: 'Sincronizado', tone: 'text-emerald-600 dark:text-emerald-400' },
  syncing: { icon: Loader2, text: 'Sincronizando…', tone: 'animate-spin motion-reduce:animate-none' },
  offline: { icon: CloudOff, text: 'Sin conexión', detail: 'Tus cambios se conservan y se enviarán al reconectar.', tone: 'text-amber-600 dark:text-amber-400', retry: true },
  error: { icon: TriangleAlert, text: 'Error al sincronizar', detail: 'Tus cambios se conservan en este navegador.', tone: 'text-[hsl(var(--destructive))]', retry: true },
}
const RECONNECTING = { icon: WifiOff, text: 'Sincronizado · reconectando colaboración', detail: 'Tus cambios se guardan, pero los de otras personas pueden tardar.', tone: 'text-amber-600 dark:text-amber-400' }

// Retry is throttled: one attempt per click, with visible feedback.
function useRetry(onRetry) {
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!busy) return undefined
    const timer = setTimeout(() => setBusy(false), 1500)
    return () => clearTimeout(timer)
  }, [busy])
  return { busy, retry: () => { if (busy) return; setBusy(true); onRetry?.() } }
}

export function SyncStatus({ state, live, onRetry, compact = false }) {
  const reconnecting = state === 'synced' && live === 'Reconectando'
  const view = reconnecting ? RECONNECTING : STATES[state] ?? STATES.synced, Icon = view.icon
  const { busy, retry } = useRetry(onRetry)
  const showLive = !compact && state === 'synced' && live === 'Conectado'
  if (compact) {
    // Phone: the icon is the status; when action is possible it is also the retry button.
    const label = view.retry ? `${view.text}. Reintentar` : view.text
    const icon = <Icon className={cn('h-4 w-4 shrink-0', view.tone)} aria-hidden />
    return view.retry
      ? <button type="button" role="status" aria-label={label} title={label} disabled={busy} onClick={retry} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">{busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : icon}</button>
      : <span role="status" aria-live="polite" aria-label={label} title={label} className="flex h-10 w-10 shrink-0 items-center justify-center">{icon}</span>
  }
  return (
    <span role="status" aria-live="polite" title={view.detail} className="inline-flex min-w-0 items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
      <Icon className={cn('h-3.5 w-3.5 shrink-0', view.tone)} aria-hidden />
      <span className="truncate">{view.text}</span>
      {showLive ? <span className="hidden lg:inline">· {live}</span> : null}
      {view.retry && onRetry ? <Button size="sm" variant="ghost" disabled={busy} onClick={retry} className="h-7 gap-1 px-2 text-xs"><RefreshCw className={cn('h-3 w-3', busy && 'animate-spin motion-reduce:animate-none')} aria-hidden />Reintentar</Button> : null}
    </span>
  )
}
