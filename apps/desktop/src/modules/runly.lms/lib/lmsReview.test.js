import test from 'node:test'
import assert from 'node:assert/strict'
import { attemptScoreSummary, canOpenInOffice, filesCountText, parseReviewParam, passState, previewKind, reviewParam } from './lmsReview.js'

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

test('preview kinds and Office eligibility come from name and type', () => {
  assert.equal(previewKind({ name: 'foto.png', mimeType: 'image/png' }), 'image')
  assert.equal(previewKind({ name: 'tarea.pdf', mimeType: 'application/pdf' }), 'pdf')
  assert.equal(previewKind({ name: 'tarea.docx', mimeType: DOCX }), null)
  assert.equal(canOpenInOffice({ id: 'f1', name: 'tarea.docx', mimeType: DOCX }), true)
  assert.equal(canOpenInOffice({ id: 'f1', name: 'tarea.pdf', mimeType: 'application/pdf' }), false)
  assert.equal(canOpenInOffice({ name: 'tarea.docx', mimeType: DOCX }), false)
})

test('pass indicator only with a passing score and a valid grade', () => {
  assert.equal(passState('80', 70), 'pass')
  assert.equal(passState(70, 70), 'pass')
  assert.equal(passState('69.5', 70), 'fail')
  assert.equal(passState('', 70), null)
  assert.equal(passState('120', 70), null)
  assert.equal(passState('80', null), null)
})

test('attempt summary adds auto and drafted manual points', () => {
  const questions = [
    { id: 'a', kind: 'single', points: 2, awardedPoints: 2 },
    { id: 'b', kind: 'open', points: 3 },
    { id: 'c', kind: 'open', points: 5 },
  ]
  assert.deepEqual(attemptScoreSummary(questions, { b: '1.5' }), { auto: 2, manual: 1.5, max: 10, total: 3.5, pending: 1, pct: 35 })
  assert.equal(attemptScoreSummary(questions, { b: '9', c: '5' }).pending, 1)
  assert.equal(attemptScoreSummary([], {}).pct, null)
})

test('review URL param round-trips and rejects junk', () => {
  assert.deepEqual(parseReviewParam(reviewParam({ type: 'submission', id: 'x1' })), { type: 'submission', id: 'x1' })
  assert.equal(parseReviewParam('otro:x1'), null)
  assert.equal(parseReviewParam(null), null)
  assert.equal(reviewParam(null), null)
  assert.equal(filesCountText(1), '1 archivo')
  assert.equal(filesCountText(3), '3 archivos')
})
