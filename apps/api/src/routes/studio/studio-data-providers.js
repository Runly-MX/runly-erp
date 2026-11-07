import { StudioError } from '../../../../shared/studio/document.js'
import { STUDIO_DATA_LIMITS } from './studio-data-source.js'

// Module data sources for Studio bulk create. Each provider reads through the
// module's own service and scope, with the exporter's permissions, and returns
// the same { headers, rows } shape as a parsed spreadsheet. Nothing is stored.
const ITEM_STATUS = { available: 'Disponible', maintenance: 'En mantenimiento', assigned: 'Asignado', in_use: 'En uso', retired: 'Baja', lost: 'Extraviado' }
const VEHICLE_STATUS = { active: 'Activo', inactive: 'Inactivo', maintenance: 'En mantenimiento', retired: 'Dado de baja' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Native inventory list filters (same keys as GET /inventory/items) the picker may send; ids must be UUIDs (areaId may be '__none__').
const INVENTORY_FILTER_KEYS = ['categoryId', 'brandId', 'locationId', 'conditionId', 'areaId', 'status', 'adminStatus', 'labeled', 'mine', 'createdFrom', 'createdTo', 'purchaseFrom', 'purchaseTo']
function inventoryFilters(raw) {
  const out = {}
  for (const key of INVENTORY_FILTER_KEYS) {
    const value = (Array.isArray(raw[key]) ? raw[key].join(',') : raw[key] === true ? 'true' : raw[key]) ?? ''
    if (typeof value !== 'string' || !value) continue
    if (/Id$/.test(key) && !value.split(',').every(part => UUID.test(part) || (key === 'areaId' && part === '__none__'))) continue
    out[key] = value.slice(0, 200)
  }
  if (raw.unlabeled === true && !out.labeled) out.labeled = 'false'
  return out
}
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
  // ids (not a column) let Studio log the printed labels in the module's own history.
  return { headers, rows, ids: records.map(record => record.id ?? null), total, truncated: total > rows.length }
}

export function createStudioDataProviders({ prisma, inventory, inventoryScope, inventoryPublic, publicBaseUrl, fleet, hr, signFile }) {
  const can = (c, permission) => Boolean(c.get('userContext')?.isAdmin || c.get('userContext')?.permissionSet?.has(permission))
  // Photo per row: { fileId: signedUrl } for this company's enabled files only (a 'Foto' column holds the id).
  async function photos(companyId, ids) {
    const wanted = [...new Set(ids.filter(id => UUID.test(id ?? '')))]
    if (!wanted.length || !signFile) return {}
    const files = await prisma.fileAsset.findMany({ where: { id: { in: wanted }, entityId: companyId, enabled: true, mimeType: { startsWith: 'image/' } }, select: { id: true, bucket: true, objectKey: true } })
    const signed = await Promise.all(files.map(async file => [file.id, await signFile(file).catch(() => null)]))
    return Object.fromEntries(signed.filter(([, url]) => url))
  }
  const withPhotos = async (c, result, records, idOf) => {
    const images = await photos(c.get('companyId'), records.map(idOf))
    result.rows.forEach((row, i) => { row.Foto = images[idOf(records[i])] ? idOf(records[i]) : '' })
    return { ...result, headers: [...result.headers, 'Foto'], images }
  }
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
        const { rows: listed, total } = await collect(async (page, limit) => {
          const { mine, ...native } = filters.native ?? {}
          const result = await inventory.listItems({ companyId, scope, page, limit, search: filters.search || undefined, ...native,
            mine: mine === 'true' ? await inventoryScope.mineFromContext(c) : null })
          return { data: result.data, total: result.total }
        }, 200)
        // The picker previews with `preview` and only the chosen `ids` are used, so public links are issued just for those.
        const items = filters.ids?.length ? listed.filter(item => filters.ids.includes(item.id)) : listed
        // The public link is what the inventory QR labels encode; issuing it needs the print permission.
        const links = can(c, 'inventory.label.print') && !filters.preview ? await inventoryPublic.ensureTokens(companyId, items.map(item => item.id)) : null
        const headers = ['Nombre', 'Número de activo', 'Folio', 'Modelo', 'Marca', 'Categoría', 'Número de serie', 'Número de parte', 'Ubicación', 'Área', 'Responsable', 'Estado', ...(links ? ['Enlace público'] : [])]
        return withPhotos(c, table(headers, items, total, item => [item.name, item.assetTag, item.folio, item.model, item.brandName, item.categoryName, item.serialNumber, item.partNumber,
          item.locationName, item.areaName, item.assignedToName, ITEM_STATUS[item.status] ?? item.status,
          ...(links ? [links.has(item.id) ? inventoryPublic.urlFor(publicBaseUrl || new URL(c.req.url).origin, links.get(item.id)) : ''] : [])]), items, item => item.coverImageFileId)
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
        return withPhotos(c, table(headers, vehicles, total, row => [row.plate, row.economic_number, row.vehicle_brand_name ?? row.brand, row.vehicle_model_name ?? row.model_name,
          row.vehicle_type_name, row.year ?? row.vehicle_model_year, row.color, VEHICLE_STATUS[row.status] ?? row.status, row.driver_name]), vehicles, row => row.cover_image_file_asset_id)
      },
    },
    {
      // Badges: work data only; personal email, emergency contacts and payroll data are never offered.
      key: 'hr', label: 'Recursos humanos', permission: 'hr.employee.read',
      filters: async () => [{ key: 'search', label: 'Buscar', type: 'text' }],
      async rows(c, filters) {
        const { rows: people, total } = await collect(async (page, pageSize) => {
          const result = await hr.listEmployees({ authUserId: c.get('authUserId'), companyId: c.get('companyId'), page, pageSize, enabled: true, search: filters.search || undefined, sortBy: 'full_name' })
          return { data: result.rows, total: result.total }
        }, 200)
        const headers = ['Nombre completo', 'Nombre', 'Apellidos', 'Número de empleado', 'Puesto', 'Departamento', 'Correo de trabajo', 'Teléfono', 'Ubicación', 'Jefe directo', 'Fecha de ingreso']
        return withPhotos(c, table(headers, people, total, row => [row.full_name, row.first_name, row.last_name, row.employee_code, row.job_title, row.department,
          row.work_email, row.phone, row.work_location, row.manager_name, row.hire_date]), people, row => row.photo_file_id)
      },
    },
    {
      // Shipping labels: the contact's default (or first) address.
      key: 'contacts', label: 'Contactos', permission: 'contacts.contacts.read',
      filters: async () => [{ key: 'search', label: 'Buscar', type: 'text' }],
      async rows(c, filters) {
        const term = filters.search?.trim()
        const where = { companyId: c.get('companyId'), enabled: true, ...(term ? { OR: ['name', 'legalName', 'email', 'phone'].map(field => ({ [field]: { contains: term, mode: 'insensitive' } })) } : {}) }
        const [contacts, total] = await Promise.all([
          prisma.contact.findMany({ where, orderBy: { name: 'asc' }, take: STUDIO_DATA_LIMITS.rows,
            include: { addresses: { orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }], take: 1 } } }),
          prisma.contact.count({ where }),
        ])
        const headers = ['Nombre', 'Razón social', 'Correo', 'Teléfono', 'Calle', 'Número exterior', 'Número interior', 'Colonia', 'Código postal', 'Ciudad', 'Estado', 'País', 'Dirección completa']
        return withPhotos(c, table(headers, contacts, total, contact => {
          const a = contact.addresses[0] ?? {}
          const line = [[a.street, a.extNumber, a.intNumber ? `int. ${a.intNumber}` : null].filter(Boolean).join(' '), a.neighborhood, [a.postalCode, a.city].filter(Boolean).join(' '), a.state].filter(Boolean).join(', ')
          return [contact.name, contact.legalName, contact.email, contact.phone, a.street, a.extNumber, a.intNumber, a.neighborhood, a.postalCode, a.city, a.state, a.country, line]
        }), contacts, contact => contact.avatarFileId)
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
        native: inventoryFilters(raw), preview: raw.preview === true,
        ids: Array.isArray(raw.ids) ? raw.ids.filter(id => UUID.test(id ?? '')).slice(0, STUDIO_DATA_LIMITS.rows) : [] } : {}
      let result = await provider.rows(c, filters)
      if (filters.ids?.length) {
        const keep = result.ids.map(id => filters.ids.includes(id))
        result = { ...result, rows: result.rows.filter((_, i) => keep[i]), ids: result.ids.filter((_, i) => keep[i]), truncated: false }
      }
      if (!result.rows.length && filters.preview) return result
      if (!result.rows.length) throw new StudioError('No hay registros con esos filtros.', 404)
      return result
    },
  }
}
