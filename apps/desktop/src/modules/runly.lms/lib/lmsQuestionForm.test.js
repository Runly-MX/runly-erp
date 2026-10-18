import test from 'node:test'
import assert from 'node:assert/strict'
import {
  blankParts, emptyQuestionForm, formToPreview, formToQuestion, insertRow, parseBlanks, parseNumber, promptPreview,
  questionToForm, removeRow, setOptionCorrect, validateQuestionForm,
} from './lmsQuestionForm.js'
import { drawCountWarning, settingsToForm, formToSettings } from './lmsEval.js'
import { QUESTION_KIND_DESCRIPTIONS, QUESTION_KIND_LABELS } from './lmsLabels.js'

const strip = (rows) => rows.map(({ key: _key, ...rest }) => rest)

test('every kind has a Spanish label and description', () => {
  for (const kind of ['single', 'multiple', 'true_false', 'short', 'numeric', 'fill_blank', 'ordering', 'matching', 'open']) {
    assert.ok(QUESTION_KIND_LABELS[kind], kind)
    assert.ok(QUESTION_KIND_DESCRIPTIONS[kind], kind)
  }
})

test('round trip keeps ids and config for every new kind', () => {
  const short = { kind: 'short', prompt: 'P', points: 2, options: [{ id: 'oa', text: 'CDMX' }], config: { exactMatch: true } }
  const form = questionToForm(short)
  assert.equal(form.exactMatch, true)
  assert.deepEqual(formToQuestion(form), { kind: 'short', prompt: 'P', options: [{ id: 'oa', text: 'CDMX' }], config: { exactMatch: true }, points: 2, explanation: null })

  const matching = { kind: 'matching', prompt: 'P', points: 1, options: [{ id: 'l1', text: 'A', match: '1', matchId: 'r1' }, { id: 'l2', text: 'B', match: '2', matchId: 'r2' }], config: { partialCredit: true } }
  const body = formToQuestion(questionToForm(matching))
  assert.deepEqual(body.options, [{ id: 'l1', text: 'A', match: '1' }, { id: 'l2', text: 'B', match: '2' }])
  assert.deepEqual(body.config, { partialCredit: true })

  const numeric = formToQuestion({ ...questionToForm({ kind: 'numeric', prompt: 'P', points: 1, options: [], config: { answer: 3.5, tolerance: 0.1 } }) })
  assert.deepEqual(numeric.config, { answer: 3.5, tolerance: 0.1 })
  assert.deepEqual(formToQuestion({ ...emptyQuestionForm('fill_blank'), prompt: '[[a]]', allOrNothing: true }).config, { allOrNothing: true, exactMatch: false })
  // A legacy question (no config) opens with every switch off.
  assert.equal(questionToForm({ kind: 'multiple', prompt: 'P', points: 1, options: [{ id: 'a', text: 'a', correct: true }, { id: 'b', text: 'b' }] }).partialCredit, false)
})

test('validation per kind', () => {
  const base = (kind, extra = {}) => ({ ...emptyQuestionForm(kind), prompt: 'P', ...extra })
  assert.ok(validateQuestionForm(base('short')).accepted)
  assert.deepEqual(validateQuestionForm(base('short', { accepted: [{ key: 'k', text: 'ok' }] })), {})
  assert.ok(validateQuestionForm(base('numeric')).numericAnswer)
  assert.ok(validateQuestionForm(base('numeric', { numericAnswer: '2', tolerance: '-1' })).tolerance)
  assert.deepEqual(validateQuestionForm(base('numeric', { numericAnswer: '-2.5', tolerance: '' })), {})
  assert.ok(validateQuestionForm(base('ordering')).items)
  assert.deepEqual(validateQuestionForm(base('ordering', { items: [{ key: 'a', text: '1' }, { key: 'b', text: '2' }] })), {})
  assert.ok(validateQuestionForm(base('matching', { pairs: [{ key: 'a', text: 'A', match: 'x' }, { key: 'b', text: 'B', match: ' X ' }] })).pairs)
  assert.ok(validateQuestionForm(base('fill_blank', { prompt: 'sin espacios' })).prompt)
  assert.ok(validateQuestionForm(base('fill_blank', { prompt: 'vacío [[ | ]]' })).prompt)
  assert.deepEqual(validateQuestionForm(base('fill_blank', { prompt: 'La capital es [[París]]' })), {})
})

test('row helpers: Enter inserts below, single choice is exclusive', () => {
  const form = emptyQuestionForm('single')
  const added = insertRow(form, 'options', 0)
  assert.equal(added.options.length, 3)
  assert.equal(added.options[0], form.options[0])
  assert.notEqual(added.options[1].key, form.options[1].key)
  assert.equal(removeRow(added, 'options', 1).options.length, 2)
  const marked = setOptionCorrect(setOptionCorrect(form, 0, true), 1, true)
  assert.deepEqual(marked.options.map((o) => o.correct), [false, true])
  const multiple = setOptionCorrect(setOptionCorrect({ ...form, kind: 'multiple' }, 0, true), 1, true)
  assert.deepEqual(multiple.options.map((o) => o.correct), [true, true])
})

test('preview is learner-shaped and keeps fill_blank answers out', () => {
  const preview = formToPreview({ ...emptyQuestionForm('fill_blank'), prompt: 'Es [[azul|celeste]] y [[verde]].' })
  assert.deepEqual(preview.parts, ['Es ', ' y ', '.'])
  assert.equal(JSON.stringify(preview).includes('celeste'), false)
  const matching = formToPreview({ ...emptyQuestionForm('matching'), pairs: [{ key: 'a', text: 'A', match: '1' }] })
  assert.deepEqual(strip(matching.choices), [{ id: 'am', text: '1' }])
  assert.equal(JSON.stringify(formToPreview({ ...emptyQuestionForm('single'), options: [{ key: 'x', text: 'Sí', correct: true }] })).includes('correct'), false)
})

test('parsers and prompt preview', () => {
  assert.equal(parseNumber('3,5'), 3.5)
  assert.equal(parseNumber('x'), null)
  assert.deepEqual(parseBlanks('[[a | b]] y [[c]]'), [['a', 'b'], ['c']])
  assert.deepEqual(blankParts('A [[x]] B'), ['A ', ' B'])
  assert.equal(promptPreview('## **¿Qué** es [esto](http://x)?\nmás'), '¿Qué es esto?')
  assert.equal(promptPreview('Capital: [[París]]'), 'Capital: ____')
  assert.equal(promptPreview(''), 'Sin texto')
})

test('quiz layout setting and draw count warning', () => {
  assert.equal(settingsToForm('quiz', {}).layout, 'all')
  assert.equal(formToSettings('quiz', { ...settingsToForm('quiz', {}), layout: 'one' }).layout, 'one')
  assert.equal(formToSettings('quiz', { ...settingsToForm('quiz', {}), layout: 'nope' }).layout, 'all')
  assert.equal(drawCountWarning('', 30), null)
  assert.equal(drawCountWarning('10', 30), null)
  assert.match(drawCountWarning('40', 30), /Solo hay 30 preguntas/)
  assert.equal(drawCountWarning('5', null), null)
})
