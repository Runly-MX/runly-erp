// Pure rules of an evaluation session (spec 2026-11-21 section 6): start
// checks, the single clock, write and upload windows, and the close policy.
// No I/O; `now` is always passed in.
import { LmsError } from './lms-error.js'
import { SUBMIT_GRACE_MS } from './lms-eval-core.js'

// Writes (answers, drafts, submit) are accepted up to the deadline plus this
// grace, which absorbs network latency. Same value as quiz attempts.
export const SESSION_GRACE_MS = SUBMIT_GRACE_MS
// A file presigned before the deadline may still be confirmed this long after it.
export const UPLOAD_GRACE_MS = 5 * 60_000
export const SESSION_STATUSES = ['in_progress', 'submitted', 'expired', 'graded', 'voided']

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const time = (value) => (value ? new Date(value).getTime() : null)

export const sessionsAllowed = (settings, enrollment) => Math.max(1, Number(settings?.maxSessions) || 1) + Math.max(0, Number(enrollment?.extraSessions) || 0)

// First reason a participant cannot start a new session, or null.
// assessment: { status, settings } (settings already read); sessions: rows of this enrollment.
export function startBlocker({ assessment, enrollment, sessions = [], now }) {
  const t = time(now)
  if (!enrollment || !['active', 'completed'].includes(enrollment.status)) return { code: 'NOT_ENROLLED', message: 'No estás registrado en esta evaluación.', status: 403 }
  if (assessment.status !== 'published') return { code: 'NOT_PUBLISHED', message: 'La evaluación no está disponible.', status: 409 }
  const { opensAt, closesAt } = assessment.settings ?? {}
  if (opensAt && t < time(opensAt)) return { code: 'NOT_OPEN', message: 'La evaluación todavía no abre.', status: 409 }
  if (closesAt && t > time(closesAt)) return { code: 'CLOSED', message: 'La evaluación ya cerró.', status: 409 }
  if (sessions.length >= sessionsAllowed(assessment.settings, enrollment)) return { code: 'NO_SESSIONS', message: 'Ya no tienes intentos disponibles.', status: 409 }
  return null
}

export function expiresAtFor(startedAt, timeLimitMinutes, extendedMinutes = 0) {
  if (!timeLimitMinutes) return null
  return new Date(time(startedAt) + (Number(timeLimitMinutes) + (Number(extendedMinutes) || 0)) * 60_000)
}

// Past the deadline plus the write grace: the session must close.
export function isSessionExpired(session, now) {
  if (!session?.expiresAt) return false
  return time(now) > time(session.expiresAt) + SESSION_GRACE_MS
}

// Milliseconds left before the deadline (0 when past it), null without a limit.
export function remainingMs(session, now) {
  if (!session?.expiresAt) return null
  return Math.max(0, time(session.expiresAt) - time(now))
}

// Throws the error a write gets when the session cannot take it.
export function assertSessionWritable(session, now) {
  if (session.status !== 'in_progress') throw new LmsError('La evaluación ya fue entregada.', 409, 'SESSION_CLOSED')
  if (isSessionExpired(session, now)) throw new LmsError('Se terminó el tiempo de la evaluación. Se entregó con lo que tenías guardado.', 409, 'EXPIRED')
}

// New uploads only before the deadline (no grace: an upload started at the
// last second gets UPLOAD_GRACE_MS to finish through canConfirmUpload).
export function canPresignUpload(session, now) {
  if (session.status !== 'in_progress') return false
  return !session.expiresAt || time(now) <= time(session.expiresAt)
}

// A confirmed file counts when it was presigned before the deadline and is
// confirmed within the upload grace, even if the session closed meanwhile.
export function canConfirmUpload(session, asset, now) {
  if (session.status === 'voided') return false
  if (!session.expiresAt) return session.status === 'in_progress'
  const deadline = time(session.expiresAt)
  return time(asset.createdAt) <= deadline && time(now) <= deadline + UPLOAD_GRACE_MS
}

export const closedStatus = (reason) => (reason === 'timeout' ? 'expired' : 'submitted')

// A draft delivery becomes submitted when it has anything, missing otherwise.
export const draftOutcome = (draft) => ((String(draft?.text ?? '').trim() || (draft?.fileIds ?? []).length) ? 'submitted' : 'missing')

// Graded once nothing waits for a person: every quiz attempt graded and every
// delivery missing (assignments are always graded by hand). Points of graded
// work: quiz scorePoints, assignment points; missing counts 0.
export function gradingState(attempts = [], submissions = []) {
  const pendingAttempt = attempts.some((row) => row.status !== 'graded')
  const pendingSubmission = submissions.some((row) => row.status !== 'missing' && (row.points === null || row.points === undefined))
  if (pendingAttempt || pendingSubmission) return { graded: false, scorePoints: null }
  const sum = attempts.reduce((acc, row) => acc + (Number(row.scorePoints) || 0), 0)
    + submissions.reduce((acc, row) => acc + (Number(row.points) || 0), 0)
  return { graded: true, scorePoints: Math.round(sum * 100) / 100 }
}

// PUT draft body { text?, fileIds? } against the activity settings. Missing keys keep the stored value.
export function normalizeDraftInput(body = {}, settings, current = {}) {
  const out = { text: current.text ?? null, fileIds: current.fileIds ?? [] }
  if (body.text !== undefined) {
    const text = String(body.text ?? '')
    if (text.length > 50_000) throw new LmsError('La respuesta es demasiado larga.', 400)
    if (text.trim() && !settings.allowText) throw new LmsError('Esta actividad no admite respuesta escrita.', 400)
    out.text = text.trim() ? text : null
  }
  if (body.fileIds !== undefined) {
    const ids = Array.isArray(body.fileIds) ? [...new Set(body.fileIds.map(String))] : null
    if (!ids || ids.some((id) => !UUID.test(id))) throw new LmsError('Identificador de archivo inválido.', 400)
    if (ids.length && !settings.allowFiles) throw new LmsError('Esta actividad no admite archivos.', 400)
    if (ids.length > settings.maxFiles) throw new LmsError(`Adjunta como máximo ${settings.maxFiles} archivos.`, 400)
    out.fileIds = ids
  }
  return out
}
