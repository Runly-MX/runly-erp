import { useMemo } from 'react'
import { RunlyTable, RuntimeAdaptersProvider } from '@runly/ui'
import { Activity, Boxes, MapPin, ShieldCheck, Tag, Wrench } from 'lucide-react'
import { getApiUrl } from '../../../../lib/runtimeConfig.js'
import { ADMIN_FILTER_OPTIONS, ADMIN_STATUSES } from '../../lib/admin-status.js'
import { ITEM_STATUSES } from '../../lib/inventory-constants.js'
import { createGuestTableTransport } from '../../lib/guest-table-transport.js'
import { useGuestCall, useGuestCatalogs } from '../../hooks/useInventoryGuest.js'

const ADMIN_COLORS = Object.fromEntries(ADMIN_STATUSES.map((s) => [s.value, s.color]))
const STATUS_OPTIONS = ITEM_STATUSES.map((s) => ({ value: s.value, label: s.label }))
const ADMIN_OPTIONS = ADMIN_STATUSES.map((s) => ({ value: s.value, label: s.label }))
const asOptions = (rows = []) => rows.map((r) => ({ value: r.id, label: r.name }))

// The same RunlyTable as the main inventory list (search, filters, column picker, table/list/cards views,
// numbered pagination), pointed at the supplier API. The transport swaps the Bearer header for the guest
// session and answers the user-only table-preferences calls locally. Only supplier-safe columns.
export function GuestItemsTable({ areaId, onOpen, onEdit = null }) {
  const { sessionToken, expire } = useGuestCall()
  const catalogs = useGuestCatalogs().data
  const adapters = useMemo(() => ({ transport: createGuestTableTransport({ sessionToken, onExpire: expire }) }), [sessionToken, expire])
  const externalFilters = useMemo(() => ({ areaId: areaId ?? '' }), [areaId])

  const blueprint = useMemo(() => ({
    key: 'inventory.guest.items.table',
    schema: {
      apiPath: '/inventory/guest/items',
      primaryField: 'name',
      subtitleField: 'assetTag',
      searchable: true,
      searchPlaceholder: 'Buscar por nombre, folio, serie, activo...',
      columns: [
        { field: 'coverUrl', label: 'Imagen', type: 'image', sortable: false },
        { field: 'folio', label: 'Folio', sortable: true },
        { field: 'assetTag', label: 'N.º de activo', sortable: true },
        { field: 'name', label: 'Nombre', sortable: true, link: true },
        { field: 'categoryName', label: 'Tipo', sortable: true },
        { field: 'brandName', label: 'Marca', sortable: true },
        { field: 'areaName', label: 'Área', sortable: true },
        { field: 'status', label: 'Disponibilidad', sortable: true, type: 'select', options: STATUS_OPTIONS },
        { field: 'adminStatus', label: 'Estado', sortable: true, type: 'select', options: ADMIN_OPTIONS },
        { field: 'conditionName', label: 'Condición', sortable: true, defaultVisible: false },
        { field: 'locationName', label: 'Ubicación', sortable: true, defaultVisible: false },
        { field: 'serialNumber', label: 'No. Serie', sortable: true, defaultVisible: false },
        { field: 'model', label: 'Modelo', sortable: true, defaultVisible: false },
        { field: 'warrantyExpiry', label: 'Garantía', sortable: true, type: 'date', defaultVisible: false },
        { field: 'createdAt', label: 'Alta', sortable: true, type: 'date', defaultVisible: false },
        { field: 'updatedAt', label: 'Actualizado', sortable: true, type: 'date', defaultVisible: false },
      ],
      filters: [
        { key: 'adminStatus', label: 'Estado', type: 'select', icon: ShieldCheck, options: ADMIN_FILTER_OPTIONS.map((o) => ({ ...o, color: ADMIN_COLORS[o.value] })) },
        { key: 'status', label: 'Disponibilidad', type: 'select', icon: Activity, options: STATUS_OPTIONS },
        { key: 'conditionId', label: 'Condición', type: 'select', icon: Wrench, options: asOptions(catalogs?.conditions) },
        { key: 'categoryId', label: 'Tipo', type: 'select', icon: Boxes, options: asOptions(catalogs?.categories) },
        { key: 'brandId', label: 'Marca', type: 'select', icon: Tag, options: asOptions(catalogs?.brands) },
        { key: 'locationId', label: 'Ubicación', type: 'select', icon: MapPin, options: asOptions(catalogs?.locations) },
      ],
      emptyState: { message: 'No hay items en tus carpetas.' },
    },
  }), [catalogs])

  return (
    <RuntimeAdaptersProvider value={adapters}>
      <RunlyTable
        blueprint={blueprint}
        token={sessionToken}
        apiBaseUrl={getApiUrl()}
        externalFilters={externalFilters}
        onView={(row) => onOpen(row.id)}
        onRowOpen={(row) => onOpen(row.id)}
        onEdit={onEdit ? (row) => onEdit(row.id) : undefined}
      />
    </RuntimeAdaptersProvider>
  )
}
