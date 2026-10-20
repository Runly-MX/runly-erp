import { ComboboxField, MobileFiltersSheet, SearchInput } from '@runly/ui'

export const ALL = '__all__'
export const EMPTY_FILTERS = { categoryId: ALL, brandId: ALL, locationId: ALL, conditionId: ALL, status: ALL }

const STATUS_OPTIONS = [
  { value: ALL, label: 'Todos los estados' },
  { value: 'available', label: 'Disponible' },
  { value: 'maintenance', label: 'En mantenimiento' },
]

const withAll = (label, rows = []) => [{ value: ALL, label }, ...rows.map((r) => ({ value: r.id, label: r.name }))]

// Filter values -> API query params (ALL is dropped).
export const filtersToQuery = (filters) => Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ALL))

// Search box + catalog filters. Filters sit inline on desktop and in a sheet on small screens.
export function GuestItemFilters({ search, onSearch, filters, onFilters, catalogs }) {
  const set = (key) => (value) => onFilters({ ...filters, [key]: value || ALL })
  const activeCount = Object.values(filters).filter((v) => v !== ALL).length
  const fields = (
    <>
      <ComboboxField label="Categoría" value={filters.categoryId} options={withAll('Todas', catalogs?.categories)} onChange={set('categoryId')} />
      <ComboboxField label="Marca" value={filters.brandId} options={withAll('Todas', catalogs?.brands)} onChange={set('brandId')} />
      <ComboboxField label="Ubicación" value={filters.locationId} options={withAll('Todas', catalogs?.locations)} onChange={set('locationId')} />
      <ComboboxField label="Condición" value={filters.conditionId} options={withAll('Todas', catalogs?.conditions)} onChange={set('conditionId')} />
      <ComboboxField label="Estado" value={filters.status} options={STATUS_OPTIONS} onChange={set('status')} />
    </>
  )
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <SearchInput className="min-w-0 flex-1" value={search} placeholder="Buscar por nombre, folio, serie..."
          onChange={(e) => onSearch(e.target.value)} onClear={() => onSearch('')} />
        <MobileFiltersSheet activeCount={activeCount} onClear={() => onFilters(EMPTY_FILTERS)}>
          <div className="space-y-4">{fields}</div>
        </MobileFiltersSheet>
      </div>
      <div className="hidden gap-3 md:grid md:grid-cols-3 lg:grid-cols-5">{fields}</div>
    </div>
  )
}
