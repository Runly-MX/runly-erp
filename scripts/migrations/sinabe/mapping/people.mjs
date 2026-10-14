// Pure mappers for people and suppliers referenced by sinabe records.
import { createHash } from 'node:crypto'
import { nameKey } from '../../../../apps/api/src/services/legacy-import/people-and-suppliers.js'

const collapse = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()

// Supplier free text (PurchaseOrder/Invoice.supplier) -> display name or null.
export function normalizeSupplierName(raw) {
  const text = collapse(raw).replace(/^[-.,;:]+|[-.,;:]+$/g, '').trim()
  return text ? text.slice(0, 255) : null
}

// Stable legacy id for a supplier: case/accent-insensitive name key (hashed when long).
export function supplierLegacyId(raw) {
  const display = normalizeSupplierName(raw)
  if (!display) return null
  const key = nameKey(display)
  return key.length <= 110 ? `name:${key}` : `hash:${createHash('sha256').update(key).digest('hex').slice(0, 40)}`
}

// Distinct suppliers of a list of documents: Map<legacyId, displayName> (first spelling wins).
export function collectSuppliers(documents) {
  const out = new Map()
  for (const doc of documents) {
    const id = supplierLegacyId(doc.supplier)
    if (id && !out.has(id)) out.set(id, normalizeSupplierName(doc.supplier))
  }
  return out
}

export const fullName = (user) => collapse(`${user?.firstName ?? ''} ${user?.lastName ?? ''}`) || null

// sinabe User -> matchOrCreateEmployee input (legacyId = sinabe user id).
export function employeeInput(user) {
  return {
    legacyId: user.id,
    employeeNumber: collapse(user.employeeNumber) || null,
    email: collapse(user.email).toLowerCase() || null,
    firstName: collapse(user.firstName) || collapse(user.userName) || 'Sin nombre',
    lastName: collapse(user.lastName),
    department: collapse(user.department) || null,
    jobTitle: collapse(user.jobTitle) || null,
  }
}

// Deliverer: mapped Runly profile (by e-mail, from --deliverers-map) or free text name.
export function delivererFor(user, deliverersMap) {
  if (!user) return { delivererId: null, delivererName: null }
  const email = collapse(user.email).toLowerCase()
  const mapped = email && deliverersMap ? deliverersMap.get(email) : null
  return mapped ? { delivererId: mapped, delivererName: null } : { delivererId: null, delivererName: fullName(user) }
}

// { email: profileId } JSON -> Map with lower-cased keys.
export function parseDeliverersMap(json) {
  const out = new Map()
  if (!json || typeof json !== 'object') return out
  for (const [email, profileId] of Object.entries(json)) {
    const key = collapse(email).toLowerCase()
    if (key && profileId) out.set(key, String(profileId).trim())
  }
  return out
}
