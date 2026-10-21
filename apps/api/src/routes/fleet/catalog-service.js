import { FleetServiceError } from './fleet-service.js'

const MODULE_KEY = 'runly.fleet'
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function toNumber(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizePagination({ page, pageSize }) {
  const safePage = Math.max(1, toNumber(page, 1))
  const safePageSize = Math.min(100, Math.max(1, toNumber(pageSize, 20)))
  return { page: safePage, pageSize: safePageSize, offset: (safePage - 1) * safePageSize }
}

function normalizeSearch(search) {
  const value = String(search ?? '').trim()
  return value.length > 0 ? value : null
}

function normalizeOptionalString(value) {
  if (value === undefined) return undefined
  if (value === null) return null
  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeEconomicNumberPart(value) {
  const normalized = normalizeOptionalString(value)
  if (normalized === undefined || normalized === null) return normalized
  if (!/^\d+$/.test(normalized)) return normalized
  const withoutLeadingZeros = normalized.replace(/^0+/, '')
  return withoutLeadingZeros.length > 0 ? withoutLeadingZeros : '0'
}

function toScopedCompanyUuid(companyId) {
  const normalized = (typeof companyId === 'string' && companyId.trim()) ? companyId.trim() : null
  if (!normalized) throw new FleetServiceError('companyId es requerido.', 400)
  if (!UUID_REGEX.test(normalized)) throw new FleetServiceError('companyId debe ser UUID valido.', 400)
  return normalized.toLowerCase()
}

function normalizeRecordId(id, notFoundMessage) {
  const value = String(id ?? '').trim()
  if (!UUID_REGEX.test(value)) throw new FleetServiceError(notFoundMessage, 404)
  return value.toLowerCase()
}

function isTableNotFoundError(error) {
  const codes = [error?.code, error?.meta?.code, error?.cause?.code, error?.originalError?.code]
  if (codes.includes('42P01')) return true
  const msg = String(error?.message ?? '').toLowerCase()
  return msg.includes('42p01') || (msg.includes('relation') && msg.includes('does not exist'))
}

function isUniqueViolation(error) {
  const codes = [
    error?.code, error?.meta?.code, error?.cause?.code, error?.cause?.originalCode,
    error?.originalError?.code, error?.meta?.driverAdapterError?.cause?.code,
    error?.meta?.driverAdapterError?.cause?.originalCode,
  ].map((v) => (v == null ? null : String(v))).filter(Boolean)
  if (codes.includes('23505')) return true
  return String(error?.message ?? '').toLowerCase().includes('duplicate key value violates unique constraint')
}

function toCount(value) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

async function withDbErrorMapping(fn) {
  try {
    return await fn()
  } catch (error) {
    if (isTableNotFoundError(error)) throw new FleetServiceError('Las tablas del modulo no estan disponibles aun.', 503)
    throw error
  }
}

function firstRow(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null
}

export function createCatalogService({ prisma }) {
  async function logAudit({ companyId, actorId, entityType, entityId, action, before = null, after = null, metadata = null }) {
    await prisma.auditLog.create({
      data: { companyId: companyId ?? null, actorId: actorId ?? null, moduleKey: MODULE_KEY, entityType, entityId: entityId ?? null, action, before, after, metadata },
    })
  }

  // ── Vehicle Type ────────────────────────────────────────────────────────────

  async function getVehicleType(safeCompanyId, safeId) {
    const rows = await withDbErrorMapping(() => prisma.$queryRaw`
      SELECT * FROM fleet_vehicle_type WHERE id = ${safeId} AND company_id = ${safeCompanyId} AND enabled = true LIMIT 1
    `)
    const row = firstRow(rows)
    if (!row) throw new FleetServiceError('Tipo de vehiculo no encontrado.', 404)
    return row
  }

  async function listVehicleTypes({ companyId, page, pageSize, search }) {
    const safeCompanyId = toScopedCompanyUuid(companyId)
    const pagination = normalizePagination({ page, pageSize })
    const normalizedSearch = normalizeSearch(search)
    const likeValue = normalizedSearch ? `%${normalizedSearch}%` : null
    const [rows, totalRows] = await withDbErrorMapping(async () => {
      const data = await prisma.$queryRaw`
        SELECT * FROM fleet_vehicle_type WHERE company_id = ${safeCompanyId} AND enabled = true
          AND (${likeValue}::text IS NULL OR name ILIKE ${likeValue} OR description ILIKE ${likeValue})
        ORDER BY name ASC LIMIT ${pagination.pageSize} OFFSET ${pagination.offset}
      `
      const count = await prisma.$queryRaw`
        SELECT COUNT(*)::bigint AS total FROM fleet_vehicle_type WHERE company_id = ${safeCompanyId} AND enabled = true
          AND (${likeValue}::text IS NULL OR name ILIKE ${likeValue} OR description ILIKE ${likeValue})
      `
      return [data, count]
    })
    return { data: rows, pagination: { page: pagination.page, pageSize: pagination.pageSize, total: toCount(firstRow(totalRows)?.total) } }
  }

  async function createVehicleType({ companyId, actorId, payload }) {
    const safeCompanyId = toScopedCompanyUuid(companyId)
    const name = String(payload.name ?? '').trim()
    const description = normalizeOptionalString(payload.description)
    const economicGroupNumber = normalizeEconomicNumberPart(payload.economic_group_number)
    try {
      const row = await withDbErrorMapping(async () => {
        const rows = await prisma.$queryRaw`
          INSERT INTO fleet_vehicle_type (company_id, name, description, economic_group_number)
          VALUES (${safeCompanyId}, ${name}, ${description ?? null}, ${economicGroupNumber ?? null})
          RETURNING *
        `
        return firstRow(rows)
      })
      await logAudit({ companyId: safeCompanyId, actorId, entityType: 'VehicleType', entityId: row?.id ?? null, action: 'fleet.catalog.vehicle_type.create', before: null, after: row })
      return row
    } catch (error) {
      if (isUniqueViolation(error)) throw new FleetServiceError('Ya existe un tipo de vehiculo con ese nombre.', 409)
      throw error
    }
  }

  async function updateVehicleType({ companyId, actorId, id, payload }) {
    const safeCompanyId = toScopedCompanyUuid(companyId)
    const safeId = normalizeRecordId(id, 'Tipo de vehiculo no encontrado.')
    const hasName = payload.name !== undefined
    const hasDesc = payload.description !== undefined
    const hasEconomicGroupNumber = payload.economic_group_number !== undefined
    if (!hasName && !hasDesc && !hasEconomicGroupNumber) throw new FleetServiceError('No hay campos validos para actualizar.', 400)
    const before = await getVehicleType(safeCompanyId, safeId)
    try {
      const updated = await withDbErrorMapping(async () => {
        const rows = await prisma.$queryRaw`
          UPDATE fleet_vehicle_type
          SET name = CASE WHEN ${hasName} THEN ${payload.name ?? null} ELSE name END,
              description = CASE WHEN ${hasDesc} THEN ${normalizeOptionalString(payload.description)} ELSE description END,
              economic_group_number = CASE WHEN ${hasEconomicGroupNumber} THEN ${normalizeEconomicNumberPart(payload.economic_group_number)} ELSE economic_group_number END,
              updated_at = now()
          WHERE id = ${safeId} AND company_id = ${safeCompanyId} AND enabled = true RETURNING *
        `
        return firstRow(rows)
      })
      if (!updated) throw new FleetServiceError('Tipo de vehiculo no encontrado.', 404)
      await logAudit({ companyId: safeCompanyId, actorId, entityType: 'VehicleType', entityId: updated.id, action: 'fleet.catalog.vehicle_type.update', before, after: updated })
      return updated
    } catch (error) {
      if (isUniqueViolation(error)) throw new FleetServiceError('Ya existe un tipo de vehiculo con ese nombre.', 409)
      throw error
    }
  }

  async function setVehicleTypeEnabled({ companyId, actorId, id, enabled }) {
    const safeCompanyId = toScopedCompanyUuid(companyId)
    const safeId = normalizeRecordId(id, 'Tipo de vehiculo no encontrado.')
    const before = await getVehicleType(safeCompanyId, safeId)
    const updated = await withDbErrorMapping(async () => {
      const rows = await prisma.$queryRaw`
        UPDATE fleet_vehicle_type SET enabled = ${Boolean(enabled)}, updated_at = now()
        WHERE id = ${safeId} AND company_id = ${safeCompanyId} RETURNING *
      `
      return firstRow(rows)
    })
    if (!updated) throw new FleetServiceError('Tipo de vehiculo no encontrado.', 404)
    await logAudit({ companyId: safeCompanyId, actorId, entityType: 'VehicleType', entityId: updated.id, action: 'fleet.catalog.vehicle_type.disable', before, after: updated, metadata: { enabled: Boolean(enabled) } })
    return updated
  }

  // ── Vehicle Brand ────────────────────────────────────────────────────────────

  async function getVehicleBrand(safeCompanyId, safeId) {
    const rows = await withDbErrorMapping(() => prisma.$queryRaw`
      SELECT * FROM fleet_vehicle_brand WHERE id = ${safeId} AND company_id = ${safeCompanyId} AND enabled = true LIMIT 1
    `)
    const row = firstRow(rows)
    if (!row) throw new FleetServiceError('Marca no encontrada.', 404)
    return row
  }

  async function listVehicleBrands({ companyId, page, pageSize, search }) {
    const safeCompanyId = toScopedCompanyUuid(companyId)
    const pagination = normalizePagination({ page, pageSize })
    const normalizedSearch = normalizeSearch(search)
    const likeValue = normalizedSearch ? `%${normalizedSearch}%` : null
    const [rows, totalRows] = await withDbErrorMapping(async () => {
      const data = await prisma.$queryRaw`
        SELECT * FROM fleet_vehicle_brand WHERE company_id = ${safeCompanyId} AND enabled = true
          AND (${likeValue}::text IS NULL OR name ILIKE ${likeValue})
        ORDER BY name ASC LIMIT ${pagination.pageSize} OFFSET ${pagination.offset}
      `
      const count = await prisma.$queryRaw`
        SELECT COUNT(*)::bigint AS total FROM fleet_vehicle_brand WHERE company_id = ${safeCompanyId} AND enabled = true
          AND (${likeValue}::text IS NULL OR name ILIKE ${likeValue})
      `
      return [data, count]
    })
    return { data: rows, pagination: { page: pagination.page, pageSize: pagination.pageSize, total: toCount(firstRow(totalRows)?.total) } }
  }

  async function createVehicleBrand({ companyId, actorId, payload }) {
    const safeCompanyId = toScopedCompanyUuid(companyId)
    const name = String(payload.name ?? '').trim()
    try {
      const row = await withDbErrorMapping(async () => {
        const rows = await prisma.$queryRaw`
          INSERT INTO fleet_vehicle_brand (company_id, name) VALUES (${safeCompanyId}, ${name}) RETURNING *
        `
        return firstRow(rows)
      })
      await logAudit({ companyId: safeCompanyId, actorId, entityType: 'VehicleBrand', entityId: row?.id ?? null, action: 'fleet.catalog.vehicle_brand.create', before: null, after: row })
      return row
    } catch (error) {
      if (isUniqueViolation(error)) throw new FleetServiceError('Ya existe una marca con ese nombre.', 409)
      throw error
    }
  }

  async function updateVehicleBrand({ companyId, actorId, id, payload }) {
    const safeCompanyId = toScopedCompanyUuid(companyId)
    const safeId = normalizeRecordId(id, 'Marca no encontrada.')
    if (payload.name === undefined) throw new FleetServiceError('No hay campos validos para actualizar.', 400)
    const before = await getVehicleBrand(safeCompanyId, safeId)
    try {
      const updated = await withDbErrorMapping(async () => {
        const rows = await prisma.$queryRaw`
          UPDATE fleet_vehicle_brand SET name = ${payload.name}, updated_at = now()
          WHERE id = ${safeId} AND company_id = ${safeCompanyId} AND enabled = true RETURNING *
        `
        return firstRow(rows)
      })
      if (!updated) throw new FleetServiceError('Marca no encontrada.', 404)
      await logAudit({ companyId: safeCompanyId, actorId, entityType: 'VehicleBrand', entityId: updated.id, action: 'fleet.catalog.vehicle_brand.update', before, after: updated })
      return updated
    } catch (error) {
      if (isUniqueViolation(error)) throw new FleetServiceError('Ya existe una marca con ese nombre.', 409)
      throw error
    }
  }

  async function setVehicleBrandEnabled({ companyId, actorId, id, enabled }) {
    const safeCompanyId = toScopedCompanyUuid(companyId)
    const safeId = normalizeRecordId(id, 'Marca no encontrada.')
    const before = await getVehicleBrand(safeCompanyId, safeId)
    const updated = await withDbErrorMapping(async () => {
      const rows = await prisma.$queryRaw`
        UPDATE fleet_vehicle_brand SET enabled = ${Boolean(enabled)}, updated_at = now()
        WHERE id = ${safeId} AND company_id = ${safeCompanyId} RETURNING *
      `
      return firstRow(rows)
    })
    if (!updated) throw new FleetServiceError('Marca no encontrada.', 404)
    await logAudit({ companyId: safeCompanyId, actorId, entityType: 'VehicleBrand', entityId: updated.id, action: 'fleet.catalog.vehicle_brand.disable', before, after: updated, metadata: { enabled: Boolean(enabled) } })
    return updated
  }

  // ── Vehicle Model ────────────────────────────────────────────────────────────

  async function getVehicleModel(safeCompanyId, safeId) {
    const rows = await withDbErrorMapping(() => prisma.$queryRaw`
      SELECT
        vm.*,
        vb.name AS brand_name,
        vt.name AS type_name,
        CASE
          WHEN vt.economic_group_number IS NULL THEN NULL
          ELSE COALESCE(NULLIF(REGEXP_REPLACE(vt.economic_group_number, '^0+', ''), ''), '0')
        END AS economic_group_number
      FROM fleet_vehicle_model vm
      LEFT JOIN fleet_vehicle_brand vb ON vb.id = vm.brand_id
      LEFT JOIN fleet_vehicle_type vt ON vt.id = vm.type_id
      WHERE vm.id = ${safeId} AND vm.company_id = ${safeCompanyId}
      LIMIT 1
    `)
    const row = firstRow(rows)
    if (!row) throw new FleetServiceError('Modelo de vehiculo no encontrado.', 404)
    return row
  }

  async function listVehicleModels({ companyId, page, pageSize, search, brandId = null, typeId = null, sortBy, sortDir }) {
    const safeCompanyId = toScopedCompanyUuid(companyId)
    const pagination = normalizePagination({ page, pageSize })
    const normalizedSearch = normalizeSearch(search)
    const likeValue = normalizedSearch ? `%${normalizedSearch}%` : null
    const safeBrandId = brandId && UUID_REGEX.test(String(brandId)) ? String(brandId).toLowerCase() : null
    const safeTypeId = typeId && UUID_REGEX.test(String(typeId)) ? String(typeId).toLowerCase() : null

    const [rows, totalRows] = await withDbErrorMapping(async () => {
      const data = await prisma.$queryRaw`
        SELECT vm.id, vm.company_id, vm.brand_id, vb.name AS brand_name,
               vm.type_id, vt.name AS type_name,
               CASE
                 WHEN vt.economic_group_number IS NULL THEN NULL
                 ELSE COALESCE(NULLIF(REGEXP_REPLACE(vt.economic_group_number, '^0+', ''), ''), '0')
               END AS economic_group_number,
               vm.name, vm.year,
               vm.enabled, vm.created_at, vm.updated_at
        FROM fleet_vehicle_model vm
        LEFT JOIN fleet_vehicle_brand vb ON vb.id = vm.brand_id
        LEFT JOIN fleet_vehicle_type vt ON vt.id = vm.type_id
        WHERE vm.company_id = ${safeCompanyId}
          AND vm.enabled = true
          AND (${safeBrandId}::uuid IS NULL OR vm.brand_id = ${safeBrandId}::uuid)
          AND (${safeTypeId}::uuid IS NULL OR vm.type_id = ${safeTypeId}::uuid)
          AND (
            ${likeValue}::text IS NULL
            OR vm.name ILIKE ${likeValue}
            OR vb.name ILIKE ${likeValue}
            OR vt.name ILIKE ${likeValue}
          )
        ORDER BY vb.name ASC, vm.name ASC, vm.year DESC
        LIMIT ${pagination.pageSize} OFFSET ${pagination.offset}
      `
      const count = await prisma.$queryRaw`
        SELECT COUNT(*)::bigint AS total
        FROM fleet_vehicle_model vm
        LEFT JOIN fleet_vehicle_brand vb ON vb.id = vm.brand_id
        LEFT JOIN fleet_vehicle_type vt ON vt.id = vm.type_id
        WHERE vm.company_id = ${safeCompanyId}
          AND vm.enabled = true
          AND (${safeBrandId}::uuid IS NULL OR vm.brand_id = ${safeBrandId}::uuid)
          AND (${safeTypeId}::uuid IS NULL OR vm.type_id = ${safeTypeId}::uuid)
          AND (
            ${likeValue}::text IS NULL
            OR vm.name ILIKE ${likeValue}
            OR vb.name ILIKE ${likeValue}
            OR vt.name ILIKE ${likeValue}
          )
      `
      return [data, count]
    })
    return { data: rows, pagination: { page: pagination.page, pageSize: pagination.pageSize, total: toCount(firstRow(totalRows)?.total) } }
  }

  async function createVehicleModel({ companyId, actorId, payload }) {
    const safeCompanyId = toScopedCompanyUuid(companyId)
    const brandId = normalizeRecordId(payload.brand_id, 'Marca no encontrada.')
    const typeId = normalizeRecordId(payload.type_id, 'Tipo de vehiculo no encontrado.')
    const name = String(payload.name ?? '').trim()
    const year = Number.parseInt(String(payload.year ?? ''), 10)
    if (!name) throw new FleetServiceError('El nombre del modelo es requerido.', 400)
    if (!Number.isFinite(year)) throw new FleetServiceError('El año del modelo es invalido.', 400)
    try {
      const row = await withDbErrorMapping(async () => {
        const rows = await prisma.$queryRaw`
          INSERT INTO fleet_vehicle_model (company_id, brand_id, type_id, name, year)
          VALUES (${safeCompanyId}, ${brandId}::uuid, ${typeId}::uuid, ${name}, ${year})
          RETURNING id, company_id, brand_id, type_id, name, year, enabled, created_at, updated_at
        `
        return firstRow(rows)
      })
      const enriched = await getVehicleModel(safeCompanyId, row.id)
      await logAudit({ companyId: safeCompanyId, actorId, entityType: 'VehicleModel', entityId: row?.id ?? null, action: 'fleet.catalog.vehicle_model.create', before: null, after: enriched })
      return enriched
    } catch (error) {
      if (isUniqueViolation(error)) throw new FleetServiceError('Ya existe un modelo con esa combinacion de marca, tipo, nombre y año.', 409)
      throw error
    }
  }

  async function updateVehicleModel({ companyId, actorId, id, payload }) {
    const safeCompanyId = toScopedCompanyUuid(companyId)
    const safeId = normalizeRecordId(id, 'Modelo de vehiculo no encontrado.')
    const hasBrandId = payload.brand_id !== undefined
    const hasTypeId = payload.type_id !== undefined
    const hasName = payload.name !== undefined
    const hasYear = payload.year !== undefined
    if (!hasBrandId && !hasTypeId && !hasName && !hasYear) throw new FleetServiceError('No hay campos validos para actualizar.', 400)
    const before = await getVehicleModel(safeCompanyId, safeId)
    const brandId = hasBrandId ? normalizeRecordId(payload.brand_id, 'Marca no encontrada.') : null
    const typeId = hasTypeId ? normalizeRecordId(payload.type_id, 'Tipo de vehiculo no encontrado.') : null
    const name = hasName ? String(payload.name ?? '').trim() : null
    const year = hasYear ? Number.parseInt(String(payload.year ?? ''), 10) : null
    try {
      const updated = await withDbErrorMapping(async () => {
        const rows = await prisma.$queryRaw`
          UPDATE fleet_vehicle_model
          SET brand_id = CASE WHEN ${hasBrandId} THEN ${brandId}::uuid ELSE brand_id END,
              type_id = CASE WHEN ${hasTypeId} THEN ${typeId}::uuid ELSE type_id END,
              name = CASE WHEN ${hasName} THEN ${name} ELSE name END,
              year = CASE WHEN ${hasYear} THEN ${year} ELSE year END,
              updated_at = now()
          WHERE id = ${safeId} AND company_id = ${safeCompanyId}
          RETURNING id
        `
        return firstRow(rows)
      })
      if (!updated) throw new FleetServiceError('Modelo de vehiculo no encontrado.', 404)
      const enriched = await getVehicleModel(safeCompanyId, safeId)
      await logAudit({ companyId: safeCompanyId, actorId, entityType: 'VehicleModel', entityId: safeId, action: 'fleet.catalog.vehicle_model.update', before, after: enriched })
      return enriched
    } catch (error) {
      if (isUniqueViolation(error)) throw new FleetServiceError('Ya existe un modelo con esa combinacion de marca, tipo, nombre y año.', 409)
      throw error
    }
  }

  async function setVehicleModelEnabled({ companyId, actorId, id, enabled }) {
    const safeCompanyId = toScopedCompanyUuid(companyId)
    const safeId = normalizeRecordId(id, 'Modelo de vehiculo no encontrado.')
    const before = await getVehicleModel(safeCompanyId, safeId)
    const updated = await withDbErrorMapping(async () => {
      const rows = await prisma.$queryRaw`
        UPDATE fleet_vehicle_model SET enabled = ${Boolean(enabled)}, updated_at = now()
        WHERE id = ${safeId} AND company_id = ${safeCompanyId} RETURNING id, enabled
      `
      return firstRow(rows)
    })
    if (!updated) throw new FleetServiceError('Modelo de vehiculo no encontrado.', 404)
    await logAudit({ companyId: safeCompanyId, actorId, entityType: 'VehicleModel', entityId: updated.id, action: 'fleet.catalog.vehicle_model.disable', before, after: updated, metadata: { enabled: Boolean(enabled) } })
    return updated
  }

  async function getVehicleTypeById({ companyId, id }) {
    const safeCompanyId = toScopedCompanyUuid(companyId)
    const safeId = normalizeRecordId(id, 'Tipo de vehiculo no encontrado.')
    return getVehicleType(safeCompanyId, safeId)
  }

  async function getVehicleBrandById({ companyId, id }) {
    const safeCompanyId = toScopedCompanyUuid(companyId)
    const safeId = normalizeRecordId(id, 'Marca no encontrada.')
    return getVehicleBrand(safeCompanyId, safeId)
  }

  async function getVehicleModelById({ companyId, id }) {
    const safeCompanyId = toScopedCompanyUuid(companyId)
    const safeId = normalizeRecordId(id, 'Modelo de vehiculo no encontrado.')
    return getVehicleModel(safeCompanyId, safeId)
  }

  return {
    listVehicleTypes, getVehicleTypeById, createVehicleType, updateVehicleType, setVehicleTypeEnabled,
    listVehicleBrands, getVehicleBrandById, createVehicleBrand, updateVehicleBrand, setVehicleBrandEnabled,
    listVehicleModels, getVehicleModelById, createVehicleModel, updateVehicleModel, setVehicleModelEnabled,
  }
}


