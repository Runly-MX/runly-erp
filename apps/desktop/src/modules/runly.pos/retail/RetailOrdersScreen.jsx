// apps/desktop/src/modules/runly.pos/retail/RetailOrdersScreen.jsx
import { useEffect, useState } from 'react'
import {useSearchParams} from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Button, DateField, EmptyState, ErrorState, PageHeader, SearchInput, SelectField, Skeleton, StatusPill } from '@runly/ui'
import { ChevronLeft, ChevronRight, Lock, ReceiptText } from 'lucide-react'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { runly } from '../../../lib/runly.js'
import OrderDetailDialog from './components/OrderDetailDialog.jsx'
import { classifyPosError } from './lib/retailErrors.js'
import { ORDER_STATUS_META, formatMoney } from './lib/retailRules.js'

const PAGE_SIZE = 25
const ALL = '__all__'

function when(value) {
  try { return new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) } catch { return '' }
}

// Order history on C2 (filters by outlet, register, status, folio and dates,
// as the contract defines). Detail, receipts, cancel and refund open from a row.
function RetailOrdersView() {
  const { session, userProfile } = useAuth()
  const token = session?.access_token
  const { activeCompanyId } = useActiveCompany()
  const [outletId, setOutletId] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [params,setParams]=useSearchParams()
  const requested=params.get('order')
  const [openId, setOpenId] = useState(()=>/^[0-9a-f-]{36}$/i.test(requested??'')?requested:null)
  useEffect(() => { const t = setTimeout(() => { setSearch(text.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [text])
  const validSearch = /^#?\d{1,9}$/.test(search) ? search : ''

  const context = useQuery({
    queryKey: ['pos-retail-context', activeCompanyId, null, null, token],
    queryFn: () => runly.commerce.context({}, token),
    enabled: Boolean(token && activeCompanyId),
    staleTime: 60_000,
  })
  const outlets = context.data?.data?.outlets ?? []
  const query = {
    experience: 'RETAIL',
    ...(outletId !== ALL ? { outletId } : {}),
    ...(status !== ALL ? { status } : {}),
    ...(validSearch ? { search: validSearch } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    page,
    pageSize: PAGE_SIZE,
  }
  const list = useQuery({
    queryKey: ['pos-retail-orders', activeCompanyId, query, token],
    queryFn: () => runly.commerce.listOrders(query, token),
    enabled: Boolean(token && activeCompanyId),
    placeholderData: keepPreviousData,
  })
  const rows = list.data?.data ?? []
  const pagination = list.data?.pagination
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / PAGE_SIZE)) : 1
  const error = list.error ? classifyPosError(list.error) : null

  return (
    <div className="min-h-dvh space-y-5 p-4 md:p-6">
      <PageHeader eyebrow="Punto de venta" title="Órdenes de tienda" description="Ventas de mostrador: consulta, comprobantes, cancelaciones y devoluciones." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SearchInput value={text} onChange={(e) => setText(e.target.value)} placeholder="Folio de venta o comprobante" aria-label="Buscar por folio de venta o de comprobante" inputMode="numeric" />
        <SelectField aria-label="Sucursal" value={outletId} onValueChange={(v) => { setOutletId(v); setPage(1) }} options={[{ value: ALL, label: 'Todas las sucursales' }, ...outlets.map((o) => ({ value: o.id, label: o.name }))]} />
        <SelectField aria-label="Estado" value={status} onValueChange={(v) => { setStatus(v); setPage(1) }} options={[{ value: ALL, label: 'Todos los estados' }, { value: 'OPEN', label: 'En curso' }, { value: 'PAID', label: 'Pagadas' }, { value: 'CANCELLED', label: 'Canceladas' }, { value: 'REFUNDED', label: 'Devueltas' }]} />
        <DateField aria-label="Desde" label="Desde" value={from} onChange={(e) => { setFrom(e?.target?.value ?? e ?? ''); setPage(1) }} />
        <DateField aria-label="Hasta" label="Hasta" value={to} onChange={(e) => { setTo(e?.target?.value ?? e ?? ''); setPage(1) }} />
      </div>
      {search && !validSearch && <p className="text-sm text-amber-900 dark:text-amber-300">El folio es numérico, por ejemplo 125 o #125.</p>}

      <div aria-busy={list.isFetching}>
        {list.isPending ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : error ? (
          error.kind === 'forbidden'
            ? <EmptyState icon={Lock} title="No tienes acceso a las órdenes" description={error.message} />
            : <ErrorState title="No se pudieron cargar las órdenes" description={error.message} onRetry={list.refetch} />
        ) : rows.length === 0 ? (
          <EmptyState icon={ReceiptText} title="Sin órdenes" description={validSearch ? `No hay ventas con el folio ${validSearch}.` : 'No hay ventas con estos filtros.'} />
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            {rows.map((o) => {
              const meta = ORDER_STATUS_META[o.status] ?? { label: o.status, tone: 'neutral' }
              return (
                <li key={o.id}>
                  <button type="button" onClick={() => setOpenId(o.id)} className="flex min-h-16 w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-[hsl(var(--muted))]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-[hsl(var(--foreground))]">Venta #{o.orderNumber}{o.receiptNumber ? ` · comprobante #${o.receiptNumber}` : ''}</span>
                      <span className="block text-xs text-[hsl(var(--muted-foreground))]">{when(o.openedAt)} · {o.lineCount} artículo(s){outlets.length > 1 ? ` · ${outlets.find((x) => x.id === o.outletId)?.name ?? ''}` : ''}</span>
                    </span>
                    <StatusPill size="sm" tone={meta.tone}>{meta.label}</StatusPill>
                    {o.refundStatus && o.refundStatus !== 'NONE' && <StatusPill size="sm" tone="warning">{o.refundStatus === 'FULL' ? 'Devuelta completa' : 'Devolución parcial'}</StatusPill>}
                    <span className="w-28 text-right font-bold tabular-nums text-[hsl(var(--foreground))]">{o.historicalCurrencyUnknown ? 'Moneda desconocida' : formatMoney(o.totalAmount, o.currency)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {pagination && pagination.total > 0 && (
        <nav className="flex flex-wrap items-center justify-between gap-3 text-sm text-[hsl(var(--muted-foreground))]" aria-label="Paginación de órdenes">
          <span aria-live="polite">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, pagination.total)} de {pagination.total}</span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Página anterior" className="max-sm:h-11"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Anterior</Button>
              <span className="tabular-nums">Página {page} de {totalPages}</span>
              <Button variant="outline" onClick={() => setPage(page + 1)} disabled={!pagination.hasMore} aria-label="Página siguiente" className="max-sm:h-11">Siguiente<ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
            </div>
          )}
        </nav>
      )}

      {openId && (
        <OrderDetailDialog
          orderId={openId}
          token={token}
          companyId={activeCompanyId}
          userProfile={userProfile}
          capabilities={context.data?.data?.capabilities ?? {}}
          methods={context.data?.data?.paymentMethods ?? []}
          onClose={() => {setOpenId(null);if(params.has('order')){const next=new URLSearchParams(params);next.delete('order');setParams(next,{replace:true})}}}
          onChanged={() => list.refetch()}
        />
      )}
    </div>
  )
}

export default function RetailOrdersScreen(){
  const {activeCompanyId}=useActiveCompany()
  const {userProfile}=useAuth()
  return <RetailOrdersView key={`${userProfile?.id}:${activeCompanyId}`} />
}
