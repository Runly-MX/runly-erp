import { CircleCheck, Hourglass, RefreshCw, WifiOff, TriangleAlert } from 'lucide-react'
import { clockLabel, connectionState } from '../lib/restaurantRules.js'

// One line that says how much to trust what is on screen. Never color alone:
// every state has an icon and text. States, most urgent first:
// offline > pending confirmation > stale (last read failed) > recovering >
// confirmed by the server.

const VIEW = {
  offline: { icon: WifiOff, tone: 'text-red-800 dark:text-red-300', text: () => 'Sin conexión: lo que ves puede estar desactualizado y no se envían operaciones hasta que vuelva.' },
  pending: { icon: Hourglass, tone: 'text-amber-900 dark:text-amber-300', text: (p) => (p.pending === 1 ? 'Una operación está pendiente de confirmar: reintenta para recuperar su resultado antes de repetirla.' : `${p.pending} operaciones están pendientes de confirmar: reintenta para recuperar su resultado antes de repetirlas.`) },
  stale: { icon: TriangleAlert, tone: 'text-amber-900 dark:text-amber-300', text: () => 'No se pudo actualizar: información potencialmente desactualizada.' },
  recovering: { icon: RefreshCw, tone: 'text-[hsl(var(--muted-foreground))]', text: () => 'Recuperando información…' },
  confirmed: { icon: CircleCheck, tone: 'text-[hsl(var(--muted-foreground))]', text: (p) => (p.updatedAt ? `Confirmado por el servidor a las ${clockLabel(p.updatedAt)}` : 'Confirmado por el servidor') },
}

export default function ConnectionNotice({ online, isError, hasData, isFetching, pending = 0, updatedAt, onRetry }) {
  const state = connectionState({ online, isError, hasData, isFetching, pending })
  const view = VIEW[state]
  const Icon = view.icon
  return (
    <p role="status" aria-live="polite" data-connection-state={state} className={`flex min-h-6 flex-wrap items-center gap-2 text-sm font-medium ${view.tone}`}>
      <Icon className={`h-4 w-4 shrink-0 ${state === 'recovering' || (isFetching && state === 'stale') ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
      <span>{view.text({ pending, updatedAt })}</span>
      {(state === 'stale' || state === 'offline') && onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex h-11 items-center rounded-md border border-[hsl(var(--border))] px-3 text-sm font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">Reintentar</button>
      )}
    </p>
  )
}
