// sinabe AuditLog (entityType Inventory) -> body of a historical item comment.
import { fullName } from './people.mjs'

const ACTION_LABELS = { CREATE: 'Creación', UPDATE: 'Actualización', DELETE: 'Eliminación' }
export const COMMENT_MAX = 5000

function describeChanges(raw) {
  if (raw == null || String(raw).trim() === '') return null
  let parsed = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw) } catch { return String(raw) }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return JSON.stringify(parsed)
  const show = (value) => (value === null || value === undefined || value === '' ? '(vacío)' : typeof value === 'object' ? JSON.stringify(value) : String(value))
  return Object.entries(parsed).map(([field, change]) => (
    change && typeof change === 'object' && ('old' in change || 'new' in change)
      ? `- ${field}: ${show(change.old)} → ${show(change.new)}`
      : `- ${field}: ${show(change)}`
  )).join('\n')
}

export function auditCommentBody(log, user) {
  const action = ACTION_LABELS[String(log.action ?? '').toUpperCase()] ?? String(log.action ?? 'Cambio')
  const who = fullName(user)
  const changes = describeChanges(log.changes)
  const body = [`Historial sinabe — ${action}${who ? ` por ${who}` : ''}.`, changes ? `Cambios:\n${changes}` : null].filter(Boolean).join('\n')
  return body.slice(0, COMMENT_MAX)
}
