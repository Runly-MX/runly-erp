import { useMemo } from 'react'
import { Button, EmptyState, ErrorState, Skeleton } from '@runly/ui'
import { History, LayoutTemplate, Printer, RotateCcw, User } from 'lucide-react'
import { useLabelPrintLog } from '../../hooks/useLabelStudio.js'
import { groupPrintBatches, reprintItems } from '../../lib/label-history.js'
import { plural } from './studio-ui.jsx'

const formatWhen = (value) => new Date(value).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function RunCard({ run, canPrint, onReprint }) {
  const available = reprintItems(run)
  const shown = run.items.slice(0, 6)
  return (
    <li className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-semibold tabular-nums">
            {plural(run.items.length, 'activo', 'activos')} · {plural(run.labels, 'etiqueta', 'etiquetas')}
          </p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{formatWhen(run.printedAt)}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[hsl(var(--muted-foreground))]">
            <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" aria-hidden="true" />{run.userName ?? 'Usuario eliminado'}</span>
            <span className="inline-flex items-center gap-1"><LayoutTemplate className="h-3.5 w-3.5" aria-hidden="true" />{run.templateName ?? 'Sin plantilla'}</span>
            <span className="inline-flex items-center gap-1"><Printer className="h-3.5 w-3.5" aria-hidden="true" />{run.printerName ?? 'Navegador o descarga'}</span>
          </div>
          <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Activos">
            {shown.map((item, i) => (
              <li key={`${item.id}-${i}`} className="max-w-[14rem] truncate rounded-md bg-[hsl(var(--muted))] px-2 py-0.5 text-xs">
                <span className="font-mono">{item.folio ?? '—'}</span>{item.quantity > 1 ? ` ×${item.quantity}` : ''}
                <span className="text-[hsl(var(--muted-foreground))]"> {item.name ?? ''}</span>
              </li>
            ))}
            {run.items.length > shown.length ? <li className="px-1 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">y {run.items.length - shown.length} más</li> : null}
          </ul>
        </div>
        {canPrint ? (
          <Button type="button" variant="outline" className="h-11 shrink-0" disabled={!available.length} onClick={() => onReprint(run)}
            title={available.length ? undefined : 'Los activos ya no existen'}>
            <RotateCcw className="mr-2 h-4 w-4" />Reimprimir
          </Button>
        ) : null}
      </div>
    </li>
  )
}

// Etiquetas > Historial: recent print runs with "Reimprimir" (preloads the selection).
export function LabelHistoryPanel({ canPrint, onReprint }) {
  const query = useLabelPrintLog()
  const rows = useMemo(() => (query.data?.pages ?? []).flatMap((page) => page?.data ?? []), [query.data])
  const runs = useMemo(() => groupPrintBatches(rows), [rows])

  if (query.isLoading) {
    return <div className="space-y-3" aria-hidden="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-md" />)}</div>
  }
  if (query.isError) return <ErrorState title="No se pudo cargar el historial" description={query.error?.message} onRetry={() => query.refetch()} />
  if (!runs.length) {
    return <EmptyState icon={History} title="Aún no hay impresiones" description="Cada vez que imprimes o descargas etiquetas en PDF o ZPL queda registrado aquí." />
  }
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {runs.map((run) => <RunCard key={run.key} run={run} canPrint={canPrint} onReprint={onReprint} />)}
      </ul>
      {query.hasNextPage ? (
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? 'Cargando...' : 'Cargar más'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
