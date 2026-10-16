import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Checkbox, EmptyState, ErrorState, NumberStepper, SearchInput, SelectField, Skeleton } from '@runly/ui'
import { CheckSquare, ListChecks, Loader2, PackageSearch, X } from 'lucide-react'
import { toast } from 'sonner'
import { useInventoryCategories, useInventoryLocations } from '../../hooks/useInventoryCatalogs.js'
import { useCoverUrls, useDebouncedValue, useFetchAllFiltered, useLabelAssetSearch } from '../../hooks/useLabelStudio.js'
import { MAX_QUANTITY, MAX_SELECTION } from '../../lib/label-queue.js'
import { typeOptions } from '../InventoryCatalogPickers.jsx'
import { LabelAssetRow } from './LabelAssetRow.jsx'
import { SegmentTabs, plural } from './studio-ui.jsx'

const ALL = 'all'
const LABEL_FILTERS = [
  { value: ALL, label: 'Todas' },
  { value: 'false', label: 'Sin etiquetar' },
  { value: 'true', label: 'Etiquetadas' },
]
const rowsOf = (data) => (data?.data ?? data ?? []).filter((row) => row.enabled !== false)

function ListSkeleton() {
  return (
    <ul className="divide-y divide-[hsl(var(--border)/0.6)]" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-5 rounded-md" /><Skeleton className="size-11 rounded-md" />
          <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3 w-1/3" /></div>
        </li>
      ))}
    </ul>
  )
}

// Asset list of the studio: the same server search as Inventario, filters,
// selection with per-row copies and "Ver solo seleccionados".
export function LabelAssetPicker({ rows, dispatch, disabled, onSample }) {
  const [search, setSearch] = useState('')
  const [labeled, setLabeled] = useState(ALL)
  const [categoryId, setCategoryId] = useState(ALL)
  const [locationId, setLocationId] = useState(ALL)
  const [onlySelected, setOnlySelected] = useState(false)
  const [allQty, setAllQty] = useState(1)
  const [selectingAll, setSelectingAll] = useState(false)
  const debounced = useDebouncedValue(search, 300)
  const filters = { search: debounced, labeled, categoryId: categoryId === ALL ? '' : categoryId, locationId: locationId === ALL ? '' : locationId }
  const query = useLabelAssetSearch(filters, { enabled: !onlySelected })
  const fetchAll = useFetchAllFiltered()

  const types = rowsOf(useInventoryCategories().data)
  const locations = rowsOf(useInventoryLocations().data)
  const typeOpts = useMemo(() => [{ value: ALL, label: 'Todos los tipos' }, ...typeOptions(types)], [types])
  const locationOpts = useMemo(() => [{ value: ALL, label: 'Todas las ubicaciones' }, ...locations.map((l) => ({ value: l.id, label: l.name }))], [locations])

  const items = useMemo(() => (query.data?.pages ?? []).flatMap((page) => page?.data ?? []), [query.data])
  const total = Number(query.data?.pages?.[0]?.total ?? 0)
  const selected = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows])
  const list = onlySelected ? rows : items
  const covers = useCoverUrls(list.map((item) => item.coverImageFileId)).data ?? {}

  const first = items[0] ?? null
  useEffect(() => { onSample?.(first) }, [first, onSample])

  // Infinite scroll with a visible "Cargar más" fallback.
  const sentinel = useRef(null)
  useEffect(() => {
    const node = sentinel.current
    if (!node || onlySelected || !query.hasNextPage || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !query.isFetchingNextPage) query.fetchNextPage()
    }, { rootMargin: '400px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [query, onlySelected])

  const allLoadedSelected = items.length > 0 && items.every((item) => selected.has(item.id))
  const someLoadedSelected = items.some((item) => selected.has(item.id))

  async function selectAllFiltered() {
    if (allLoadedSelected) { dispatch({ type: 'removeMany', ids: items.map((i) => i.id) }); return }
    if (total <= items.length) { dispatch({ type: 'add', items }); return }
    setSelectingAll(true)
    try {
      const everything = await fetchAll(filters)
      dispatch({ type: 'add', items: everything })
      if (total > MAX_SELECTION) toast.info(`Se seleccionaron los primeros ${MAX_SELECTION} equipos`, { description: 'Es el máximo por impresión. Acota la búsqueda para el resto.' })
    } catch (err) {
      toast.error(err?.message ?? 'No se pudieron seleccionar todos')
    } finally {
      setSelectingAll(false)
    }
  }

  const filtered = Boolean(debounced.trim()) || labeled !== ALL || categoryId !== ALL || locationId !== ALL
  const clearFilters = () => { setSearch(''); setLabeled(ALL); setCategoryId(ALL); setLocationId(ALL) }

  return (
    <div className="flex min-w-0 flex-col">
      <div className="space-y-3 border-b border-[hsl(var(--border))] p-4">
        <div>
          <label htmlFor="label-asset-search" className="mb-1.5 block text-sm font-medium">Buscar activos</label>
          <SearchInput id="label-asset-search" value={search} onChange={(e) => { setSearch(e.target.value); setOnlySelected(false) }}
            placeholder="Nombre, folio, serie, modelo, asignado, factura..." autoComplete="off" />
        </div>
        <SegmentTabs ariaLabel="Estado de etiqueta" options={LABEL_FILTERS} value={labeled} size="sm"
          onChange={(v) => { setLabeled(v); setOnlySelected(false) }} />
        <div className="grid grid-cols-2 gap-2">
          <SelectField aria-label="Tipo" options={typeOpts} value={categoryId} onValueChange={(v) => { setCategoryId(v || ALL); setOnlySelected(false) }} />
          <SelectField aria-label="Ubicación" options={locationOpts} value={locationId} onValueChange={(v) => { setLocationId(v || ALL); setOnlySelected(false) }} />
        </div>
      </div>

      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)] px-4 py-2 text-sm">
        {onlySelected ? (
          <span className="font-medium">{plural(rows.length, 'seleccionado', 'seleccionados')}</span>
        ) : (
          <label className="flex min-h-10 cursor-pointer items-center gap-2.5">
            <Checkbox className="size-5" disabled={disabled || !items.length || selectingAll}
              checked={allLoadedSelected ? true : someLoadedSelected ? 'indeterminate' : false}
              onCheckedChange={selectAllFiltered} aria-label="Seleccionar todos los resultados" />
            <span className="text-[hsl(var(--muted-foreground))]">
              {query.isLoading ? 'Buscando...' : allLoadedSelected ? 'Quitar los visibles' : `Seleccionar ${total > items.length ? `los ${Math.min(total, MAX_SELECTION)}` : 'todos'}`}
              {!query.isLoading ? <span className="ml-1 tabular-nums">· {plural(total, 'resultado', 'resultados')}</span> : null}
            </span>
            {selectingAll || (query.isFetching && !query.isFetchingNextPage) ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-label="Cargando" /> : null}
          </label>
        )}
        <div className="ml-auto flex items-center gap-1">
          {rows.length ? (
            <Button type="button" variant={onlySelected ? 'secondary' : 'ghost'} size="sm" className="h-9" aria-pressed={onlySelected}
              onClick={() => setOnlySelected((v) => !v)}>
              <ListChecks className="mr-1.5 h-4 w-4" />{onlySelected ? 'Ver todos' : `Solo seleccionados (${rows.length})`}
            </Button>
          ) : null}
        </div>
      </div>

      {onlySelected && rows.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[hsl(var(--border))] px-4 py-2 text-sm">
          <span className="text-[hsl(var(--muted-foreground))]">Copias para todos</span>
          <NumberStepper size="sm" min={1} max={MAX_QUANTITY} value={allQty} onChange={setAllQty} label="Copias para todos" disabled={disabled} />
          <Button type="button" variant="outline" size="sm" className="h-9" disabled={disabled} onClick={() => dispatch({ type: 'applyAll', quantity: allQty })}>Aplicar</Button>
          <Button type="button" variant="ghost" size="sm" className="ml-auto h-9" disabled={disabled}
            onClick={() => { dispatch({ type: 'clear' }); setOnlySelected(false) }}>
            <X className="mr-1.5 h-4 w-4" />Quitar todos
          </Button>
        </div>
      ) : null}

      {!onlySelected && query.isLoading ? <ListSkeleton /> : null}
      {!onlySelected && query.isError && !items.length ? (
        <div className="p-4"><ErrorState title="No se pudo buscar" description={query.error?.message} onRetry={() => query.refetch()} /></div>
      ) : null}
      {!query.isLoading && !list.length && !(query.isError && !onlySelected) ? (
        <div className="p-4">
          {onlySelected ? (
            <EmptyState icon={CheckSquare} title="Nada seleccionado" description="Marca los activos que quieres etiquetar." />
          ) : (
            <EmptyState icon={PackageSearch} title={filtered ? 'Sin coincidencias' : 'Sin activos'}
              description={filtered ? 'Prueba con otra palabra: se busca en nombre, folio, serie, número de activo, modelo, marca, ubicación, asignado, factura y campos personalizados.' : 'Da de alta equipos en Inventario para imprimir sus etiquetas.'}
              action={filtered ? <Button type="button" variant="outline" onClick={clearFilters}>Limpiar filtros</Button> : undefined} />
          )}
        </div>
      ) : null}

      {list.length ? (
        <ul className="divide-y divide-[hsl(var(--border)/0.6)]" aria-label={onlySelected ? 'Activos seleccionados' : 'Resultados'} aria-busy={query.isFetching || undefined}>
          {list.map((item) => (
            <LabelAssetRow key={item.id} item={item} search={onlySelected ? '' : debounced}
              selected={selected.has(item.id)} quantity={selected.get(item.id)?.quantity ?? 1}
              coverUrl={covers[item.coverImageFileId]} disabled={disabled}
              onToggle={(it) => dispatch({ type: 'toggle', item: it })}
              onQuantity={(id, quantity) => dispatch({ type: 'quantity', id, quantity })} />
          ))}
        </ul>
      ) : null}

      {!onlySelected && query.hasNextPage ? (
        <div ref={sentinel} className="flex justify-center p-4">
          <Button type="button" variant="outline" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? 'Cargando...' : `Cargar más (${items.length} de ${total})`}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
