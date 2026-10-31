import { z } from 'zod'

// Control documental capture (POST /purchases/orders|invoices in a company in
// DOCUMENTARY mode). The only required value is the reference; the API
// rejects any economic field (DOCUMENTARY_FIELD_NOT_ALLOWED), so the payload
// carries only the documentary fields that have a value.

const optionalText = (max) => z.string().max(max).optional().nullable()
const line = z.object({
  description: z.string().max(500).optional().nullable(),
  itemKind: z.enum(['GOODS', 'SERVICE']),
  quantity: z.union([z.literal(''), z.coerce.number().positive('Mayor a 0')]).optional().nullable(),
  unit: z.string().max(20).optional().nullable(),
})

export const documentarySchema = (kind) => z.object({
  reference: z.string().trim().min(1, 'Escribe el nombre, código o referencia').max(255, 'Máximo 255 caracteres'),
  description: optionalText(2000),
  supplierId: z.string().nullable().optional(),
  issueDate: z.string().optional().nullable(),
  expectedDate: z.string().optional().nullable(),
  fiscalUuid: z.string().trim().max(36).regex(/^$|^[0-9a-fA-F-]{36}$/, 'El UUID fiscal tiene 36 caracteres').optional().nullable(),
  notes: optionalText(2000),
  lines: z.array(line),
  orderIds: z.array(z.string()),
  inventoryIds: z.array(z.string()),
  inheritItems: z.boolean(),
}).refine((v) => kind !== 'orders' || !v.expectedDate || !v.issueDate || v.expectedDate >= v.issueDate, { path: ['expectedDate'], message: 'La entrega no puede ser antes del documento' })

// No date is assumed: an unknown date stays unknown (never "today").
export function documentaryDefaults({ inventoryIds = [], orderIds = [] } = {}) {
  return { reference: '', description: '', supplierId: null, issueDate: '', expectedDate: '', fiscalUuid: '', notes: '', lines: [], orderIds, inventoryIds, inheritItems: true }
}

export const emptyDocumentaryLine = () => ({ description: '', itemKind: 'GOODS', quantity: '', unit: '' })

const has = (value) => value !== undefined && value !== null && String(value).trim() !== ''

export function documentaryPayload(kind, values, { idempotencyKey } = {}) {
  const out = { reference: values.reference.trim() }
  if (has(values.description)) out.description = values.description.trim()
  if (has(values.supplierId)) out.supplierId = values.supplierId
  if (has(values.issueDate)) out.issueDate = values.issueDate
  if (kind === 'orders' && has(values.expectedDate)) out.expectedDate = values.expectedDate
  if (kind === 'invoices' && has(values.fiscalUuid)) out.fiscalUuid = values.fiscalUuid.trim()
  if (has(values.notes)) out.notes = values.notes.trim()
  const lines = (values.lines ?? [])
    .filter((l) => has(l.description) || has(l.quantity))
    .map((l) => ({
      description: (l.description ?? '').trim(), itemKind: l.itemKind === 'SERVICE' ? 'SERVICE' : 'GOODS',
      ...(has(l.quantity) ? { quantity: Number(l.quantity) } : {}), ...(has(l.unit) ? { unit: l.unit.trim() } : {}),
    }))
  if (lines.length) out.lines = lines
  if (kind === 'invoices' && values.orderIds?.length) { out.orderIds = values.orderIds.slice(0, 1); out.inheritItems = Boolean(values.inheritItems) }
  if (values.inventoryIds?.length) out.inventoryIds = values.inventoryIds
  if (idempotencyKey) out.idempotencyKey = idempotencyKey
  return out
}
