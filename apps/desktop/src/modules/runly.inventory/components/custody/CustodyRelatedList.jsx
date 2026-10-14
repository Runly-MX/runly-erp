import { useNavigate } from 'react-router-dom'
import { EmptyState, LoadingState } from '@runly/ui'
import { FileSignature } from 'lucide-react'
import { useCustodies } from '../../hooks/useInventoryCustody.js'
import { CUSTODY_KIND, formatCustodyDate } from '../../lib/custody-api.js'
import { CustodyStatusBadge } from './CustodyStatusBadge.jsx'

const CUSTODY_PATH = '/app/m/runly.inventory/inventory/custodies'

// Custody records (resguardos) related to one item or one employee.
export function CustodyRelatedList({ itemId, employeeId, limit = 10 }) {
  const navigate = useNavigate()
  const params = itemId ? { itemId, limit } : { employeeId, limit }
  const { data, isLoading } = useCustodies(params, { enabled: Boolean(itemId || employeeId) })
  const rows = data?.items ?? []
  const total = data?.total ?? rows.length

  if (isLoading) return <LoadingState />
  if (rows.length === 0) {
    return <EmptyState icon={FileSignature} title="Sin resguardos" description={itemId ? 'Este activo no aparece en ningún resguardo.' : 'Este colaborador no tiene resguardos registrados.'} />
  }

  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={() => navigate(`${CUSTODY_PATH}/${row.id}`)}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-[hsl(var(--muted))]"
        >
          <FileSignature className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
          <span className="shrink-0 font-mono text-xs text-[hsl(var(--muted-foreground))]">{row.folio ?? '—'}</span>
          <span className="min-w-0 flex-1 truncate">
            {CUSTODY_KIND[row.kind] ?? row.kind}{itemId ? ` · ${row.employeeName}` : ` · ${row.itemCount} artículos`}
          </span>
          <span className="hidden shrink-0 text-xs text-[hsl(var(--muted-foreground))] sm:inline">{formatCustodyDate(row.date)}</span>
          <CustodyStatusBadge status={row.status} />
        </button>
      ))}
      {total > rows.length && employeeId ? (
        <button type="button" onClick={() => navigate(`${CUSTODY_PATH}?employee=${employeeId}`)}
          className="w-full pt-1 text-center text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]">
          Ver todos los resguardos
        </button>
      ) : null}
    </div>
  )
}

// Titled card for the item detail page.
export function CustodyRelatedCard({ itemId }) {
  return (
    <section className="glass-shell-flat space-y-3 rounded-2xl p-4">
      <h3 className="text-sm font-semibold">Resguardos</h3>
      <CustodyRelatedList itemId={itemId} />
    </section>
  )
}
