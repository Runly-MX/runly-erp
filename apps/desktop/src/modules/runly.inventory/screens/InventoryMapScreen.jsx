import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MapPinned, X } from 'lucide-react'
import { Button, EmptyState, ErrorState, FilterToolbar, IconGlyph, PageHeader, SearchInput, Skeleton, cn, matchesSearch } from '@runly/ui'
import { useAuth } from '../../../auth/AuthProvider'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { formatGeoPoint, googleMapsUrl } from '../../../lib/geo-point.js'
import { GeoItemsMap } from '../../../components/geo/GeoItemsMap.jsx'
import { iconKey, pinColor } from '../../../components/geo/pin-image.js'
import { intakeRequest } from '../lib/intake.js'
import { InventoryStatusBadge } from '../components/InventoryStatusBadge.jsx'
import { useInventoryMapConfig } from '../components/InventoryGeolocation.jsx'
import { filtersQuery, useInventoryMapFilters } from '../hooks/useInventoryMapFilters.js'

const detailPath = (id) => `/app/m/runly.inventory/inventory/${id}`
const haystack = (item) => [item.name, item.folio, item.assetTag, item.serialNumber, item.locationName, item.categoryName, item.assignedToName]
// The pin of an item: its type's color and icon (Catálogos > Tipos).
const pinOf = (item) => ({ color: item.categoryColor, icon: item.categoryIcon || 'package' })

function useGeoItems(qs) {
  const token = useAuth().session?.access_token
  const { activeCompanyId } = useActiveCompany()
  return useQuery({
    queryKey: ['inventory', 'map-items', activeCompanyId, qs],
    queryFn: () => intakeRequest({ apiBaseUrl: getApiUrl(), token, companyId: activeCompanyId, path: `/inventory/map/items${qs}` }),
    enabled: Boolean(token && activeCompanyId),
    staleTime: 60 * 1000,
    // Keep the map mounted with the previous points while new filters load.
    placeholderData: (previous) => previous,
  })
}

function TypePin({ item }) {
  const pin = pinOf(item)
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white" style={{ backgroundColor: pinColor(pin.color) }} title={item.categoryName ?? 'Sin tipo'}>
      <IconGlyph name={iconKey(pin.icon)} className="h-4 w-4" />
    </span>
  )
}

function ExternalMapLink({ item }) {
  return (
    <a href={googleMapsUrl(item.latitude, item.longitude)} target="_blank" rel="noopener noreferrer"
      className="text-xs text-[var(--brand-primary)] underline-offset-2 hover:underline">Abrir en Google Maps</a>
  )
}

// Serial and asset numbers first: they are how people find a physical asset.
function Identifiers({ item }) {
  return (
    <dl className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-0.5">
      <div className="min-w-0">
        <dt className="text-[11px] text-[hsl(var(--muted-foreground))]">Número de serie</dt>
        <dd className="truncate font-mono text-sm font-semibold">{item.serialNumber || '—'}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-[11px] text-[hsl(var(--muted-foreground))]">Número de activo</dt>
        <dd className="truncate font-mono text-sm font-semibold">{item.assetTag || '—'}</dd>
      </div>
    </dl>
  )
}

function SelectedCard({ item, onClose, onOpen }) {
  return (
    <div className="absolute inset-x-2 bottom-2 z-10 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 shadow-lg sm:inset-x-auto sm:left-3 sm:bottom-3 sm:w-80">
      <div className="flex items-start gap-2">
        <TypePin item={item} />
        <div className="min-w-0 flex-1">
          <Identifiers item={item} />
          <p className="mt-1 truncate text-sm">{item.name}</p>
          <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{[item.folio, item.categoryName].filter(Boolean).join(' · ') || 'Sin folio'}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose} aria-label="Cerrar"><X className="h-4 w-4" /></Button>
      </div>
      <div className="mt-2 space-y-1 text-xs">
        <InventoryStatusBadge status={item.status} />
        {item.locationName ? <p>Ubicación: {item.locationName}</p> : null}
        {item.assignedToName ? <p>Asignado a: {item.assignedToName}</p> : null}
        <p className="tabular-nums text-[hsl(var(--muted-foreground))]">{formatGeoPoint(item.latitude, item.longitude)}</p>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button type="button" size="sm" onClick={onOpen}>Ver activo</Button>
        <ExternalMapLink item={item} />
      </div>
    </div>
  )
}

export default function InventoryMapScreen() {
  const navigate = useNavigate()
  const filterSpecs = useInventoryMapFilters()
  const [filters, setFilters] = useState({})
  const qs = filtersQuery(filters)
  const query = useGeoItems(qs)
  const config = useInventoryMapConfig().data
  const [mapFailed, setMapFailed] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const mapBoxRef = useRef(null)
  const pickFromList = (id) => { setSelectedId(id); mapBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }
  const styleUrl = config?.enabled && !mapFailed ? config.styleUrl : null

  const all = query.data?.items
  const items = useMemo(() => {
    return (all ?? []).filter((item) => matchesSearch(haystack(item), search))
  }, [all, search])
  const points = useMemo(() => items.map((item) => ({ ...item, pin: pinOf(item) })), [items])
  const selected = items.find((item) => item.id === selectedId) ?? null

  const header = <PageHeader eyebrow="Inventario" title="Mapa" description="Dónde están los activos que tienen geolocalización." />
  if (query.isError) return <div className="space-y-6 p-4 md:p-6">{header}<ErrorState title="No se pudo cargar el mapa" description={query.error?.message} onRetry={() => query.refetch()} /></div>
  if (query.isLoading) return <div className="space-y-6 p-4 md:p-6">{header}<Skeleton className="h-[70vh] w-full rounded-lg" /></div>
  if (!all?.length && !qs) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        {header}
        <EmptyState icon={MapPinned} title="Ningún activo tiene geolocalización"
          description="Abre un activo, edítalo y en «Geolocalización» usa tu ubicación, pega coordenadas o marca el punto en el mapa."
          action={{ label: 'Ir al inventario', onClick: () => navigate('/app/m/runly.inventory/inventory') }} />
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {header}
      <FilterToolbar
        search={<SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} placeholder="Buscar por serie, número de activo, nombre..." />}
        filterSpecs={filterSpecs} filterValue={filters} onFilterChange={(next) => { setFilters(next); setSelectedId(null) }} />
      {query.data?.truncated ? <p className="text-xs text-[hsl(var(--muted-foreground))]">Se muestran los {all.length} activos actualizados más recientemente.</p> : null}
      {!styleUrl ? <p className="text-xs text-[hsl(var(--muted-foreground))]">{config?.enabled === false ? 'Los mapas están desactivados en esta instancia.' : config ? 'No se pudo cargar el mapa.' : ''} Puedes abrir cada activo en Google Maps.</p> : null}
      {/* Phones: map on top, list below. lg: list on the left of the map. */}
      <div className={cn('grid min-w-0 gap-4', styleUrl && 'lg:grid-cols-[22rem_minmax(0,1fr)]')}>
        <div className="flex min-h-0 min-w-0 flex-col gap-2">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{items.length} de {all?.length ?? 0} activos{query.isFetching ? ' · actualizando...' : ''}</p>
          {items.length ? (
            <ul className={cn('divide-y divide-[hsl(var(--border))] overflow-y-auto rounded-lg border border-[hsl(var(--border))]', styleUrl && 'max-h-[50vh] lg:max-h-[calc(70vh-2rem)]')}>
              {items.map((item) => (
                <li key={item.id} className={cn('flex items-start gap-3 px-3 py-2.5', item.id === selectedId && 'bg-[hsl(var(--muted))]')}>
                  <TypePin item={item} />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => (styleUrl ? pickFromList(item.id) : navigate(detailPath(item.id)))}>
                    <Identifiers item={item} />
                    <span className="mt-1 block truncate text-sm">{item.name}</span>
                    <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{[item.folio, item.locationName].filter(Boolean).join(' · ') || formatGeoPoint(item.latitude, item.longitude)}</span>
                  </button>
                  {!styleUrl ? <ExternalMapLink item={item} /> : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={MapPinned} title="Sin resultados" description="Ningún activo geolocalizado coincide con la búsqueda o los filtros." />
          )}
        </div>
        {styleUrl ? (
          <div ref={mapBoxRef} className="relative order-first min-w-0 scroll-mt-20 lg:order-none">
            <GeoItemsMap styleUrl={styleUrl} points={points} selectedId={selectedId} onSelect={setSelectedId} onError={() => setMapFailed(true)} fitKey={qs} className="h-[55vh] lg:h-[70vh]" />
            {selected ? <SelectedCard item={selected} onClose={() => setSelectedId(null)} onOpen={() => navigate(detailPath(selected.id))} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
