import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, FileText, PackageMinus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, DataTable, ErrorState, FilterBar, MobileFiltersSheet, PageHeader, SearchInput } from '@runly/ui'
import {
  useDeregistrationSummary, useInventoryCan, useInventoryDeregistrations, useOpenDeregistrationAct, useRegenerateDeregistrationAct,
} from '../hooks/useInventoryAdmin.js'
import { DEREGISTRATION_REASONS, reasonLabel } from '../lib/admin-status.js'

const PAGE_SIZE = 25
const ITEM_PATH = '/app/m/runly.inventory/inventory'
const STATE_OPTIONS = [{ value: 'reverted', label: 'Revertidas' }, { value: 'all', label: 'Todas' }]
const NO_FILTERS = { reason: '', state: '', from: '', to: '' }

const formatDay = (value) => {
  if (!value) return '—'
  const [y, m, d] = String(value).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
const formatStamp = (value) => (value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '')

function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function Tile({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-card p-4">
      <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value ?? '—'}</p>
      {hint ? <p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]">{hint}</p> : null}
    </div>
  )
}

// Bitácora de bajas: when each asset left the inventory, why, who proposed and
// authorized it, and the signed acta that backs it.
export default function InventoryDeregistrationsScreen() {
  const navigate = useNavigate()
  const can = useInventoryCan()
  const openAct = useOpenDeregistrationAct()
  const regenerate = useRegenerateDeregistrationAct()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(NO_FILTERS)
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounced(search)
  useEffect(() => { setPage(1) }, [debouncedSearch, filters])

  const params = {
    page, pageSize: PAGE_SIZE,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(filters.reason ? { reason: filters.reason } : {}),
    ...(filters.state ? { state: filters.state } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
  }
  const list = useInventoryDeregistrations(params)
  const summary = useDeregistrationSummary()
  const rows = list.data?.data ?? []
  const total = list.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const activeFilters = Object.values(filters).filter(Boolean).length
  const canDecide = can('inventory.item.deregister')

  const filterDefs = useMemo(() => [
    { key: 'dates', label: 'Fecha de baja', type: 'daterange', fromKey: 'from', toKey: 'to' },
    { key: 'reason', label: 'Motivo', type: 'select', options: DEREGISTRATION_REASONS },
    { key: 'state', label: 'Situación', type: 'select', options: STATE_OPTIONS },
  ], [])

  const columns = useMemo(() => {
    const open = (id) => openAct.mutate(id, { onError: (err) => toast.error(err?.message ?? 'No se pudo abrir el acta.') })
    const generate = (id) => regenerate.mutate(id, { onSuccess: () => toast.success('Acta generada'), onError: (err) => toast.error(err?.message ?? 'No se pudo generar el acta.') })
    return [
      { accessorKey: 'effectiveDate', header: 'Fecha de baja', cell: ({ row }) => <span className="tabular-nums">{formatDay(row.original.effectiveDate)}</span> },
      { accessorKey: 'name', header: 'Activo', cell: ({ row }) => (
        <button type="button" className="text-left hover:underline" onClick={() => navigate(`${ITEM_PATH}/${row.original.itemId}`)}>
          <span className="block font-medium">{row.original.name}</span>
          <span className="block text-xs text-[hsl(var(--muted-foreground))]">{[row.original.assetTag, row.original.serialNumber].filter(Boolean).join(' · ')}</span>
        </button>
      ) },
      { accessorKey: 'reason', header: 'Motivo', cell: ({ row }) => reasonLabel(row.original.reason) || '—' },
      { id: 'proposal', header: 'Propuesta', cell: ({ row }) => (row.original.proposedBy ? (
        <div className="text-xs">
          <p className="font-medium">{row.original.proposedBy}</p>
          <p className="text-[hsl(var(--muted-foreground))]">{formatStamp(row.original.proposedAt)}</p>
          {row.original.proposalComment ? <p className="mt-0.5 line-clamp-2 max-w-64">{row.original.proposalComment}</p> : null}
        </div>
      ) : <span className="text-xs text-[hsl(var(--muted-foreground))]">{row.original.migrated ? 'Migrada' : 'Sin propuesta'}</span>) },
      { id: 'authorization', header: 'Autorización', cell: ({ row }) => (
        <div className="text-xs">
          <p className="font-medium">{row.original.authorizedBy}</p>
          <p className="text-[hsl(var(--muted-foreground))]">{formatStamp(row.original.authorizedAt)}</p>
          {row.original.comment ? <p className="mt-0.5 line-clamp-2 max-w-64">{row.original.comment}</p> : null}
        </div>
      ) },
      { id: 'act', header: 'Acta', cell: ({ row }) => {
        const { act, reverted } = row.original
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {reverted ? <Badge variant="outline">Revertida</Badge> : null}
            {act?.hasDocument ? (
              <Button type="button" size="sm" variant="outline" onClick={() => open(act.id)}>
                <FileText className="mr-1.5 h-3.5 w-3.5" />{act.folio}
              </Button>
            ) : act && canDecide ? (
              <Button type="button" size="sm" variant="outline" onClick={() => generate(act.id)}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Generar {act.folio}
              </Button>
            ) : <span className="text-xs text-[hsl(var(--muted-foreground))]">Sin acta</span>}
            {act && act.itemCount > 1 ? <span className="text-xs text-[hsl(var(--muted-foreground))]">lote de {act.itemCount}</span> : null}
          </div>
        )
      } },
    ]
  }, [navigate, openAct, regenerate, canDecide])

  const s = summary.data
  const topReason = s?.byReason?.[0]

  return (
    <div className="min-h-dvh space-y-5 p-4 md:p-6">
      <PageHeader eyebrow="Runly Inventario" title="Bajas"
        description="Cuándo salió cada activo del inventario, por qué motivo, quién propuso y autorizó la baja, y el acta firmada que la respalda." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Activos en baja" value={s?.total} />
        <Tile label="Este mes" value={s?.thisMonth} />
        <Tile label="Este año" value={s?.thisYear} />
        <Tile label="Motivo principal" value={topReason ? reasonLabel(topReason.reason) : '—'} hint={topReason ? `${topReason.count} activos` : null} />
      </div>
      {s?.withoutAct ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          {s.withoutAct} {s.withoutAct === 1 ? 'baja autorizada' : 'bajas autorizadas'} antes de que existieran las actas no {s.withoutAct === 1 ? 'tiene' : 'tienen'} acta.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')}
          placeholder="Buscar por activo, serie, folio del acta o comentario" className="min-w-48 flex-1" />
        <div className="hidden items-center gap-2 md:flex">
          <FilterBar filters={filterDefs} value={filters} onChange={setFilters} />
        </div>
        <MobileFiltersSheet activeCount={activeFilters} onClear={() => setFilters(NO_FILTERS)}>
          <FilterBar filters={filterDefs} value={filters} onChange={setFilters} />
        </MobileFiltersSheet>
      </div>

      {list.isError ? (
        <ErrorState title="No se pudieron cargar las bajas" description={list.error?.message} onRetry={() => list.refetch()} />
      ) : (
        <DataTable columns={columns} data={rows} isLoading={list.isLoading} manualPagination showToolbar={false} showPagination={false}
          pageSize={PAGE_SIZE} getRowId={(row) => row.eventId} emptyIcon={PackageMinus}
          emptyTitle={debouncedSearch || activeFilters ? 'Sin resultados con estos filtros' : 'Aún no hay bajas'}
          emptyDescription="Cuando se autorice la baja de un activo aparecerá aquí con su acta." />
      )}

      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm text-[hsl(var(--muted-foreground))]">
          <span>{(page - 1) * PAGE_SIZE + 1} a {Math.min(page * PAGE_SIZE, total)} de {total}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="px-2 tabular-nums">{page} / {pageCount}</span>
            <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} aria-label="Página siguiente"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
