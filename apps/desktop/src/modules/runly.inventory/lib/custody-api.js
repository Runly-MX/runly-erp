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

export function normalizeCustody(raw) {
  if (!raw) return null
  const items = Array.isArray(raw.items) ? raw.items : []
  return {
    ...raw,
    items,
    employeeName: raw.employeeName ?? personName(raw.employee) ?? '—',
    delivererName: raw.delivererName ?? personName(raw.deliverer) ?? null,
    itemCount: raw.itemCount ?? raw._count?.items ?? items.length,
    receiverSigned: Boolean(raw.receiverSignedAt ?? raw.receiverSignatureFileId),
    delivererSigned: Boolean(raw.delivererSignedAt ?? raw.delivererSignatureFileId),
    hasDocument: Boolean(raw.documentFileId),
  }
}

// GET /inventory/custodies -> { items, total }
export function parseCustodyList(res) {
  const rows = res?.items ?? res?.data ?? (Array.isArray(res) ? res : [])
  return { items: rows.map(normalizeCustody), total: res?.total ?? rows.length }
}

// Single custody endpoints -> { custody }
export const parseCustody = (res) => normalizeCustody(res?.custody ?? res?.data ?? res)

// POST public-link -> { url, expiresAt }
export const parsePublicLink = (res) => ({ url: res?.url ?? null, expiresAt: res?.expiresAt ?? null })

// GET document -> { url }; POST preview -> { url, format }
export const parseFileUrl = (res) => ({ url: res?.url ?? res?.signedUrl ?? null, format: res?.format ?? null })

// GET /inventory/document-templates -> { templates }; single -> { template }
export const parseTemplates = (res) => res?.templates ?? res?.data ?? (Array.isArray(res) ? res : [])
export const parseTemplate = (res) => res?.template ?? res?.data ?? res

// Upload/validation warnings may come as strings or { tag, message }.
export function templateWarnings(template) {
  const raw = template?.warnings ?? template?.placeholders?.unknown ?? []
  return (Array.isArray(raw) ? raw : []).map((w) => (typeof w === 'string' ? w : w?.message ?? (w?.tag ? `Etiqueta desconocida: ${w.tag}` : String(w))))
}

// GET /public/inventory/custody/:token
export function parsePublicCustody(res) {
  const raw = res?.custody ?? res?.data ?? res ?? {}
  return {
    folio: raw.folio,
    date: raw.date,
    status: raw.status,
    kind: raw.kind,
    companyName: raw.companyName ?? raw.company?.name ?? null,
    companyLogoUrl: raw.companyLogoUrl ?? raw.company?.logoUrl ?? null,
    receiverName: raw.receiverName ?? personName(raw.receiver) ?? null,
    receiverSigned: Boolean(raw.receiverSigned ?? raw.receiverSignedAt),
    expiresAt: raw.expiresAt ?? raw.tokenExpiresAt ?? null,
    items: Array.isArray(raw.items) ? raw.items : [],
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
