// Single place where custody (resguardo) API responses are unwrapped and
// normalized. If the backend contract changes shape, adjust only this file.

export const CUSTODY_STATUS = {
  DRAFT: { label: 'Borrador', variant: 'secondary' },
  PENDING_SIGNATURE: { label: 'Pendiente de firma', variant: 'warning' },
  COMPLETED: { label: 'Completado', variant: 'success' },
  CANCELLED: { label: 'Cancelado', variant: 'destructive' },
}

export const CUSTODY_KIND = {
  DELIVERY: 'Entrega',
  RETURN: 'Devolución',
}

export const CUSTODY_STATUS_OPTIONS = Object.entries(CUSTODY_STATUS).map(([value, { label }]) => ({ value, label }))
export const CUSTODY_KIND_OPTIONS = Object.entries(CUSTODY_KIND).map(([value, label]) => ({ value, label }))

const personName = (person) => (person ? [person.firstName, person.lastName].filter(Boolean).join(' ') || person.name || person.displayName || null : null)

const flag = (value, fallback) => (typeof value === 'boolean' ? value : Boolean(fallback))

export function normalizeCustody(raw) {
  if (!raw) return null
  const items = (Array.isArray(raw.items) ? raw.items : []).map((row) => ({
    ...row, editedFields: Array.isArray(row?.editedFields) ? row.editedFields : [],
  }))
  const employee = raw.employee ?? null
  return {
    ...raw,
    items,
    receiverSignatureUrl: raw.receiverSignatureUrl ?? null,
    delivererSignatureUrl: raw.delivererSignatureUrl ?? null,
    employeeName: raw.employeeName ?? personName(employee) ?? '—',
    employeeEmail: raw.employeeEmail ?? employee?.workEmail ?? employee?.email ?? employee?.personalEmail ?? null,
    delivererId: raw.delivererId ?? raw.deliverer?.id ?? null,
    delivererName: raw.delivererName ?? personName(raw.deliverer) ?? null,
    itemCount: raw.itemCount ?? raw._count?.items ?? items.length,
    receiverSigned: flag(raw.receiverSigned, raw.receiverSignedAt ?? raw.receiverSignatureFileId),
    delivererSigned: flag(raw.delivererSigned, raw.delivererSignedAt ?? raw.delivererSignatureFileId),
    hasPublicLink: flag(raw.hasPublicLink, raw.tokenExpiresAt),
    hasDocument: flag(raw.hasDocument, raw.documentFileId),
  }
}

export const isCustodyEditable = (custody) => custody?.status === 'DRAFT' || custody?.status === 'PENDING_SIGNATURE'

// Changing kind, employee or items clears captured signatures (spec §9.4).
export const SIGNATURE_RESET_FIELDS = ['kind', 'employeeId', 'itemIds']
export function editClearsSignatures(custody, patch) {
  if (!custody?.receiverSigned && !custody?.delivererSigned) return false
  return SIGNATURE_RESET_FIELDS.some((key) => key in (patch ?? {}))
}

// Editing a snapshot row (spec §10.2) also clears captured signatures.
export const itemEditClearsSignatures = (custody) => Boolean(custody?.receiverSigned || custody?.delivererSigned)

// Hand-editable snapshot fields -> max length (mirrors the API).
export const EDITABLE_ITEM_FIELDS = { typeBrand: 255, model: 255, serialNumber: 255, assetTag: 100, invoiceNumber: 100, features: 500 }

export const isEditedField = (row, key) => Array.isArray(row?.editedFields) && row.editedFields.includes(key)

// Inline cell text -> PATCH item body; null when nothing changes. Empty text
// clears the override (restores the item value).
export function itemFieldPatch(row, key, text) {
  if (!(key in EDITABLE_ITEM_FIELDS)) return null
  const value = String(text ?? '').trim().slice(0, EDITABLE_ITEM_FIELDS[key])
  if (!value) return isEditedField(row, key) ? { [key]: null } : null
  return value === (row?.[key] ?? '') ? null : { [key]: value }
}

// Snapshot rows -> picker rows ({ id, name, assetTag, serialNumber }).
export const custodyPickerRows = (custody) => (custody?.items ?? []).map((row) => ({
  id: row.itemId ?? row.item?.id ?? row.id,
  name: row.item?.name ?? ([row.typeBrand, row.model].filter(Boolean).join(' ') || null),
  assetTag: row.assetTag ?? row.item?.assetTag ?? null,
  serialNumber: row.serialNumber ?? row.item?.serialNumber ?? null,
}))

// GET /inventory/custodies/deliverers -> { users: [{ id, name, email, avatarUrl, hasSavedSignature, allowDelegation }] }
export function parseDeliverers(res) {
  const rows = res?.users ?? res?.data ?? (Array.isArray(res) ? res : [])
  return rows.filter((u) => u && !u.isBot).map((u) => ({
    id: u.id,
    name: u.name ?? u.displayName ?? u.email ?? '—',
    email: u.email ?? null,
    avatarUrl: u.avatarUrl ?? null,
    hasSavedSignature: Boolean(u.hasSavedSignature),
    allowDelegation: Boolean(u.allowDelegation),
  }))
}

// GET /inventory/custodies -> { items, total }
export function parseCustodyList(res) {
  const rows = res?.items ?? res?.data ?? (Array.isArray(res) ? res : [])
  return { items: rows.map(normalizeCustody), total: res?.total ?? rows.length }
}

// Single custody endpoints -> { custody }
export const parseCustody = (res) => normalizeCustody(res?.custody ?? res?.data ?? res)

// POST public-link -> { url, path, token, expiresAt, emailSent }
export const parsePublicLink = (res) => ({ url: res?.url ?? null, expiresAt: res?.expiresAt ?? null, emailSent: Boolean(res?.emailSent) })

// GET document -> { url, expiresIn, fileName, mimeType } (signed URL). Preview is a blob (see useCustodyFileUrl).
export const parseFileUrl = (res) => ({ url: res?.url ?? res?.signedUrl ?? null, format: res?.format ?? null })

// GET /inventory/document-templates -> { templates }; single -> { template }
export const parseTemplates = (res) => res?.templates ?? res?.data ?? (Array.isArray(res) ? res : [])
export const parseTemplate = (res) => res?.template ?? res?.data ?? res

// Detected {{ }} tag count; falls back to the stored placeholder list.
export function templateTagCount(template) {
  if (typeof template?.tagCount === 'number') return template.tagCount
  const tags = template?.placeholders?.tags ?? template?.placeholders?.known ?? (Array.isArray(template?.placeholders) ? template.placeholders : null)
  return Array.isArray(tags) ? tags.length : null
}

// Upload/validation warnings may come as strings or { tag, message }.
export function templateWarnings(template) {
  const raw = template?.warnings ?? template?.placeholders?.unknown ?? []
  return (Array.isArray(raw) ? raw : []).map((w) => (typeof w === 'string' ? w : w?.message ?? (w?.tag ? `Etiqueta desconocida: ${w.tag}` : String(w))))
}

// GET /public/inventory/custody/:token
export function parsePublicCustody(res) {
  const raw = res?.custody ?? res?.data ?? res ?? {}
  const items = (Array.isArray(raw.items) ? raw.items : []).map((row, i) => ({ ...row, index: row.index ?? i + 1 }))
  return {
    folio: raw.folio,
    date: raw.date,
    status: raw.status,
    kind: raw.kind,
    companyName: raw.companyName ?? raw.company?.name ?? null,
    companyLogoUrl: raw.companyLogoUrl ?? raw.company?.logoUrl ?? null,
    receiverName: raw.receiverName ?? personName(raw.receiver) ?? null,
    receiverDepartment: raw.receiverDepartment ?? null,
    receiverJobTitle: raw.receiverJobTitle ?? null,
    delivererName: raw.delivererName ?? null,
    comments: raw.comments ?? null,
    itemCount: raw.itemCount ?? items.length,
    receiverSigned: Boolean(raw.receiverSigned ?? raw.receiverSignedAt),
    expiresAt: raw.expiresAt ?? raw.tokenExpiresAt ?? null,
    items,
  }
}

// The API expects plain base64 PNG (no data URL prefix).
export const dataUrlToBase64 = (dataUrl) => String(dataUrl ?? '').replace(/^data:image\/png;base64,/, '')

export function formatCustodyDate(value) {
  if (!value) return '—'
  const iso = String(value).slice(0, 10)
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : String(value)
}

export const itemDescription = (row) => [row.typeBrand, row.model].filter(Boolean).join(' · ') || row.name || '—'
