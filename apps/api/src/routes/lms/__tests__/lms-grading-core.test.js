import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  attemptRow, deliveryScore, extendBlocker, frozenQuestions, normalizeManualPoints, normalizeReason, sessionTotals, submissionRow, voidBlocker,
} from '../lms-grading-core.js'
import { normalizeAssignmentSettings } from '../lms-eval-core.js'
import { resolveRole } from '../lms-assessment-access.js'

const open = (id, points) => ({ id, kind: 'open', points })
const session = {
  snapshot: {
    activities: [
      { lessonId: 'quiz', kind: 'quiz', title: 'Cuestionario', maxPoints: 100, questionPoints: { q1: 60, q2: 40 } },
      { lessonId: 'excel', kind: 'assignment', title: 'Excel', maxPoints: 100, rubric: [{ id: 'a', label: 'Fórmulas', points: 60 }, { id: 'b', label: 'Gráfica', points: 40 }] },
    ],
  },
}

test('frozen basis: question points as drawn at start win over later edits', () => {
  const [q1] = frozenQuestions(session.snapshot.activities[0], [open('q1', 999)])
  assert.equal(q1.points, 60)
  assert.equal(frozenQuestions({}, [open('q1', 5)])[0].points, 5, 'older sessions: current points')
})

test('partial manual points: 0..question points, partial credit, unsent keep their value', () => {
  const qs = [open('q1', 60), open('q2', 40)]
  assert.deepEqual(normalizeManualPoints({ q1: 30.555 }, qs, {}), { q1: 30.56 })
  assert.deepEqual(normalizeManualPoints({ q2: 10 }, qs, { q1: 30 }), { q1: 30, q2: 10 })
  assert.throws(() => normalizeManualPoints({ q1: 61 }, qs), (e) => e.code === 'POINTS_OUT_OF_RANGE')
  assert.throws(() => normalizeManualPoints({ q9: 1 }, qs), /abiertas/)
})

test('quiz row: partial while an open answer is unscored, final when all are', () => {
  const item = session.snapshot.activities[0]
  const qs = [open('q1', 10), open('q2', 10)]
  const pending = attemptRow(item, qs, { lessonId: 'quiz', status: 'submitted', manualPoints: { q1: 45 }, answers: {} })
  assert.equal(pending.pending, true)
  assert.equal(pending.score, 45, 'frozen 60-point question scored 45')
  const done = attemptRow(item, qs, { lessonId: 'quiz', status: 'graded', manualPoints: { q1: 45, q2: 40 }, answers: {} })
  assert.equal(done.pending, false)
  assert.equal(done.score, 85)
})

test('delivery: rubric criteria sum to the activity points; direct points otherwise', () => {
  const item = session.snapshot.activities[1]
  assert.deepEqual(deliveryScore({ rubricScores: { a: 50 } }, item).points, null, 'one criterion missing: still pending')
  assert.equal(deliveryScore({ rubricScores: { a: 50, b: 37.5 } }, item).points, 87.5)
  assert.throws(() => deliveryScore({ rubricScores: { a: 61 } }, item), (e) => e.code === 'POINTS_OUT_OF_RANGE')
  assert.equal(deliveryScore({ points: 72.25 }, { maxPoints: 100 }).points, 72.25)
  assert.throws(() => deliveryScore({ points: 101 }, { maxPoints: 100 }), /entre 0 y 100/)
  assert.equal(normalizeAssignmentSettings({ maxPoints: 10, rubric: [{ label: 'A', points: 70 }, { label: 'B', points: 30 }] }).maxPoints, 100, 'rubric sets the maximum')
})

test('totals: auto + manual + rubric over 200 points, missing counts 0, never renormalized', () => {
  const totals = sessionTotals(session, [
    { lessonId: 'quiz', kind: 'quiz', pending: false, score: 85 },
    { lessonId: 'excel', kind: 'assignment', pending: false, score: 87.5 },
  ])
  assert.deepEqual([totals.scorePoints, totals.maxPoints, totals.complete], [172.5, 200, true])
  const partial = sessionTotals(session, [{ lessonId: 'quiz', kind: 'quiz', pending: true, score: 45 }, submissionRow({ lessonId: 'excel', status: 'missing' })])
  assert.deepEqual([partial.scorePoints, partial.complete, partial.pendingCount], [45, false, 1])
  assert.equal(submissionRow({ lessonId: 'excel', status: 'submitted', points: null }).pending, true)
})

test('incidents: extend only while running and before deadline + grace; void never on graded', () => {
  const now = new Date('2026-12-01T10:00:00Z')
  const running = { status: 'in_progress', expiresAt: new Date('2026-12-01T10:05:00Z') }
  assert.equal(extendBlocker(running, 10, now, 30_000), null)
  assert.equal(extendBlocker({ ...running, expiresAt: new Date('2026-12-01T09:59:00Z') }, 10, now, 30_000).code, 'EXPIRED')
  assert.equal(extendBlocker({ ...running, status: 'submitted' }, 10, now, 30_000).code, 'SESSION_CLOSED')
  assert.equal(extendBlocker(running, 0, now, 30_000).status, 400)
  assert.equal(extendBlocker({ status: 'in_progress', expiresAt: null }, 5, now, 30_000).code, 'NO_TIME_LIMIT')
  assert.equal(voidBlocker({ status: 'graded' }).code, 'ALREADY_GRADED')
  assert.equal(voidBlocker({ status: 'expired' }), null)
  assert.throws(() => normalizeReason('ok', { required: true }), (e) => e.code === 'REASON_REQUIRED')
})

test('roles: managers always; without reviewer rows any grader/reader; with rows only those listed', () => {
  const user = (keys, profileId = 'u1') => ({ profileId, isAdmin: false, permissions: new Set(keys) })
  assert.equal(resolveRole(user(['lms.course.manage']), [{ userProfileId: 'x', role: 'grader' }]), 'manager')
  assert.equal(resolveRole(user(['lms.grade'])), 'grader')
  assert.equal(resolveRole(user(['lms.assessment.results'])), 'reader')
  assert.equal(resolveRole(user(['lms.access'])), null)
  const rows = [{ userProfileId: 'u2', role: 'grader' }, { userProfileId: 'u3', role: 'reader' }]
  assert.equal(resolveRole(user(['lms.grade'], 'u1'), rows), null, 'not listed')
  assert.equal(resolveRole(user(['lms.grade'], 'u2'), rows), 'grader')
  assert.equal(resolveRole(user(['lms.grade'], 'u3'), rows), 'reader', 'listed as reader: cannot grade')
  assert.equal(resolveRole(user(['lms.access'], 'u2'), rows), null, 'listed without a reviewer permission')
})
