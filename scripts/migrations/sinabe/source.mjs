// Typed accessors over a sinabe mysqldump.
//
// loadSinabe(dumpPath) -> Promise<SinabeSource>
//
// SinabeSource = {
//   meta: {
//     appliedMigrations: string[]   // _prisma_migrations.migration_name, finished and not rolled back, sorted
//     missingTables: string[]       // sinabe tables (current schema) absent from the dump
//     missingColumns: { [table]: string[] }  // current-schema columns absent from a present table (rows get null)
//     extraColumns: { [table]: string[] }    // dump columns the current schema no longer has (ignored)
//     jsonParseErrors: number       // Json cells that were not valid JSON (kept as raw string)
//   },
//   // Each array holds plain objects keyed by sinabe Prisma field names.
//   // Types: string/enum -> string|null, Int -> number|null, Float -> number|null,
//   // Boolean -> boolean|null, DateTime -> Date|null (dump is UTC), Json -> parsed value|null.
//   inventories:           { id, status, createdById, activeNumber, serialNumber, comments, modelId, enabled, receptionDate,
//                            createdAt, updatedAt, details, altaDate, bajaDate, internalFolio, invoiceId, purchaseOrderId, locationId }[]
//   models:                { id, name, typeId, brandId, enabled }[]
//   inventoryTypes:        { id, enabled, name }[]
//   inventoryBrands:       { id, name, enabled }[]
//   locations:             { id, name, enabled }[]                       // table InventoryLocation
//   conditions:            { id, name, enabled }[]
//   inventoryConditions:   { id, inventoryId, conditionId }[]
//   customFields:          { id, name, enabled, createdAt }[]
//   inventoryCustomFields: { id, inventoryId, customFieldId, value }[]
//   verticals:             { id, name, enabled, createdAt, description, updatedAt }[]
//   modelVerticals:        { id, modelId, verticalId }[]
//   purchaseOrders:        { id, code, supplier, description, projectId, createdAt, updatedAt, createdById }[]
//   invoices:              { id, code, concept, supplier, fileUrl, purchaseOrderId, createdAt, updatedAt, createdById, xmlUrl }[]
//   files:                 { id, inventoryId, metadata, uploadedAt, createdAt, enabled, type, url }[]
//   images:                { id, url, thumbnail, type, metadata, createdAt, enabled, inventoryId }[]
//   users:                 { id, firstName, lastName, email, userName, phone, status, roleId, createdAt, updatedAt, enabled,
//                            employeeNumber, jobTitle, department }[]          // password never loaded
//   userImages:            { id, url, thumbnail, type, metadata, enabled, createdAt, userId }[]
//   custodyRecords:        { id, code, date, receiverId, delivererId, comments, fileId, status, receiverSignature,
//                            delivererSignature, enabled, createdAt, updatedAt }[]  // publicToken/tokenExpiresAt never loaded
//   custodyItems:          { id, custodyRecordId, inventoryId, typeBrand, model, serialNumber, assetNumber, invoiceNumber, features }[]
//   auditLogs:             { id, entityType, entityId, action, entityTitle, changes, userId, createdAt }[]  // changes: raw string
//   projects:              { id, code, name, description, provider, status, budgetTotal, budgetUsed, startDate, endDate,
//                            createdAt, updatedAt, enabled, createdById }[]
//   deadlines:             { id, name, description, status, dueDate, projectId, createdAt, updatedAt, enabled, createdById, order }[]
//   deadlineTasks:         { id, name, date, deadlineId, enabled, createdAt, updatedAt, createdById, description, order, status }[]
//   inventoryDeadlines:    { id, inventoryId, deadlineId }[]
//   projectMembers:        { id, role, name, projectId, userId }[]
//   projectDocuments:      { id, name, fileUrl, description, metadata, enabled, uploadDate, projectId, createdAt, updatedAt, createdById }[]
//   events:                { id, title, description, scheduledDate, completedDate, status, provider, type, scope, verticalId,
//                            isRecurring, recurrence, recurrenceEndDate, seriesId, createdAt, updatedAt, createdById }[]
//   eventAttendees:        { id, eventId, userId }[]
//   deadlineUsers:         { deadlineId, userId }[]                      // implicit _DeadlineUsers
//   taskUsers:             { taskId, userId }[]                          // implicit _TaskUsers
// }
// Missing tables yield empty arrays. Field catalog: source-schema.mjs.
import { readDump } from './dump-reader.mjs'
import { SINABE_TABLES, MIGRATIONS_TABLE } from './source-schema.mjs'

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(\.\d+)?)?/

export function toDate(value) {
  if (value == null) return null
  if (value instanceof Date) return value
  const m = DATE_RE.exec(String(value))
  if (!m || m[1] === '0000') return null
  const ms = m[7] ? Math.round(Number(m[7]) * 1000) : 0
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), ms))
  return Number.isNaN(date.getTime()) ? null : date
}

function convert(kind, value, meta) {
  if (value == null) return null
  if (Buffer.isBuffer(value)) value = value.toString('utf8')
  switch (kind) {
    case 'i': case 'f': {
      const num = Number(value)
      return Number.isFinite(num) ? num : null
    }
    case 'b': return value === true || value === 1 || value === '1' || value === 'true'
    case 'd': return toDate(value)
    case 'j':
      if (typeof value !== 'string') return value
      try { return JSON.parse(value) } catch { meta.jsonParseErrors++; return value }
    default: return String(value)
  }
}

export function buildSource(parsed) {
  const meta = { appliedMigrations: [], missingTables: [], missingColumns: {}, extraColumns: {}, jsonParseErrors: 0 }
  const source = { meta }
  for (const [key, def] of Object.entries(SINABE_TABLES)) {
    const table = parsed.tables[def.table]
    if (!table) { meta.missingTables.push(def.table); source[key] = []; continue }
    const fieldNames = Object.keys(def.fields)
    const dumpColumns = table.columns.length ? table.columns : Object.keys(table.rows[0] ?? {})
    const missing = fieldNames.filter((f) => !dumpColumns.includes(f))
    const extra = dumpColumns.filter((c) => !(c in def.fields))
    if (missing.length) meta.missingColumns[def.table] = missing
    // Sensitive columns that are skipped on purpose are not schema drift.
    const ignored = new Set(['password', 'publicToken', 'tokenExpiresAt'])
    const reallyExtra = extra.filter((c) => !ignored.has(c))
    if (reallyExtra.length) meta.extraColumns[def.table] = reallyExtra
    source[key] = table.rows.map((row) => {
      const out = {}
      for (const field of fieldNames) out[def.rename?.[field] ?? field] = convert(def.fields[field], row[field], meta)
      return out
    })
  }
  const migrations = parsed.tables[MIGRATIONS_TABLE]?.rows ?? []
  meta.appliedMigrations = migrations
    .filter((m) => m.finished_at != null && m.rolled_back_at == null)
    .map((m) => String(m.migration_name))
    .sort()
  if (!parsed.tables[MIGRATIONS_TABLE]) meta.missingTables.push(MIGRATIONS_TABLE)
  return source
}

export async function loadSinabe(dumpPath) {
  const tables = [...Object.values(SINABE_TABLES).map((d) => d.table), MIGRATIONS_TABLE]
  return buildSource(await readDump(dumpPath, { tables }))
}
