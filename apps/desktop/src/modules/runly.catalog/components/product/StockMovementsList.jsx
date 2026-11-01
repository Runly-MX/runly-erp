// apps/desktop/src/modules/runly.catalog/components/product/StockMovementsList.jsx
import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Button, EmptyState, ErrorState, SectionCard, SelectField, Skeleton } from '@runly/ui'
import { FileSpreadsheet, FileText, History, Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { companyFetch } from '../../../../lib/companyFetch.js'
import { runly } from '../../../../lib/runly.js'
import { getApiUrl } from '../../../../lib/runtimeConfig.js'
import { classifyCommerceError } from '../../lib/commerceCommand.js'
import { variantLabel } from '../../lib/catalogRules.js'

const PAGE = 25
const ALL = '__all__'

function fmtDate(value) {
  try { return new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return value ?? '' }
}

// C5 ledger with origin (sale, refund, allocation, adjustment, opening),
// outlet, actor and order number. Paged by offset as the contract defines.
export default function StockMovementsList({ productId, token, isVariable, variants, outlets }) {
  const [variantId, setVariantId] = useState(ALL)
  const [outletId, setOutletId] = useState(ALL)
  const [limit, setLimit] = useState(PAGE)
  const [exporting, setExporting] = useState(null)
  const query = useQuery({
    queryKey: ['catalog-stock-movements', productId, token, variantId, outletId, limit],
    queryFn: () => runly.catalogCommerce.stockMovements(productId, {
      ...(variantId !== ALL ? { variantId } : {}), ...(outletId !== ALL ? { outletId } : {}), limit, offset: 0,
    }, token),
    enabled: Boolean(token),
    placeholderData: keepPreviousData,
  })
  const rows = query.data?.data ?? []
  const total = query.data?.total ?? 0
  const outletName = (id) => (id ? outlets.find((o) => o.id === id)?.name ?? 'Sucursal' : 'Sin asignar')
  const variantName = (id) => variantLabel(variants.find((v) => v.id === id)?.option_values)

  async function exportFile(format) {
    setExporting(format)
    try {
      const res = await companyFetch(`${getApiUrl()}/catalog/products/${productId}/stock-movements/export/${format}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { toast.error('No se pudo exportar el archivo.'); return }
      const blob = await res.blob()
      const anchor = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `movimientos-${productId}.${format}` })
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(anchor.href)
    } catch {
      toast.error('No se pudo exportar el archivo.')
    } finally {
      setExporting(null)
    }
  }

  return (
    <SectionCard
      title="Movimientos"
      icon={History}
      description={`${total} movimiento(s). Cada uno indica su origen, la sucursal y quién lo hizo.`}
      action={(
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => exportFile('xlsx')} disabled={Boolean(exporting) || total === 0}><FileSpreadsheet className="h-4 w-4" aria-hidden="true" />{exporting === 'xlsx' ? 'Exportando...' : 'Excel'}</Button>
          <Button type="button" variant="outline" onClick={() => exportFile('pdf')} disabled={Boolean(exporting) || total === 0}><FileText className="h-4 w-4" aria-hidden="true" />{exporting === 'pdf' ? 'Exportando...' : 'PDF'}</Button>
        </div>
      )}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {isVariable && (
          <SelectField aria-label="Filtrar por variante" className="w-56" value={variantId} onValueChange={(v) => { setVariantId(v); setLimit(PAGE) }}
            options={[{ value: ALL, label: 'Todas las variantes' }, ...variants.map((v) => ({ value: v.id, label: variantLabel(v.option_values) || 'Sin opciones' }))]} />
        )}
        <SelectField aria-label="Filtrar por sucursal" className="w-56" value={outletId} onValueChange={(v) => { setOutletId(v); setLimit(PAGE) }}
          options={[{ value: ALL, label: 'Todas las ubicaciones' }, ...outlets.map((o) => ({ value: o.id, label: o.name }))]} />
      </div>

      {query.isPending ? (
        <div className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      ) : query.isError ? (
        <ErrorState title="No se pudieron leer los movimientos" description={classifyCommerceError(query.error).message} onRetry={query.refetch} />
      ) : rows.length === 0 ? (
        <EmptyState icon={History} title="Sin movimientos" description="Aquí aparecerán ventas, devoluciones, asignaciones y ajustes." />
      ) : (
        <>
          <ul className="divide-y divide-[hsl(var(--border))] overflow-hidden rounded-xl border border-[hsl(var(--border))]">
            {rows.map((m) => {
              const delta = Number(m.quantityDelta ?? m.quantity_delta)
              const positive = delta > 0
              return (
                <li key={m.id} className="flex items-start gap-3 px-3 py-3">
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${positive ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300' : 'bg-red-50 text-red-800 dark:bg-red-400/10 dark:text-red-300'}`} aria-hidden="true">
                    {positive ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className={`font-bold tabular-nums ${positive ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-800 dark:text-red-300'}`}>{positive ? `+${delta}` : delta}</span>
                      <span className="font-semibold text-[hsl(var(--foreground))]">{m.sourceLabel}</span>
                      {m.orderNumber != null && <span className="text-[hsl(var(--muted-foreground))]">Orden #{m.orderNumber}</span>}
                      {m.reversalOfId && <span className="text-[hsl(var(--muted-foreground))]">revierte una salida</span>}
                    </p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {[outletName(m.outletId), isVariable && m.variantId ? variantName(m.variantId) : null, m.actorName ?? (m.userId ? null : 'Sistema'), m.reason].filter(Boolean).join(' · ')}
                    </p>
                    {m.note && <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{m.note}</p>}
                    {m.balanceApplied === false && <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">Registro histórico, anterior al control por sucursal.</p>}
                  </div>
                  <time className="shrink-0 text-xs text-[hsl(var(--muted-foreground))]" dateTime={m.createdAt ?? m.created_at}>{fmtDate(m.createdAt ?? m.created_at)}</time>
                </li>
              )
            })}
          </ul>
          {rows.length < total && (
            <div className="mt-3 flex justify-center">
              <Button type="button" variant="outline" onClick={() => setLimit((n) => Math.min(n + PAGE, 200))} disabled={query.isFetching || limit >= 200}>
                {limit >= 200 ? 'Exporta para ver el historial completo' : query.isFetching ? 'Cargando...' : `Ver más (${total - rows.length} restantes)`}
              </Button>
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}
