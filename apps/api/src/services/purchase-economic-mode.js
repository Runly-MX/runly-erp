// Compatibility boundary: no new columns are selected on legacy Prisma models.
// A null total is reserved for documentary records; financial zero stays zero.
import { Prisma } from '@prisma/client'
import { PurchasesServiceError, cleanText, plain } from './purchases-shared.js'

export const DOCUMENTARY_PROFILE = {
  capabilities: { requests: false, quotes: false, approvals: false, purchaseOrders: true, receipts: false, invoices: true, payments: false, inventoryRelations: true },
  stages: ['PURCHASE_ORDER', 'INVOICE', 'RELATE', 'CLOSE'].map(type => ({ type, mode: 'OPTIONAL' })),
  policies: [],
}
export const isDocumentary = doc => doc?.total === null
export const economicModeOf = doc => isDocumentary(doc) ? 'DOCUMENTARY' : 'FINANCIAL'
export const DOCUMENTARY_FIELDS = ['reference', 'description', 'supplierId', 'issueDate', 'expectedDate', 'notes', 'fiscalUuid']

export function assertFinancialDocument(doc) {
  if (isDocumentary(doc)) throw new PurchasesServiceError('Un documento documental no admite operaciones financieras ni conversión implícita.', 409, 'DOCUMENTARY_OPERATION_BLOCKED')
}

export function assertDocumentaryInput(input, extra = []) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PurchasesServiceError('Datos documentales no válidos.', 422, 'VALIDATION')
  const allowed = new Set([...DOCUMENTARY_FIELDS, 'lines', 'orderIds', 'inventoryIds', 'inheritItems', 'expectedVersion', 'expectedUpdatedAt', 'reason', 'idempotencyKey', ...extra])
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new PurchasesServiceError(`El campo ${key} no se admite en control documental.`, 422, 'DOCUMENTARY_FIELD_NOT_ALLOWED', { field: key })
  }
  for (const key of ['lines', 'orderIds', 'inventoryIds']) if (input[key] != null && !Array.isArray(input[key])) throw new PurchasesServiceError(`El campo ${key} debe ser una lista.`, 422, 'VALIDATION', { field: key })
  for (const line of input.lines ?? []) {
    if (!line || typeof line !== 'object' || Array.isArray(line)) throw new PurchasesServiceError('Partida no válida.', 422, 'VALIDATION')
    for (const key of Object.keys(line)) if (!['description', 'quantity', 'unit', 'itemKind', 'categoryId'].includes(key)) {
      throw new PurchasesServiceError('Las partidas documentales no admiten importes ni impuestos.', 422, 'DOCUMENTARY_FIELD_NOT_ALLOWED', { field: key })
    }
  }
}

export function documentaryProjection(row, reference = null) {
  const out = plain(row)
  out.economicMode = economicModeOf(row)
  out.economicCaptureEnabled = !isDocumentary(row)
  if (!isDocumentary(row)) return out
  return {
    ...out, reference: reference ?? row.reference ?? null,
    subtotal: null, tax: null, total: null, paidAmount: null, balance: null, currency: null,
    dueDate: null, paidAt: null, paymentTerms: null, paymentReference: null, paymentMethod: null,
    statusLabel: row.status === 'CANCELLED' ? 'Cancelada' : 'Referencia registrada',
    unknownFields: ['subtotal', 'tax', 'total', 'paidAmount', ...(row.issueDate === null ? ['issueDate'] : []), ...(row.supplierId === null ? ['supplierId'] : [])],
    editableFields: row.status === 'CANCELLED' ? ['notes'] : DOCUMENTARY_FIELDS,
    allowedActions: row.status === 'CANCELLED' ? ['correct'] : ['correct', 'relate', 'attach', 'cancel'],
    historicalDataPreserved: true, conversionAllowed: false,
  }
}

export function createPurchaseEconomicMode({ prisma }) {
  // Per-client probes; an unavailable migration never aborts a financial transaction.
  let probe = null
  async function available() {
    if (probe && probe.expires > Date.now()) return probe.value
    let row
    try { [row] = await prisma.$queryRaw`SELECT to_regclass('public.purchase_documentary_reference')::text AS name` } catch { row = null }
    const value = Boolean(row?.name)
    probe = { value, expires: Date.now() + (value ? 60000 : 1000) }
    return value
  }
  async function requireAvailable() {
    if (!(await available())) throw new PurchasesServiceError('Control documental requiere la migración de esta instancia.', 409, 'DOCUMENTARY_UNAVAILABLE')
  }
  async function companyMode(companyId, client = prisma) {
    // The core config table predates this feature. Old test adapters may omit it.
    if (typeof client.instanceConfig?.findUnique !== 'function') return 'FINANCIAL'
    const row = await client.instanceConfig.findUnique({ where: { key: `purchases.economicMode.${companyId}` } })
    return row?.value === 'DOCUMENTARY' ? 'DOCUMENTARY' : 'FINANCIAL'
  }
  async function setMode(tx, companyId, mode) {
    if (!['FINANCIAL', 'DOCUMENTARY'].includes(mode)) throw new PurchasesServiceError('Modalidad económica no válida.', 422, 'VALIDATION')
    if (mode === 'DOCUMENTARY') await requireAvailable()
    const key = `purchases.economicMode.${companyId}`
    await tx.instanceConfig.upsert({ where: { key }, create: { key, value: mode }, update: { value: mode } })
  }
  async function metadata(companyId, ids, client = prisma) {
    if (!ids.length || !(await available())) return new Map()
    const rows = await client.$queryRaw`SELECT document_id, reference, description FROM purchase_documentary_reference
      WHERE company_id = ${companyId}::uuid AND document_id IN (${Prisma.join(ids.map(id => Prisma.sql`${id}::uuid`))})`
    return new Map(rows.map(row => [row.document_id, { reference: row.reference, description: row.description }]))
  }
  async function references(companyId, ids, client = prisma) {
    return new Map([...(await metadata(companyId, ids, client))].map(([id, value]) => [id, value.reference]))
  }
  async function projectMany(companyId, rows, client = prisma) {
    const meta = await metadata(companyId, rows.filter(isDocumentary).map(row => row.id), client)
    return rows.map(row => documentaryProjection(meta.has(row.id) ? { ...row, description: meta.get(row.id).description } : row, meta.get(row.id)?.reference))
  }
  async function matchingIds(companyId, search, type) {
    if (!search || !(await available())) return []
    const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`
    const rows = await prisma.$queryRaw`SELECT document_id FROM purchase_documentary_reference
      WHERE company_id = ${companyId}::uuid AND document_type = ${type} AND reference ILIKE ${pattern} LIMIT 1000`
    return rows.map(row => row.document_id)
  }
  return { available, requireAvailable, companyMode, setMode, metadata, references, projectMany, matchingIds }
}
