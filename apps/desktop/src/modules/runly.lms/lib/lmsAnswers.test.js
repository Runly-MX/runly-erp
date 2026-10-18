import test from 'node:test'
import assert from 'node:assert/strict'
import { answeredPct, blankRows, matchingRows, navState, numericAnswerText, orderedIds, orderingRows, resultStatus, toggleFlag } from './lmsAnswers.js'
import { countUnanswered, isAnswered } from './lmsEval.js'

const ordering = { id: 'o', kind: 'ordering', options: [{ id: 'b', text: 'B' }, { id: 'a', text: 'A' }] }
const matching = { id: 'm', kind: 'matching', options: [{ id: 'l1', text: 'Francia' }, { id: 'l2', text: 'Perú' }], choices: [{ id: 'r2', text: 'Lima' }, { id: 'r1', text: 'París' }] }
const fill = { id: 'f', kind: 'fill_blank', parts: ['Es ', ' y ', '.'] }

test('isAnswered per kind', () => {
  assert.equal(isAnswered({ kind: 'short' }, { text: ' ' }), false)
  assert.equal(isAnswered({ kind: 'numeric' }, { value: '0' }), true)
  assert.equal(isAnswered(ordering, { order: ['a', 'b'] }), true)
  assert.equal(isAnswered(matching, { pairs: { l1: 'r1' } }), false)
  assert.equal(isAnswered(matching, { pairs: { l1: 'r1', l2: 'r2' } }), true)
  assert.equal(isAnswered(fill, { blanks: ['azul', ''] }), false)
  assert.equal(isAnswered(fill, { blanks: ['azul', 'verde'] }), true)
  assert.equal(countUnanswered([ordering, fill], {}), 2)
  assert.equal(answeredPct([ordering, fill], { o: { order: ['a', 'b'] } }), 50)
})

test('navigator state and flags', () => {
  assert.equal(navState(ordering, null, true), 'flagged')
  assert.equal(navState(ordering, { order: ['a'] }, false), 'answered')
  assert.equal(navState(ordering, null, false), 'unanswered')
  const flags = toggleFlag(new Set(), 'o')
  assert.equal(flags.has('o'), true)
  assert.equal(toggleFlag(flags, 'o').has('o'), false)
})

test('ordering rows use the shown order when untouched', () => {
  assert.deepEqual(orderedIds(ordering, null), ['b', 'a'])
  assert.deepEqual(orderedIds(ordering, { order: ['a'] }), ['a', 'b'])
  const rows = orderingRows({ ...ordering, correctOrder: ['a', 'b'] }, null)
  assert.deepEqual(rows.map((r) => [r.text, r.ok, r.correctText]), [['B', false, 'A'], ['A', false, 'B']])
})

test('matching and blank rows after reveal', () => {
  const rows = matchingRows({ ...matching, correctPairs: { l1: 'r1', l2: 'r2' } }, { pairs: { l1: 'r1', l2: 'r1' } })
  assert.deepEqual(rows.map((r) => [r.given, r.ok, r.correct]), [['París', true, 'París'], ['París', false, 'Lima']])
  assert.equal(matchingRows(matching, { pairs: {} })[0].ok, null)
  const blanks = blankRows({ ...fill, blankAnswers: [['azul', 'celeste'], ['verde']] }, { blanks: ['CELESTE ', 'rojo'] })
  assert.deepEqual(blanks.map((r) => r.ok), [true, false])
  const exact = blankRows({ ...fill, exactMatch: true, blankAnswers: [['Azul'], ['verde']] }, { blanks: ['azul', 'verde'] })
  assert.deepEqual(exact.map((r) => r.ok), [false, true])
})

test('result status and numeric text', () => {
  assert.equal(resultStatus({ kind: 'single' }), null)
  assert.equal(resultStatus({ kind: 'open', awardedPoints: null, correct: null }), 'pending')
  assert.equal(resultStatus({ kind: 'ordering', awardedPoints: 1.5, correct: false }), 'partial')
  assert.equal(resultStatus({ kind: 'ordering', awardedPoints: 0, correct: false }), 'wrong')
  assert.equal(resultStatus({ kind: 'short', awardedPoints: 1, correct: true }), 'correct')
  assert.equal(numericAnswerText({ answer: 10, tolerance: 0.5 }), '10 (± 0.5)')
  assert.equal(numericAnswerText({ answer: 3, tolerance: 0 }), '3')
  assert.equal(numericAnswerText({}), null)
})
