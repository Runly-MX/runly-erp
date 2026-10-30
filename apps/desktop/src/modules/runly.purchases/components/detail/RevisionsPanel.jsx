import { History } from 'lucide-react'
import { EmptyState, ErrorState, Skeleton } from '@runly/ui'
import { useRevisions } from '../../hooks/usePurchases.js'
import { formatDate } from '../../lib/format.js'

const LABELS = {
  number: 'Folio', supplierReference: 'Referencia del proveedor', notes: 'Observaciones', expectedDate: 'Fecha esperada de entrega',
  paymentTerms: 'Condiciones de pago', dueDate: 'Fecha de vencimiento',
}
const DATES = new Set(['expectedDate', 'dueDate'])
const show = (field, value) => (value == null || value === '' ? 'Sin dato' : DATES.has(field) ? formatDate(value) : String(value))

// Corrections of a registered order or invoice, newest first, with the
// version move, who, when, why and each field before/after. Read-only history.
export function RevisionsPanel({ kind, docId }) {
  const query = useRevisions(kind, docId)
  if (query.isLoading) return <Skeleton className="h-32 w-full rounded-xl" />
  if (query.isError) return <ErrorState title="No se pudo cargar el historial de correcciones" description={query.error?.message} onRetry={() => query.refetch()} />
  const { revisions = [], available } = query.data ?? {}
  if (!available) return <EmptyState icon={History} title="Historial de correcciones no disponible" description="Esta instancia todavía no tiene activado el registro de correcciones." />
  if (!revisions.length) return <EmptyState icon={History} title="Sin correcciones" description="Las correcciones de datos administrativos aparecerán aquí con su motivo y quién las hizo." />
  return (
    <ul className="space-y-3" aria-label="Historial de correcciones">
      {revisions.map((r) => (
        <li key={r.id} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3" data-revision-id={r.id}>
          <p className="text-sm font-semibold">Versión {r.versionFrom} a {r.versionTo}</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{[r.actorName && `Por ${r.actorName}`, `el ${formatDate(r.createdAt)}`].filter(Boolean).join(' · ')}</p>
          <p className="mt-1 text-sm">Motivo: {r.reason}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {Object.entries(r.changes ?? {}).map(([field, change]) => (
              <li key={field}>
                <span className="font-medium">{LABELS[field] ?? field}:</span>{' '}
                <span className="text-[hsl(var(--muted-foreground))] line-through">{show(field, change.before)}</span>{' '}
                <span>{show(field, change.after)}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}
