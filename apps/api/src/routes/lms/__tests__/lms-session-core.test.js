import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SESSION_GRACE_MS, UPLOAD_GRACE_MS, assertSessionWritable, canConfirmUpload, canPresignUpload, closedStatus, draftOutcome, expiresAtFor,
  isSessionExpired, normalizeDraftInput, remainingMs, sessionsAllowed, startBlocker,
} from '../lms-session-core.js'

const T0 = new Date('2026-12-01T10:00:00Z')
const at = (ms) => new Date(T0.getTime() + ms)
const MIN = 60_000

test('one clock: 60 minutes from start, extensions add up, no limit = no deadline', () => {
  assert.equal(expiresAtFor(T0, 60).toISOString(), '2026-12-01T11:00:00.000Z')
  assert.equal(expiresAtFor(T0, 60, 10).toISOString(), '2026-12-01T11:10:00.000Z')
  assert.equal(expiresAtFor(T0, null), null)
  const session = { status: 'in_progress', expiresAt: expiresAtFor(T0, 60) }
  assert.equal(remainingMs(session, at(15 * MIN)), 45 * MIN)
  assert.equal(remainingMs(session, at(70 * MIN)), 0)
  assert.equal(remainingMs({ expiresAt: null }, T0), null)
})

test('expiry boundary: writes accepted up to deadline + grace, refused one ms after', () => {
  const session = { status: 'in_progress', expiresAt: at(60 * MIN) }
  assert.equal(isSessionExpired(session, at(60 * MIN + SESSION_GRACE_MS)), false)
  assert.equal(isSessionExpired(session, at(60 * MIN + SESSION_GRACE_MS + 1)), true)
  assert.doesNotThrow(() => assertSessionWritable(session, at(60 * MIN + SESSION_GRACE_MS)))
  assert.throws(() => assertSessionWritable(session, at(60 * MIN + SESSION_GRACE_MS + 1)), (e) => e.code === 'EXPIRED' && e.status === 409)
  assert.throws(() => assertSessionWritable({ ...session, status: 'submitted' }, T0), (e) => e.code === 'SESSION_CLOSED')
  assert.equal(isSessionExpired({ status: 'in_progress', expiresAt: null }, at(10_000 * MIN)), false)
})

test('uploads: presign until the deadline; confirm within the upload grace only for files presigned in time', () => {
  const session = { status: 'in_progress', expiresAt: at(60 * MIN) }
  assert.equal(canPresignUpload(session, at(60 * MIN)), true)
  assert.equal(canPresignUpload(session, at(60 * MIN + 1)), false)
  assert.equal(canPresignUpload({ ...session, status: 'submitted' }, T0), false)
  const inTime = { createdAt: at(59 * MIN) }, late = { createdAt: at(60 * MIN + 1) }
  assert.equal(canConfirmUpload({ ...session, status: 'expired' }, inTime, at(60 * MIN + UPLOAD_GRACE_MS)), true)
  assert.equal(canConfirmUpload({ ...session, status: 'expired' }, inTime, at(60 * MIN + UPLOAD_GRACE_MS + 1)), false)
  assert.equal(canConfirmUpload(session, late, at(60 * MIN + 2)), false)
  assert.equal(canConfirmUpload({ ...session, status: 'voided' }, inTime, at(59 * MIN)), false)
})

test('start blockers: enrollment, status, window, sessions used', () => {
  const assessment = { status: 'published', settings: { maxSessions: 1, opensAt: at(0).toISOString(), closesAt: at(120 * MIN).toISOString() } }
  const enrollment = { status: 'active', extraSessions: 0 }
  assert.equal(startBlocker({ assessment, enrollment, sessions: [], now: at(1) }), null)
  assert.equal(startBlocker({ assessment, enrollment: null, now: at(1) }).code, 'NOT_ENROLLED')
  assert.equal(startBlocker({ assessment: { ...assessment, status: 'draft' }, enrollment, now: at(1) }).code, 'NOT_PUBLISHED')
  assert.equal(startBlocker({ assessment, enrollment, now: at(-1) }).code, 'NOT_OPEN')
  assert.equal(startBlocker({ assessment, enrollment, now: at(121 * MIN) }).code, 'CLOSED')
  assert.equal(startBlocker({ assessment, enrollment, sessions: [{}], now: at(1) }).code, 'NO_SESSIONS')
  assert.equal(startBlocker({ assessment, enrollment: { ...enrollment, extraSessions: 1 }, sessions: [{}], now: at(1) }), null)
  assert.equal(sessionsAllowed({ maxSessions: 2 }, { extraSessions: 1 }), 3)
})

test('close policy: timeout = expired, drafts with content are delivered, empty ones missing', () => {
  assert.equal(closedStatus('timeout'), 'expired')
  assert.equal(closedStatus('learner'), 'submitted')
  assert.equal(draftOutcome({ text: '  ', fileIds: [] }), 'missing')
  assert.equal(draftOutcome({ text: 'respuesta', fileIds: [] }), 'submitted')
  assert.equal(draftOutcome({ text: null, fileIds: ['f'] }), 'submitted')
})

test('draft input: text and files validated against the activity settings', () => {
  const settings = { allowText: true, allowFiles: true, maxFiles: 2 }
  const id = '01900000-0000-7000-8000-000000000001'
  assert.deepEqual(normalizeDraftInput({ text: 'hola' }, settings, { fileIds: [id] }), { text: 'hola', fileIds: [id] })
  assert.deepEqual(normalizeDraftInput({ fileIds: [id, id] }, settings), { text: null, fileIds: [id] })
  assert.throws(() => normalizeDraftInput({ fileIds: ['x'] }, settings), /inválido/)
  assert.throws(() => normalizeDraftInput({ fileIds: [id, '01900000-0000-7000-8000-000000000002', '01900000-0000-7000-8000-000000000003'] }, settings), /como máximo 2/)
  assert.throws(() => normalizeDraftInput({ text: 'x' }, { ...settings, allowText: false }), /no admite respuesta escrita/)
  assert.throws(() => normalizeDraftInput({ fileIds: [id] }, { ...settings, allowFiles: false }), /no admite archivos/)
})
