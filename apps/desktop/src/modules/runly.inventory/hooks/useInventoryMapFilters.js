import { useMemo } from 'react'
import { Activity, Boxes, CalendarPlus, FolderTree, MapPin, ShieldCheck, Tag, UserCheck, Wrench } from 'lucide-react'
import { ITEM_STATUSES } from '../lib/inventory-constants.js'
import { ADMIN_FILTER_OPTIONS, ADMIN_STATUSES } from '../lib/admin-status.js'
import { useInventoryBrands, useInventoryCategories, useInventoryLocations } from './useInventoryCatalogs.js'
import { useInventoryConditions } from './useInventoryAdmin.js'
import { useAreaChoices } from './useAreaChoices.js'

const ADMIN_COLORS = Object.fromEntries(ADMIN_STATUSES.map((s) => [s.value, s.color]))
const STATUS_OPTIONS = ITEM_STATUSES.map((s) => ({ value: s.value, label: s.label, color: s.color }))
const MINE_OPTIONS = [{ value: 'true', label: 'Solo mis items' }]
const toOptions = (rows, withColor = false) => (rows ?? []).map((r) => ({ value: r.id, label: r.name, ...(withColor && r.color ? { color: r.color } : {}) }))

// FilterMenu specs for the inventory map: the item list's filters (same query
// params as GET /inventory/items, which /inventory/map/items also reads).
export function useInventoryMapFilters() {
  const categories = useInventoryCategories().data?.data
  const brands = useInventoryBrands().data?.data
  const locations = useInventoryLocations().data?.data
  const conditions = useInventoryConditions().data?.data
  const areaOptions = useAreaChoices().filterOptions
  return useMemo(() => [
    { key: 'categoryId', label: 'Tipo', type: 'select', icon: Boxes, options: toOptions(categories, true) },
    { key: 'status', label: 'Disponibilidad', type: 'select', icon: Activity, options: STATUS_OPTIONS },
    { key: 'adminStatus', label: 'Estado', type: 'select', icon: ShieldCheck, options: ADMIN_FILTER_OPTIONS.map((o) => ({ ...o, color: ADMIN_COLORS[o.value] })) },
    { key: 'conditionId', label: 'Condición', type: 'multiselect', icon: Wrench, options: toOptions(conditions) },
    { key: 'brandId', label: 'Marca', type: 'select', icon: Tag, options: toOptions(brands) },
    { key: 'locationId', label: 'Ubicación', type: 'select', icon: MapPin, options: toOptions(locations) },
    ...(areaOptions.length ? [{ key: 'areaId', label: 'Área', type: 'select', icon: FolderTree, options: areaOptions }] : []),
    { key: 'mine', label: 'Míos', type: 'select', icon: UserCheck, options: MINE_OPTIONS },
    { key: 'created', label: 'Fecha de alta', type: 'daterange', icon: CalendarPlus, fromKey: 'createdFrom', toKey: 'createdTo' },
  ], [categories, brands, locations, conditions, areaOptions])
}

// Active filter values as a query string for the API ('' when none).
export function filtersQuery(value) {
  const params = new URLSearchParams()
  for (const [key, raw] of Object.entries(value ?? {})) {
    const v = Array.isArray(raw) ? raw.join(',') : raw
    if (v !== '' && v != null && v !== false && v !== 'all') params.set(key, String(v))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}
