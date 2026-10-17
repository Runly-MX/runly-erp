import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LmsError } from '../lms-core.js'
import {
  normalizeQuizSettings, normalizeAssignmentSettings, normalizeQuestionInput, drawQuestions, scoreAttempt,
  attemptsAllowed, isExpired, learnerQuestion, revealedQuestion, revealAllowed, assignmentDueAt,
  validateSubmission, validateGradeDecision, sanitizeAnswers, attemptOutcome, SUBMIT_GRACE_MS,
} from '../lms-eval-core.js'

const counter = () => { let n = 0; return () => `o${String(++n).padStart(6, '0')}` }
const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
const rejects = (fn, status, code) => assert.throws(fn, (err) => err instanceof LmsError && err.status === status && (code === undefined || err.code === code))

test('quiz and assignment settings: defaults and clamps', () => {
  assert.deepEqual(normalizeQuizSettings(undefined), {
    passingScore: 70, maxAttempts: null, timeLimitMinutes: null, drawCount: null,
    shuffleQuestions: false, shuffleOptions: true, showAnswers: 'after_submit',
  })
  const quiz = normalizeQuizSettings({ passingScore: 150, maxAttempts: 0, timeLimitMinutes: '15', drawCount: '', showAnswers: 'nope', shuffleOptions: false })
  assert.equal(quiz.passingScore, 100)
  assert.equal(quiz.maxAttempts, 1)
  assert.equal(quiz.timeLimitMinutes, 15)
  assert.equal(quiz.drawCount, null)
  assert.equal(quiz.showAnswers, 'after_submit')
  assert.equal(quiz.shuffleOptions, false)
  assert.deepEqual(normalizeAssignmentSettings({}), { allowText: true, allowFiles: true, maxFiles: 5, dueDaysAfterEnroll: null, passingScore: null })
  assert.equal(normalizeAssignmentSettings({ maxFiles: 50 }).maxFiles, 10)
  assert.equal(normalizeAssignmentSettings({ passingScore: -5 }).passingScore, 0)
})

test('question options are validated per kind', () => {
  const make = counter()
  rejects(() => normalizeQuestionInput({ kind: 'essay', prompt: 'x' }), 400)
  rejects(() => normalizeQuestionInput({ kind: 'single', prompt: '  ' }), 400)
  rejects(() => normalizeQuestionInput({ kind: 'single', prompt: 'x', options: [{ text: 'a', correct: true }] }), 400)
  rejects(() => normalizeQuestionInput({ kind: 'single', prompt: 'x', options: [{ text: 'a', correct: true }, { text: 'b', correct: true }] }), 400)
  rejects(() => normalizeQuestionInput({ kind: 'multiple', prompt: 'x', options: [{ text: 'a' }, { text: 'b' }] }), 400)
  rejects(() => normalizeQuestionInput({ kind: 'single', prompt: 'x', points: 0, options: [{ text: 'a', correct: true }, { text: 'b' }] }), 400)

  const single = normalizeQuestionInput({ kind: 'single', prompt: ' ¿2+2? ', options: [{ text: '4', correct: true }, { text: '5' }] }, { makeId: make })
  assert.equal(single.prompt, '¿2+2?')
  assert.equal(single.points, 1)
  assert.deepEqual(single.options, [{ id: 'o000001', text: '4', correct: true }, { id: 'o000002', text: '5', correct: false }])

  const multiple = normalizeQuestionInput({ kind: 'multiple', prompt: 'x', points: 3, options: [{ text: 'a', correct: true }, { text: 'b', correct: true }, { text: 'c' }] }, { makeId: make })
  assert.equal(multiple.options.filter((o) => o.correct).length, 2)

  const tf = normalizeQuestionInput({ kind: 'true_false', prompt: 'x', options: [{ text: 'Verdadero' }, { text: 'Falso', correct: true }] })
  assert.deepEqual(tf.options, [{ id: 'true', text: 'Verdadero', correct: false }, { id: 'false', text: 'Falso', correct: true }])
  rejects(() => normalizeQuestionInput({ kind: 'true_false', prompt: 'x', options: [{ id: 'true' }, { id: 'false' }] }), 400)

  assert.deepEqual(normalizeQuestionInput({ kind: 'open', prompt: 'Explica', options: [{ text: 'ignored' }] }).options, [])
})

test('option ids stay stable when editing', () => {
  const existing = { kind: 'single', options: [{ id: 'oaaaaaa', text: 'a', correct: true }, { id: 'obbbbbb', text: 'b', correct: false }] }
  const make = counter()
  const edited = normalizeQuestionInput({ options: [{ text: 'a2', correct: true }, { text: 'b2' }, { text: 'c' }] }, { partial: true, existing, makeId: make })
  assert.deepEqual(edited.options.map((o) => o.id), ['oaaaaaa', 'obbbbbb', 'o000001'])
  // An explicit id wins over the position, so reordering keeps identities.
  const swapped = normalizeQuestionInput({ options: [{ id: 'obbbbbb', text: 'b', correct: true }, { id: 'oaaaaaa', text: 'a' }] }, { partial: true, existing, makeId: make })
  assert.deepEqual(swapped.options.map((o) => o.id), ['obbbbbb', 'oaaaaaa'])
  // Partial edit without options or kind leaves options alone.
  assert.equal(normalizeQuestionInput({ prompt: 'nuevo' }, { partial: true, existing }).options, undefined)
})

const Q = (id, kind, extra = {}) => ({ id, kind, points: 1, options: kind === 'open' ? [] : kind === 'true_false'
  ? [{ id: 'true', text: 'V', correct: true }, { id: 'false', text: 'F', correct: false }]
  : [{ id: `${id}a`, text: 'a', correct: true }, { id: `${id}b`, text: 'b', correct: kind === 'multiple' }, { id: `${id}c`, text: 'c', correct: false }], ...extra })

test('drawQuestions honours drawCount and shuffles deterministically', () => {
  const questions = ['q1', 'q2', 'q3', 'q4', 'q5'].map((id) => Q(id, 'single'))
  const all = drawQuestions(questions, { shuffleOptions: false })
  assert.deepEqual(all.questionIds, ['q1', 'q2', 'q3', 'q4', 'q5'])
  assert.deepEqual(all.optionOrder.q1, ['q1a', 'q1b', 'q1c'])

  const subset = drawQuestions(questions, { drawCount: 2 }, seeded(3))
  assert.equal(subset.questionIds.length, 2)
  assert.deepEqual(Object.keys(subset.optionOrder).sort(), [...subset.questionIds].sort())
  // Without shuffleQuestions the drawn subset keeps the authored order.
  assert.deepEqual(subset.questionIds, [...subset.questionIds].sort())
  assert.deepEqual(drawQuestions(questions, { drawCount: 2, shuffleQuestions: true }, seeded(9)), drawQuestions(questions, { drawCount: 2, shuffleQuestions: true }, seeded(9)))

  const tf = drawQuestions([Q('t', 'true_false'), Q('o', 'open')], { shuffleOptions: true }, seeded(5))
  assert.deepEqual(tf.optionOrder, { t: ['true', 'false'], o: [] })
})

test('scoreAttempt: single, true_false, multiple all-or-nothing and open manual points', () => {
  const questions = [Q('s', 'single', { points: 2 }), Q('t', 'true_false'), Q('m', 'multiple', { points: 3 })]
  const right = scoreAttempt(questions, { s: { optionIds: ['sa'] }, t: { optionIds: ['true'] }, m: { optionIds: ['mb', 'ma'] } })
  assert.equal(right.scorePoints, 6)
  assert.equal(right.scorePct, 100)
  assert.equal(right.needsReview, false)
  const wrong = scoreAttempt(questions, { s: { optionIds: ['sa', 'sb'] }, t: { optionIds: ['false'] }, m: { optionIds: ['ma'] } })
  assert.equal(wrong.scorePoints, 0)
  assert.deepEqual(wrong.perQuestion.m, { awarded: 0, correct: false })
  assert.equal(scoreAttempt(questions, {}).scorePct, 0)

  const withOpen = [...questions, Q('o', 'open', { points: 4 })]
  const pending = scoreAttempt(withOpen, { s: { optionIds: ['sa'] }, o: { text: 'respuesta' } })
  assert.equal(pending.needsReview, true)
  assert.equal(pending.scorePct, null)
  assert.equal(pending.scorePoints, null)
  assert.equal(pending.autoPoints, 2)
  assert.equal(pending.maxPoints, 10)
  assert.deepEqual(pending.perQuestion.o, { awarded: null, correct: null })

  const graded = scoreAttempt(withOpen, { s: { optionIds: ['sa'] } }, { o: 9 })
  assert.equal(graded.perQuestion.o.awarded, 4)
  assert.equal(graded.scorePoints, 6)
  assert.equal(graded.scorePct, 60)
  assert.equal(scoreAttempt(withOpen, {}, { o: -3 }).perQuestion.o.awarded, 0)
})

test('attempts, expiry with grace and outcome', () => {
  assert.equal(attemptsAllowed({}, 0), Infinity)
  assert.equal(attemptsAllowed({ maxAttempts: 2 }, 1), 3)
  const deadlineAt = new Date('2026-10-16T12:00:00Z')
  assert.equal(isExpired({ deadlineAt }, new Date(deadlineAt.getTime() + SUBMIT_GRACE_MS)), false)
  assert.equal(isExpired({ deadlineAt }, new Date(deadlineAt.getTime() + SUBMIT_GRACE_MS + 1)), true)
  assert.equal(isExpired({ deadlineAt: null }, new Date('2030-01-01')), false)
  assert.equal(attemptOutcome({ needsReview: true, passed: null, attemptsUsed: 2, allowed: 2 }), 'pending_review')
  assert.equal(attemptOutcome({ needsReview: false, passed: true, attemptsUsed: 2, allowed: 2 }), 'completed')
  assert.equal(attemptOutcome({ needsReview: false, passed: false, attemptsUsed: 2, allowed: 2 }), 'failed')
  assert.equal(attemptOutcome({ needsReview: false, passed: false, attemptsUsed: 1, allowed: 2 }), 'in_progress')
})

test('learner questions hide answers; reveal follows showAnswers', () => {
  const q = { ...Q('s', 'single'), prompt: 'P', explanation: 'Porque sí' }
  const safe = learnerQuestion(q, ['sc', 'sa', 'sb'])
  assert.deepEqual(safe, { id: 's', kind: 'single', prompt: 'P', points: 1, options: [{ id: 'sc', text: 'c' }, { id: 'sa', text: 'a' }, { id: 'sb', text: 'b' }] })
  assert.equal(JSON.stringify(safe).includes('correct'), false)
  assert.equal(JSON.stringify(safe).includes('Porque'), false)
  const shown = revealedQuestion(q, ['sc', 'sa', 'sb'], { awarded: 1, correct: true })
  assert.deepEqual(shown.options[1], { id: 'sa', text: 'a', correct: true })
  assert.equal(shown.explanation, 'Porque sí')
  assert.equal(shown.awardedPoints, 1)
  assert.equal(revealAllowed('never', true), false)
  assert.equal(revealAllowed('after_submit', false), true)
  assert.equal(revealAllowed('after_pass', false), false)
  assert.equal(revealAllowed('after_pass', true), true)
})

test('sanitizeAnswers keeps drawn questions and known options only', () => {
  const answers = sanitizeAnswers({ s: { optionIds: ['sa', 'zz', 'sa'] }, o: { text: 'hola' }, x: { optionIds: ['a'] } }, ['s', 'o'], { s: ['sa', 'sb'], o: [] })
  assert.deepEqual(answers, { s: { optionIds: ['sa'] }, o: { text: 'hola' } })
  rejects(() => sanitizeAnswers([], ['s'], {}), 400)
})

test('assignment due date', () => {
  const enrollment = { createdAt: new Date('2026-10-01T00:00:00Z') }
  assert.equal(assignmentDueAt(enrollment, {}), null)
  assert.equal(assignmentDueAt(enrollment, { dueDaysAfterEnroll: 7 }).toISOString(), '2026-10-08T00:00:00.000Z')
})

test('validateSubmission', () => {
  const fileId = '0195f0c0-0000-7000-8000-000000000001'
  rejects(() => validateSubmission({ text: '  ', fileIds: [] }, {}, null), 400)
  rejects(() => validateSubmission({ fileIds: [fileId] }, { allowFiles: false }, null), 400)
  rejects(() => validateSubmission({ text: 'x' }, { allowText: false }, null), 400)
  rejects(() => validateSubmission({ fileIds: [fileId, '0195f0c0-0000-7000-8000-000000000002'] }, { maxFiles: 1 }, null), 400)
  rejects(() => validateSubmission({ text: 'x' }, {}, { status: 'submitted' }), 409, 'PENDING')
  rejects(() => validateSubmission({ text: 'x' }, {}, { status: 'approved' }), 409, 'APPROVED')
  assert.deepEqual(validateSubmission({ text: ' listo ', fileIds: [fileId, fileId] }, {}, { status: 'returned' }), { text: 'listo', fileIds: [fileId] })
})

test('validateGradeDecision with and without passingScore', () => {
  rejects(() => validateGradeDecision({ decision: 'maybe' }, {}), 400)
  assert.deepEqual(validateGradeDecision({ decision: 'approve' }, {}), { decision: 'approve', grade: null })
  assert.deepEqual(validateGradeDecision({ decision: 'return', grade: 40 }, { passingScore: 70 }), { decision: 'return', grade: 40 })
  rejects(() => validateGradeDecision({ decision: 'approve' }, { passingScore: 70 }), 400)
  rejects(() => validateGradeDecision({ decision: 'approve', grade: 69 }, { passingScore: 70 }), 400)
  rejects(() => validateGradeDecision({ decision: 'approve', grade: 101 }, {}), 400)
  assert.deepEqual(validateGradeDecision({ decision: 'approve', grade: 70 }, { passingScore: 70 }), { decision: 'approve', grade: 70 })
})
