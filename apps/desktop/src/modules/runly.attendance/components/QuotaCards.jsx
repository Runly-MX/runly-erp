import { Badge, EmptyState, ProgressBar } from '@runly/ui'
import { Target } from 'lucide-react'

// Human label for a quota row: its own name, or the group / category / site it targets.
export function quotaTitle(row, lookups) {
  if (row.name) return row.name
  const parts = [lookups.groups.get(row.groupId), lookups.categories.get(row.categoryId), lookups.sites.get(row.siteId)].filter(Boolean)
  return parts.join(' · ') || 'Cuota general'
}

// One quota card (compliance report, cards view).
export function QuotaCard({ row, lookups }) {
  const pct = row.required > 0 ? Math.min(100, Math.round((row.present / row.required) * 100)) : 100
  const failing = row.applies && !row.ok
  return (
    <div className="relative h-full overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-card p-4 pl-5">
      <span className={`absolute inset-y-0 left-0 w-1 ${!row.applies ? 'bg-slate-400' : failing ? 'bg-rose-500' : 'bg-emerald-500'}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold">{quotaTitle(row, lookups)}</p>
        {!row.applies ? <Badge variant="secondary">No aplica hoy</Badge> : failing ? <Badge variant="destructive">Faltan {row.missing}</Badge> : <Badge variant="success">Cumple</Badge>}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">
        {row.present}<span className="text-base font-medium text-[hsl(var(--muted-foreground))]"> / {row.required} requeridos</span>
      </p>
      <ProgressBar value={pct} className="mt-3 h-2" aria-label="Avance de la cuota" barClassName={failing ? 'bg-red-500' : 'bg-emerald-500'} />
    </div>
  )
}

export function QuotaCards({ rows, lookups }) {
  if (!rows.length) {
    return <EmptyState icon={Target} title="Sin cuotas configuradas" description="Define cuántas personas mínimas debe haber por grupo, categoría o sitio en Configuración." />
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => <QuotaCard key={row.quotaId} row={row} lookups={lookups} />)}
    </div>
  )
}
