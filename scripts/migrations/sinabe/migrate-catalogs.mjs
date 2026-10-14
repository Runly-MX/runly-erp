// Phase 1: catalogs (types, brands, locations, conditions, models) and custom
// field definitions. Existing Runly rows are matched by name (case/accent
// insensitive) and only remembered; rows the migrator creates also get a
// `created.<entity>` LegacyRef so rollback can tell them apart.
import { foldName, CONDITION_PRIORITY } from './mapping/item.mjs'
import { fieldDefinitions } from './mapping/custom-fields.mjs'
import { errorCode } from './migrate-files.mjs'

export const createdMarker = (entity) => `created.${entity}`

// rows: [{ legacyId, key, create(tx) -> id }]; existing: Map<key, id> (mutated).
// Returns Map<legacyId, runlyId> (placeholders `dry:` in dry-run).
export async function syncCatalog(run, { entity, reportName, rows, existing }) {
  const ids = new Map()
  const refs = await run.refs.findMany(entity, rows.map((row) => row.legacyId))
  for (const row of rows) {
    const legacyId = String(row.legacyId)
    try {
      const ref = refs.get(legacyId)
      if (ref) { ids.set(legacyId, ref); existing.set(row.key, existing.get(row.key) ?? ref); run.report.count(reportName, 'matched'); continue }
      const match = existing.get(row.key)
      if (match) {
        if (run.commit && !String(match).startsWith('dry:')) await run.prisma.$transaction((tx) => run.refs.remember(tx, entity, legacyId, match))
        ids.set(legacyId, match)
        run.report.count(reportName, String(match).startsWith('dry:') ? 'created' : 'matched')
        continue
      }
      if (!run.commit) {
        const placeholder = `dry:${entity}:${legacyId}`
        ids.set(legacyId, placeholder); existing.set(row.key, placeholder); run.report.count(reportName, 'created')
        continue
      }
      const result = await run.refs.ensure(entity, legacyId, async (tx) => {
        const id = await row.create(tx)
        await run.refs.remember(tx, createdMarker(entity), legacyId, id)
        return id
      })
      ids.set(legacyId, result.id); existing.set(row.key, result.id)
      run.report.count(reportName, result.created ? 'created' : 'matched')
    } catch (error) {
      run.report.error(reportName, errorCode(entity.toUpperCase().replace(/\./g, '_'), error), legacyId)
    }
  }
  return ids
}

const nameOr = (value, fallback, max) => (String(value ?? '').trim() || fallback).slice(0, max)

async function existingByName(prisma, model, companyId) {
  const rows = await prisma[model].findMany({ where: { companyId }, select: { id: true, name: true, enabled: true }, orderBy: [{ enabled: 'desc' }, { createdAt: 'asc' }] })
  const out = new Map()
  for (const row of rows) if (!out.has(foldName(row.name))) out.set(foldName(row.name), row.id)
  return out
}

async function simpleCatalog(run, { entity, reportName, model, rows, label, max = 100, extra = () => ({}) }) {
  const { companyId } = run
  return syncCatalog(run, {
    entity, reportName, existing: await existingByName(run.prisma, model, companyId),
    rows: rows.map((row) => {
      const name = nameOr(row.name, `${label} ${row.id}`, max)
      return { legacyId: row.id, key: foldName(name), create: async (tx) => (await tx[model].create({ data: { companyId, name, enabled: row.enabled !== false, ...extra(row, name) } })).id }
    }),
  })
}

const PRIORITY = new Map(CONDITION_PRIORITY.map((name, index) => [foldName(name), index]))

export async function migrateCatalogs(run) {
  const { source } = run.model
  const { companyId, prisma } = run
  const out = {}
  out.categories = await simpleCatalog(run, { entity: 'inv_category', reportName: 'categories', model: 'invCategory', rows: source.inventoryTypes, label: 'Tipo' })
  out.brands = await simpleCatalog(run, { entity: 'inv_brand', reportName: 'brands', model: 'invBrand', rows: source.inventoryBrands, label: 'Marca' })
  out.locations = await simpleCatalog(run, { entity: 'inv_location', reportName: 'locations', model: 'invLocation', rows: source.locations, label: 'Ubicación' })
  out.conditions = await simpleCatalog(run, {
    entity: 'inv_condition', reportName: 'conditions', model: 'invCondition', rows: source.conditions, label: 'Condición',
    extra: (row, name) => ({ sortOrder: PRIORITY.get(foldName(name)) ?? CONDITION_PRIORITY.length }),
  })
  // Condition name -> Runly id (items pick their primary condition by name).
  out.conditionByName = new Map(source.conditions.map((row) => [foldName(row.name), out.conditions.get(String(row.id))]).filter(([, id]) => id))

  const existingModels = new Map()
  for (const row of await prisma.invModel.findMany({ where: { companyId, year: null }, select: { id: true, brandId: true, nameKey: true } })) {
    existingModels.set(`${row.brandId}|${row.nameKey}`, row.id)
  }
  const modelRows = []
  for (const model of source.models) {
    const typeId = out.categories.get(String(model.typeId))
    const brandId = out.brands.get(String(model.brandId))
    if (!typeId || !brandId) { run.report.count('models', 'skipped'); run.report.warn('MODEL_WITHOUT_TYPE_OR_BRAND'); continue }
    const name = nameOr(model.name, `Modelo ${model.id}`, 255)
    const nameKey = name.trim().toLocaleLowerCase('es')
    modelRows.push({
      legacyId: model.id, key: `${brandId}|${nameKey}`,
      create: async (tx) => (await tx.invModel.create({ data: { companyId, name, nameKey, typeId, brandId, year: null, enabled: model.enabled !== false } })).id,
    })
  }
  out.models = await syncCatalog(run, { entity: 'inv_model', reportName: 'models', rows: modelRows, existing: existingModels })

  const existingFields = new Map()
  for (const row of await prisma.invCustomField.findMany({ where: { companyId, categoryId: null }, select: { id: true, fieldKey: true }, orderBy: { createdAt: 'asc' } })) {
    if (!existingFields.has(row.fieldKey)) existingFields.set(row.fieldKey, row.id)
  }
  const defs = fieldDefinitions(source)
  const fieldIds = await syncCatalog(run, {
    entity: 'inv_custom_field', reportName: 'customFields', existing: existingFields,
    rows: defs.map((def, index) => ({
      legacyId: def.fieldKey, key: def.fieldKey,
      create: async (tx) => (await tx.invCustomField.create({ data: { companyId, label: def.label, fieldKey: def.fieldKey, fieldType: 'text', enabled: true, sortOrder: 900 + index } })).id,
    })),
  })
  out.fieldIdByKey = fieldIds
  return out
}
