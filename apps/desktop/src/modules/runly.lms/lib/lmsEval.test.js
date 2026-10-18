import test from 'node:test'
import assert from 'node:assert/strict'
import { KIND_LABELS, QUESTION_KIND_LABELS, SHOW_ANSWERS_LABELS } from './lmsLabels.js'
import {
  LMS_BOUNDS, changeQuestionKind, countUnanswered, emptyQuestionForm, formToQuestion, formToSettings, formatCountdown, questionToForm,
  quizState, remainingMs, selectOption, setOptionCorrect, settingsToForm, validateManualPoints, validateQuestionForm, validateSettings,
} from './lmsEval.js'

test('evaluation labels are Spanish', () => {
  assert.equal(KIND_LABELS.quiz, 'Examen')
  assert.equal(KIND_LABELS.assignment, 'Tarea')
  assert.equal(QUESTION_KIND_LABELS.true_false, 'Verdadero o falso')
  assert.equal(SHOW_ANSWERS_LABELS.never, 'Nunca')
})

test('quiz settings round trip with defaults and empty = null', () => {
  const form = settingsToForm('quiz', {})
  assert.equal(form.passingScore, '70')
  assert.equal(form.maxAttempts, '')
  assert.equal(form.shuffleOptions, true)
  const settings = formToSettings('quiz', { ...form, maxAttempts: '3', timeLimitMinutes: '', passingScore: '150' })
  assert.deepEqual(settings, { passingScore: 100, maxAttempts: 3, timeLimitMinutes: null, drawCount: null, shuffleQuestions: false, shuffleOptions: true, showAnswers: 'after_submit', layout: 'all' })
  assert.equal(formToSettings('text', {}), null)
})

test('assignment settings validation', () => {
  const form = settingsToForm('assignment', null)
  assert.deepEqual(validateSettings('assignment', form), {})
  assert.ok(validateSettings('assignment', { ...form, allowText: false, allowFiles: false }).allowText)
  assert.ok(validateSettings('assignment', { ...form, maxFiles: '11' }).maxFiles)
  assert.equal(formToSettings('assignment', { ...form, passingScore: '' }).passingScore, null)
  assert.ok(validateSettings('quiz', { ...settingsToForm('quiz'), passingScore: '' }).passingScore)
})

test('question form rules per kind', () => {
  const single = { ...emptyQuestionForm('single'), prompt: '¿Capital?', options: [{ text: 'A', correct: true }, { text: 'B', correct: true }] }
  assert.ok(validateQuestionForm(single).options)
  const fixed = setOptionCorrect(single, 1, true)
  assert.deepEqual(fixed.options.map((o) => o.correct), [false, true])
  assert.deepEqual(validateQuestionForm(fixed), {})
  const multiple = changeQuestionKind({ ...single, kind: 'multiple' }, 'single')
  assert.deepEqual(multiple.options.map((o) => o.correct), [true, false])
  assert.ok(validateQuestionForm({ ...fixed, options: [...fixed.options, { text: ' ', correct: false }] }).options)
  assert.deepEqual(formToQuestion({ ...emptyQuestionForm('true_false'), prompt: 'x', trueFalse: 'false' }).options, [
    { text: 'Verdadero', correct: false }, { text: 'Falso', correct: true },
  ])
  assert.deepEqual(formToQuestion({ ...emptyQuestionForm('open'), prompt: 'x', points: '3' }), { kind: 'open', prompt: 'x', options: [], config: {}, points: 3, explanation: null })
  const tf = questionToForm({ kind: 'true_false', prompt: 'p', points: 2, options: [{ id: 'true', text: 'Verdadero', correct: false }, { id: 'false', text: 'Falso', correct: true }] })
  assert.equal(tf.trueFalse, 'false')
})

test('answers: selection and unanswered count', () => {
  const multiple = { id: 'q1', kind: 'multiple', options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }
  assert.deepEqual(selectOption(multiple, { optionIds: ['c'] }, 'a'), { optionIds: ['a', 'c'] })
  assert.deepEqual(selectOption(multiple, { optionIds: ['a', 'c'] }, 'a'), { optionIds: ['c'] })
  assert.deepEqual(selectOption({ kind: 'single' }, { optionIds: ['a'] }, 'b'), { optionIds: ['b'] })
  const open = { id: 'q2', kind: 'open' }
  assert.equal(countUnanswered([multiple, open], { q1: { optionIds: [] }, q2: { text: '  ' } }), 2)
  assert.equal(countUnanswered([multiple, open], { q1: { optionIds: ['a'] }, q2: { text: 'ok' } }), 0)
})

test('countdown', () => {
  assert.equal(remainingMs(null), null)
  assert.equal(remainingMs('2026-10-17T10:00:00Z', Date.parse('2026-10-17T10:01:00Z')), 0)
  assert.equal(formatCountdown(245_000), '4:05')
  assert.equal(formatCountdown(3_723_000), '1:02:03')
})

test('quizState', () => {
  assert.equal(quizState({ attemptsUsed: 2, attemptsAllowed: 2, passed: false }).outOfAttempts, true)
  assert.equal(quizState({ attemptsUsed: 2, attemptsAllowed: null }).canStart, true)
  assert.equal(quizState({ attemptsUsed: 1, attemptsAllowed: 3, lastAttempt: { status: 'submitted' } }).canStart, false)
  assert.equal(quizState({ attemptsUsed: 1, attemptsAllowed: 1, currentAttemptId: 'x' }).canStart, true)
})

test('manual points validation', () => {
  const questions = [{ id: 'a', kind: 'single', points: 1 }, { id: 'b', kind: 'open', points: 5 }, { id: 'c', kind: 'open', points: 2 }]
  const result = validateManualPoints(questions, { b: '4.5', c: '3' })
  assert.deepEqual(result.values, { b: 4.5 })
  assert.ok(result.errors.c)
})

test('editor bounds match the validators and the payload clamps', () => {
  assert.deepEqual(LMS_BOUNDS.maxAttempts, { min: 1, max: 20 })
  const quiz = settingsToForm('quiz')
  const errors = validateSettings('quiz', { ...quiz, passingScore: '-123', maxAttempts: '21', timeLimitMinutes: '601', drawCount: '201' })
  assert.deepEqual(Object.keys(errors).sort(), ['drawCount', 'maxAttempts', 'passingScore', 'timeLimitMinutes'])
  assert.deepEqual(validateSettings('quiz', { ...quiz, maxAttempts: '20', timeLimitMinutes: '600', drawCount: '200' }), {})
  const settings = formToSettings('quiz', { ...quiz, maxAttempts: '50', drawCount: '999' })
  assert.equal(settings.maxAttempts, 20)
  assert.equal(settings.drawCount, 200)
  const assignment = settingsToForm('assignment')
  const aErrors = validateSettings('assignment', { ...assignment, maxFiles: '11', dueDaysAfterEnroll: '366', passingScore: '101' })
  assert.deepEqual(Object.keys(aErrors).sort(), ['dueDaysAfterEnroll', 'maxFiles', 'passingScore'])
  assert.equal(formToSettings('assignment', { ...assignment, dueDaysAfterEnroll: '400' }).dueDaysAfterEnroll, 365)
  assert.ok(validateQuestionForm({ ...emptyQuestionForm('open'), prompt: 'P', points: '101' }).points)
  assert.equal(validateQuestionForm({ ...emptyQuestionForm('open'), prompt: 'P', points: '100' }).points, undefined)
  assert.equal(formToQuestion({ ...emptyQuestionForm('open'), prompt: 'P', points: '500' }).points, 100)
})
