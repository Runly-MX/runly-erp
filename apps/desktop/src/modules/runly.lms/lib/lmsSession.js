// Pure helpers for the evaluation runner (spec 2026-11-21 section 6.4): the
// server-synced clock, time warnings, activity progress and a local backup of
// answers not yet saved. The server decides expiry; this only displays it.

// Offset between the server clock and this device, from one round trip:
// the server stamped serverNow roughly halfway between sending and receiving.
export function clockOffset(serverNow, sentAt, receivedAt) {
  const server = Date.parse(serverNow)
  if (!Number.isFinite(server)) return 0
  return server - (sentAt + receivedAt) / 2
}

// Milliseconds left on the server clock (null: no time limit).
export function remainingFrom(expiresAt, offset, deviceNow) {
  if (!expiresAt) return null
  return Math.max(0, Date.parse(expiresAt) - (deviceNow + (offset || 0)))
}

export function formatClock(ms) {
  if (ms === null || ms === undefined) return null
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export const WARNING_MINUTES = [10, 5, 1]
// The warning (in minutes) crossed going from `previous` to `next` ms left, or null.
export function crossedWarning(previous, next) {
  if (previous === null || next === null || previous === undefined) return null
  return WARNING_MINUTES.find((minutes) => previous > minutes * 60_000 && next <= minutes * 60_000) ?? null
}
export const isLowTime = (ms) => ms !== null && ms <= 5 * 60_000

// { done, total, label } of one activity for the stepper and the final review.
export function activityProgress(activity) {
  if (activity.kind === 'quiz') {
    const total = activity.attempt?.questionCount ?? 0
    const done = Math.min(total, activity.answeredCount ?? activity.attempt?.answeredCount ?? 0)
    return { done, total, complete: total > 0 && done >= total, label: `${done} de ${total} respondidas` }
  }
  const sub = activity.submission ?? {}
  const files = sub.files?.length ?? 0
  const text = Boolean(String(sub.text ?? '').trim())
  const parts = [text ? 'Texto escrito' : null, files ? `${files} ${files === 1 ? 'archivo' : 'archivos'}` : null].filter(Boolean)
  return { done: text || files ? 1 : 0, total: 1, complete: Boolean(text || files), label: parts.length ? parts.join(' · ') : 'Sin entregar' }
}

// Unsaved answers survive a reload or a lost connection in this browser only.
const pendingKey = (attemptId) => `runly.lms.session.pending.${attemptId}`
export function readPending(attemptId) {
  try { return JSON.parse(localStorage.getItem(pendingKey(attemptId)) ?? 'null') } catch { return null }
}
export function writePending(attemptId, answers) {
  try { localStorage.setItem(pendingKey(attemptId), JSON.stringify(answers)) } catch { /* storage unavailable */ }
}
export function clearPending(attemptId) {
  try { localStorage.removeItem(pendingKey(attemptId)) } catch { /* storage unavailable */ }
}

export const SESSION_STATUS_LABELS = {
  in_progress: 'En curso', submitted: 'Entregada', expired: 'Entregada al terminar el tiempo', graded: 'Calificada', voided: 'Anulada',
}
