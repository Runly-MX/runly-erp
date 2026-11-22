import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deliveryPayload, filterRows, historyChange, percent, quizDraft, quizPayload, rubricTotal, scoreText } from './lmsResults.js'

const attempt = {
  status: 'submitted', feedback: null, manualPoints: { q1: 30 }, questionFeedback: {},
  questions: [{ id: 'q1', kind: 'open', points: 50 }, { id: 'q2', kind: 'open', points: 30 }, { id: 'q3', kind: 'single', points: 20 }],
}

test('quiz draft: only changed points and comments are sent; out of range flagged', () => {
  const draft = quizDraft(attempt)
  assert.deepEqual(draft.points, { q1: '30', q2: '' })
  assert.equal(quizPayload(attempt, draft).changed, false)
  const next = quizPayload(attempt, { ...draft, points: { q1: '30', q2: '12.5' }, comments: { q1: 'Bien' } })
  assert.deepEqual(next.body, { points: { q2: 12.5 }, comments: { q1: 'Bien' } })
  assert.equal(next.regrade, false)
  assert.equal(quizPayload(attempt, { ...draft, points: { q1: '51', q2: '' } }).errors.q1, 'De 0 a 50.')
  assert.equal(quizPayload({ ...attempt, status: 'graded' }, { ...draft, points: { q1: '40', q2: '' } }).regrade, true)
})

test('delivery: rubric scores, live total and regrade detection', () => {
  const activity = { maxPoints: 100, rubric: [{ id: 'a', points: 60 }, { id: 'b', points: 40 }], submission: { points: 90, rubricScores: { a: 55, b: 35 } } }
  const payload = deliveryPayload(activity, { rubricScores: { a: '58', b: '35' }, feedback: '' })
  assert.deepEqual(payload.body.rubricScores, { a: 58, b: 35 })
  assert.equal(payload.regrade, true)
  assert.equal(deliveryPayload(activity, { rubricScores: { a: '61', b: '35' }, feedback: '' }).errors.a, 'De 0 a 60.')
  assert.equal(rubricTotal(activity.rubric, { a: '58', b: '35.5' }), 93.5)
  assert.equal(rubricTotal(activity.rubric, { a: '58' }), null)
  assert.equal(deliveryPayload({ maxPoints: 100, rubric: [], submission: { points: null } }, { points: '72', feedback: '' }).regrade, false)
  assert.equal(deliveryPayload({ ...activity, submission: { points: 90, rubricScores: { b: 35, a: 55 } } }, { rubricScores: { a: '55', b: '35' }, feedback: '' }).changed, false, 'key order of the stored JSON does not matter')
})

test('results: filters, score text over 100 and history summaries', () => {
  const rows = [{ status: 'graded', pendingCount: 0 }, { status: 'submitted', pendingCount: 1 }, { status: 'not_started', pendingCount: 0 }]
  assert.equal(filterRows(rows, 'review').length, 1)
  assert.equal(filterRows(rows, 'not_started').length, 1)
  assert.equal(scoreText(172.5, 200), '172.5 / 200')
  assert.equal(percent(172.5, 200), 86.3)
  assert.equal(historyChange({ action: 'regrade', before: { points: 88.5 }, after: { points: 90.5 } }), '88.5 → 90.5 pts')
  assert.equal(historyChange({ action: 'decision', before: { decision: 'pending' }, after: { decision: 'advance' } }), 'Sin decisión → Avanza')
})
