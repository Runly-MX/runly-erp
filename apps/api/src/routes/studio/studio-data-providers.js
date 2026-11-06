import { StudioError } from '../../../../shared/studio/document.js'
import { STUDIO_DATA_LIMITS } from './studio-data-source.js'

// Module data sources for Studio bulk create. Each provider reads through the
// module's own service and scope, with the exporter's permissions, and returns
// the same { headers, rows } shape as a parsed spreadsheet. Nothing is stored.
const ITEM_STATUS = { available: 'Disponible', maintenance: 'En mantenimiento', assigned: 'Asignado', in_use: 'En uso', retired: 'Baja', lost: 'Extraviado' }
const VEHICLE_STATUS = { active: 'Activo', inactive: 'Inactivo', maintenance: 'En mantenimiento', retired: 'Dado de baja' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const text = value => (value == null ? '' : String(value))

// Pages through a module list until `max` rows or the end of the data.
async function collect(fetchPage, pageSize, max = STUDIO_DATA_LIMITS.rows) {
  const rows = []
  let total = 0
  for (let page = 1; rows.length < max; page++) {
    const result = await fetchPage(page, pageSize)
    total = result.total
    rows.push(...result.data)
    if (result.data.length < pageSize) break
  }
  return { rows: rows.slice(0, max), total }
}

const table = (headers, records, total, toRow) => {
  const rows = records.map(record => Object.fromEntries(toRow(record).map((value, i) => [headers[i], text(value).slice(0, STUDIO_DATA_LIMITS.cell)])))
  return { headers, rows, total, truncated: total > rows.length }
}

export function createStudioDataProviders({ prisma, inventory, inventoryScope, inventoryPublic, publicBaseUrl, fleet }) {
  const can = (c, permission) => Boolean(c.get('userContext')?.isAdmin || c.get('userContext')?.permissionSet?.has(permission))
  const providers = [
    {
      key: 'inventory', label: 'Inventario', permission: 'inventory.item.read',
      async filters(c) {
        const locations = await prisma.invLocation.findMany({ where: { companyId: c.get('companyId'), enabled: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
        return [
          { key: 'search', label: 'Buscar', type: 'text' },
          { key: 'locationId', label: 'Ubicación', type: 'select', options: locations.map(item => ({ value: item.id, label: item.name })) },
          { key: 'unlabeled', label: 'Solo equipos sin etiqueta impresa', type: 'boolean' },
        ]
      },
      async rows(c, filters) {
        const companyId = c.get('companyId'), scope = await inventoryScope.fromContext(c)
        const { rows: items, total } = await collect(async (page, limit) => {
          const result = await inventory.listItems({ companyId, scope, page, limit, search: filters.search || undefined,
            locationId: filters.locationId || undefined, labeled: filters.unlabeled === true ? 'false' : undefined })
          return { data: result.data, total: result.total }
        }, 200)
        // The public link is what the inventory QR labels encode; issuing it needs the print permission.
        const links = can(c, 'inventory.label.print') ? await inventoryPublic.ensureTokens(companyId, items.map(item => item.id)) : null
        const headers = ['Nombre', 'Número de activo', 'Folio', 'Modelo', 'Marca', 'Categoría', 'Número de serie', 'Número de parte', 'Ubicación', 'Área', 'Responsable', 'Estado', ...(links ? ['Enlace público'] : [])]
        return table(headers, items, total, item => [item.name, item.assetTag, item.folio, item.model, item.brandName, item.categoryName, item.serialNumber, item.partNumber,
          item.locationName, item.areaName, item.assignedToName, ITEM_STATUS[item.status] ?? item.status,
          ...(links ? [links.has(item.id) ? inventoryPublic.urlFor(publicBaseUrl, links.get(item.id)) : ''] : [])])
      },
    },
    {
      key: 'fleet', label: 'Flota', permission: 'fleet.vehicles.read',
      filters: async () => [{ key: 'search', label: 'Buscar', type: 'text' }],
      async rows(c, filters) {
        const { rows: vehicles, total } = await collect(async (page, pageSize) => {
          const result = await fleet.listVehicles({ companyId: c.get('companyId'), page, pageSize, search: filters.search || undefined })
          return { data: result.data, total: result.pagination.total }
        }, 100)
        const headers = ['Placa', 'Número económico', 'Marca', 'Modelo', 'Tipo', 'Año', 'Color', 'Estado', 'Conductor']
        return table(headers, vehicles, total, row => [row.plate, row.economic_number, row.vehicle_brand_name ?? row.brand, row.vehicle_model_name ?? row.model_name,
          row.vehicle_type_name, row.year ?? row.vehicle_model_year, row.color, VEHICLE_STATUS[row.status] ?? row.status, row.driver_name])
      },
    },
  ]
  const find = (c, key) => {
    const provider = providers.find(item => item.key === key)
    if (!provider) throw new StudioError('Fuente de datos no encontrada.', 404)
    if (!can(c, provider.permission)) throw new StudioError('No tienes permiso para leer los datos de este módulo.', 403)
    return provider
  }
  return {
    async list(c) {
      return Promise.all(providers.filter(item => can(c, item.permission)).map(async item => ({ key: item.key, label: item.label, filters: await item.filters(c) })))
    },
    async rows(c, key, input) {
      const provider = find(c, key), raw = input?.filters
      const filters = raw && typeof raw === 'object' ? { search: typeof raw.search === 'string' ? raw.search.slice(0, 200) : '',
        locationId: UUID.test(raw.locationId ?? '') ? raw.locationId : '', unlabeled: raw.unlabeled === true } : {}
      const result = await provider.rows(c, filters)
      if (!result.rows.length) throw new StudioError('No hay registros con esos filtros.', 404)
      return result
    },
  }
}
