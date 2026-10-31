import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button, DataTable, EmptyState, ErrorState, FilterBar, MobileFiltersSheet, PageHeader, SearchInput, SegmentedControl, Skeleton, ViewModeSwitch, useIsMobile } from '@runly/ui'
import { useCapabilities, useDocumentList, usePurchasesCan, useViewCounts } from '../hooks/usePurchases.js'
import { usePurchaseRoute } from '../hooks/usePurchaseRoute.js'
import { DOCUMENTARY_SECTIONS, LIST_SECTIONS } from '../lib/list-config.js'
import { KINDS, ROOT } from '../lib/purchases-constants.js'
import { buildColumns } from '../components/DocumentColumns.jsx'
import { DocumentCard } from '../components/DocumentCard.jsx'
import { SupplierField } from '../components/SupplierField.jsx'
import { CaseCreateDialog } from '../components/CaseCreateDialog.jsx'
import { ReadOnlyNotice } from '../components/ReadOnlyNotice.jsx'

const PAGE_SIZE = 25
const VIEW_KEY = 'runly.purchases.documents.view'
const readView = () => { try { return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'table' } catch { return 'table' } }
const WITH_ITEMS = new Set(['orders', 'invoices', 'receipts'])

function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// One screen for every document list (orders, invoices, requests, receipts,
// cases, payments), driven by lib/list-config.js.
export default function PurchaseDocumentList() {
  const navigate = useNavigate()
  const { section, searchParams } = usePurchaseRoute()
  const caps = useCapabilities()
  const baseConfig = LIST_SECTIONS[section] ?? LIST_SECTIONS.orders
  const config = caps.documentary && DOCUMENTARY_SECTIONS[section] ? { ...baseConfig, ...DOCUMENTARY_SECTIONS[section] } : baseConfig
  // ?estado=<chip> opens the list on that view (links from Inicio).
  const urlStatus = searchParams.get('estado')
  const initialStatus = config.chips.some((c) => c.value === urlStatus) ? urlStatus : (config.defaultStatus ?? 'ALL')
  const kindMeta = KINDS[config.kind]
  const can = usePurchasesCan()

  const [status, setStatus] = useState(initialStatus)
  const [search, setSearch] = useState('')
  const [supplierId, setSupplierId] = useState(null)
  const [page, setPage] = useState(1)
  const [storedView, setView] = useState(readView)
  // Below 768 px the list is always cards (whole card is the link).
  // Below 1280 px (sidebar + content) wide lists use compact columns, or
  // cards when the config says the table cannot fit (cardsBelow).
  const phone = useIsMobile(768)
  const compact = useIsMobile(1280)
  const narrow = config.cardsBelow ? compact : phone
  const view = narrow ? 'cards' : storedView
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, storedView) } catch { /* per-viewer convenience only */ } }, [storedView])
  const debouncedSearch = useDebounced(search)
  useEffect(() => { setStatus(initialStatus); setSearch(''); setSupplierId(null); setPage(1) }, [section, initialStatus])
  useEffect(() => { setPage(1) }, [status, debouncedSearch, supplierId])

  // Status lives in a FilterBar chip (desktop) or the mobile filters sheet,
  // the same toolbar grammar as the inventory list.
  const defaultStatus = config.defaultStatus ?? 'ALL'
  const statusFilters = useMemo(() => [{
    key: 'status', label: 'Estado', type: 'select',
    options: config.chips.filter((c) => c.value !== defaultStatus),
  }], [config, defaultStatus])
  const filterValue = { status: status === defaultStatus ? '' : status }
  const onFilterChange = (next) => setStatus(next.status || defaultStatus)
  const activeFilters = (status !== defaultStatus ? 1 : 0) + (supplierId ? 1 : 0)
  const clearFilters = () => { setStatus(defaultStatus); setSupplierId(null) }

  const enabled = !config.capability || caps.has(config.capability) || (section === 'cases' && ['requests', 'quotes', 'approvals'].some(caps.has))
  // A section turned off stays readable while it holds documents (history).
  const readOnly = !enabled && Boolean(caps.history?.[section])
  const params = {
    page, pageSize: PAGE_SIZE,
    ...(config.chips.find((c) => c.value === status)?.params ?? (status !== 'ALL' ? { status } : {})),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(supplierId ? { supplierId } : {}),
  }
  const list = useDocumentList(config.kind, params, { enabled: (enabled || readOnly) && !caps.isLoading })
  const filterParams = { ...(debouncedSearch ? { search: debouncedSearch } : {}), ...(supplierId ? { supplierId } : {}) }
  const counts = useViewCounts(config.kind, config.views ? config.chips : [], filterParams, { enabled: Boolean(config.views) && (enabled || readOnly) && !caps.isLoading })
  const rows = list.data?.data ?? []
  const total = list.data?.total ?? list.data?.pagination?.total ?? rows.length
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // The invoice summary needs permission to read invoices (the API sends null otherwise).
  const columnNames = ((compact && config.compactColumns) || config.columns).filter((name) => name !== 'billing' || can(KINDS.invoices.read))
  const columns = useMemo(
    () => buildColumns(columnNames, { kind: config.kind, href: (id) => `${ROOT}/${config.kind}/${id}` }),
    [config, columnNames.join()],
  )

  const [caseOpen, setCaseOpen] = useState(false)
  const canCreate = enabled && kindMeta?.newLabel && can(kindMeta.create) && section !== 'payments'
  const onCreate = () => (section === 'cases' ? setCaseOpen(true) : navigate(`${ROOT}/${config.kind}/new`))

  if (!caps.isLoading && !enabled && !readOnly) {
    return (
      <div className="min-h-dvh p-4 md:p-6">
        <EmptyState icon={kindMeta?.icon} title="Esta sección no está activa"
          description="Tu flujo de compras no usa esta etapa. Puedes activarla en Configuración."
          action={can('purchases.settings.manage') ? { label: 'Ir a Configuración', onClick: () => navigate(`${ROOT}/settings`) } : null} />
      </div>
    )
  }

  return (
    <div className="min-h-dvh space-y-5 p-4 pb-24 md:p-6 md:pb-24">
      <PageHeader eyebrow="Compras" title={config.title} description={config.description}
        actions={canCreate ? <Button onClick={onCreate}><Plus className="h-4 w-4" />{kindMeta.newLabel}</Button> : null} />

      {readOnly ? <ReadOnlyNotice subject={`La sección ${config.title}`} /> : null}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')}
            placeholder={caps.documentary && WITH_ITEMS.has(config.kind) ? 'Buscar por referencia, folio, proveedor o activo' : WITH_ITEMS.has(config.kind) ? 'Buscar por folio, proveedor, número de activo o serie' : 'Buscar por folio, título o referencia'} className="min-w-48 flex-1" />
          <div className="hidden items-center gap-2 md:flex">
            {config.supplierFilter ? (
              <SupplierField label={null} value={supplierId} onChange={(id) => setSupplierId(id)} placeholder="Todos los proveedores" className="w-60" />
            ) : null}
            {config.views ? null : <FilterBar filters={statusFilters} value={filterValue} onChange={onFilterChange} />}
          </div>
          {narrow ? null : <ViewModeSwitch modes={['table', 'cards']} value={storedView} onChange={setView} />}
          <MobileFiltersSheet activeCount={config.views ? (supplierId ? 1 : 0) : activeFilters} onClear={config.views ? () => setSupplierId(null) : clearFilters}>
            <div className="space-y-4">
              {config.supplierFilter ? (
                <SupplierField label="Proveedor" value={supplierId} onChange={(id) => setSupplierId(id)} placeholder="Todos los proveedores" />
              ) : null}
              {config.views ? null : <FilterBar filters={statusFilters} value={filterValue} onChange={onFilterChange} />}
            </div>
          </MobileFiltersSheet>
        </div>
        {config.views ? (
          <SegmentedControl ariaLabel="Vista" value={status} onChange={setStatus} className="w-full sm:w-auto"
            options={config.chips.map((v) => ({ value: v.value, label: counts[v.value] == null ? v.label : `${v.label} · ${counts[v.value]}` }))} />
        ) : null}
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          {list.isLoading ? 'Cargando...' : `${total} ${total === 1 ? 'documento' : 'documentos'} · más recientes primero`}
        </p>
      </div>

      {list.isError ? (
        <ErrorState title="No se pudo cargar la lista" description={list.error?.message} onRetry={() => list.refetch()} />
      ) : (
        view === 'cards' ? (
          list.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
          ) : rows.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((row) => <DocumentCard key={row.id} kind={config.kind} row={row} to={`${ROOT}/${config.kind}/${row.id}`} />)}
            </div>
          ) : (
            <EmptyState icon={kindMeta?.icon} title={debouncedSearch || status !== (config.defaultStatus ?? 'ALL') || supplierId ? 'Sin resultados con estos filtros' : config.emptyTitle}
              description={config.emptyDescription} action={canCreate && !debouncedSearch ? { label: kindMeta.newLabel, onClick: onCreate } : null} />
          )
        ) : (
        <DataTable
          columns={columns}
          data={rows}
          isLoading={list.isLoading}
          manualPagination
          showToolbar={false}
          showPagination={false}
          pageSize={PAGE_SIZE}
          getRowId={(row) => row.id}
          emptyIcon={kindMeta?.icon}
          emptyTitle={debouncedSearch || status !== (config.defaultStatus ?? 'ALL') || supplierId ? 'Sin resultados con estos filtros' : config.emptyTitle}
          emptyDescription={config.emptyDescription}
          emptyAction={canCreate && !debouncedSearch ? { label: kindMeta.newLabel, onClick: onCreate } : null}
        />
        )
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

      {section === 'cases' ? <CaseCreateDialog open={caseOpen} onOpenChange={setCaseOpen} /> : null}
    </div>
  )
}
