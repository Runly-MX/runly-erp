import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LmsError } from '../lms-core.js'
import { drawQuestions, learnerQuestion, normalizeQuestionInput, revealedQuestion, sanitizeAnswers, scoreAttempt } from '../lms-eval-core.js'
import { serializeQuestion } from '../lms-eval-shared.js'
import { normalizeText, parseBlanks, parseNumber, readOptions } from '../lms-question-input.js'

const counter = () => { let n = 0; return () => `o${String(++n).padStart(6, '0')}` }
const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
const rejects = (fn) => assert.throws(fn, (err) => err instanceof LmsError && err.status === 400)
// A stored question row built through the real validator.
const build = (body, id = 'q') => ({ id, points: 1, ...normalizeQuestionInput({ points: 1, ...body }, { makeId: counter() }) })
const score = (q, answer, order) => scoreAttempt([q], { [q.id]: answer }, {}, order ? { [q.id]: order } : {}).perQuestion[q.id]

test('text and number helpers', () => {
  assert.equal(normalizeText('  Ciudad de  MÉXICO '), 'ciudad de mexico')
  assert.equal(parseNumber('3,5'), 3.5)
  assert.equal(parseNumber(' -2.25 '), -2.25)
  assert.equal(parseNumber('abc'), null)
  assert.equal(parseNumber(''), null)
  assert.deepEqual(parseBlanks('La capital es [[Madrid]] y el cielo es [[azul | celeste]].'), [['Madrid'], ['azul', 'celeste']])
})

test('short: accepted answers ignore case, accents and spaces unless exact match', () => {
  rejects(() => normalizeQuestionInput({ kind: 'short', prompt: 'x', options: [] }))
  rejects(() => normalizeQuestionInput({ kind: 'short', prompt: 'x', options: [{ text: '  ' }] }))
  const q = build({ kind: 'short', prompt: 'Capital de México', options: [{ text: 'Ciudad de México' }, { text: 'CDMX' }, { text: 'cdmx' }] })
  assert.equal(readOptions(q.options).items.length, 2) // duplicates by normalized text collapse
  assert.equal(score(q, { text: '  ciudad de mexico ' }).correct, true)
  assert.equal(score(q, { text: 'cdmx' }).awarded, 1)
  assert.equal(score(q, { text: 'Guadalajara' }).correct, false)
  assert.equal(score(q, { text: '' }).correct, false)
  const exact = build({ kind: 'short', prompt: 'x', options: [{ text: 'México' }], config: { exactMatch: true } })
  assert.equal(score(exact, { text: ' México ' }).correct, true)
  assert.equal(score(exact, { text: 'mexico' }).correct, false)
})

test('numeric: answer with tolerance, comma decimals', () => {
  rejects(() => normalizeQuestionInput({ kind: 'numeric', prompt: 'x', config: {} }))
  rejects(() => normalizeQuestionInput({ kind: 'numeric', prompt: 'x', config: { answer: 3, tolerance: -1 } }))
  const q = build({ kind: 'numeric', prompt: 'π', config: { answer: '3.14', tolerance: '0.01' } })
  assert.deepEqual(readOptions(q.options).config, { answer: 3.14, tolerance: 0.01 })
  assert.equal(score(q, { value: '3,15' }).correct, true)
  assert.equal(score(q, { value: '3.13' }).correct, true)
  assert.equal(score(q, { value: '3.16' }).correct, false)
  assert.equal(score(q, { value: 'tres' }).correct, false)
  const exact = build({ kind: 'numeric', prompt: 'x', config: { answer: 10 } })
  assert.equal(score(exact, { value: '10' }).correct, true)
  assert.equal(score(exact, { value: '10.001' }).correct, false)
})

test('ordering: all-or-nothing, partial credit, untouched order scored as shown', () => {
  rejects(() => normalizeQuestionInput({ kind: 'ordering', prompt: 'x', options: [{ text: 'solo' }] }))
  const q = { ...build({ kind: 'ordering', prompt: 'x', options: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }] }), points: 4 }
  const ids = readOptions(q.options).items.map((item) => item.id)
  assert.equal(score(q, { order: ids }).awarded, 4)
  const twoRight = [ids[0], ids[1], ids[3], ids[2]]
  assert.deepEqual(score(q, { order: twoRight }), { awarded: 0, correct: false })
  const partial = { ...q, options: { ...q.options, config: { partialCredit: true } } }
  assert.deepEqual(score(partial, { order: twoRight }), { awarded: 2, correct: false })
  assert.equal(score(partial, undefined, twoRight).awarded, 2)
  // The shown order is never the solution.
  for (let seed = 1; seed < 30; seed += 1) {
    const { optionOrder } = drawQuestions([q], {}, seeded(seed))
    assert.notDeepEqual(optionOrder.q, ids)
    assert.deepEqual([...optionOrder.q].sort(), [...ids].sort())
  }
})

test('matching: separate right ids, all-or-nothing and partial credit', () => {
  rejects(() => normalizeQuestionInput({ kind: 'matching', prompt: 'x', options: [{ text: 'a', match: '1' }, { text: 'b', match: ' 1 ' }] }))
  rejects(() => normalizeQuestionInput({ kind: 'matching', prompt: 'x', options: [{ text: 'a', match: '1' }, { text: 'b', match: '' }] }))
  const q = { ...build({ kind: 'matching', prompt: 'x', options: [{ text: 'Francia', match: 'París' }, { text: 'Italia', match: 'Roma' }, { text: 'Perú', match: 'Lima' }] }), points: 3 }
  const items = readOptions(q.options).items
  assert.equal(new Set([...items.map((i) => i.id), ...items.map((i) => i.matchId)]).size, 6)
  const right = Object.fromEntries(items.map((i) => [i.id, i.matchId]))
  assert.equal(score(q, { pairs: right }).awarded, 3)
  const oneWrong = { ...right, [items[0].id]: items[1].matchId, [items[1].id]: items[0].matchId }
  assert.equal(score(q, { pairs: oneWrong }).awarded, 0)
  const partial = { ...q, options: { ...q.options, config: { partialCredit: true } } }
  assert.equal(score(partial, { pairs: oneWrong }).awarded, 1)
  // Editing keeps both ids.
  const edited = normalizeQuestionInput({ options: items.map((i) => ({ id: i.id, text: i.text, match: `${i.match}!` })) }, { partial: true, existing: q, makeId: counter() })
  assert.deepEqual(readOptions(edited.options).items.map((i) => i.matchId), items.map((i) => i.matchId))
})

test('fill_blank: per-blank proportional, alternatives, all-or-nothing', () => {
  rejects(() => normalizeQuestionInput({ kind: 'fill_blank', prompt: 'Sin espacios' }))
  rejects(() => normalizeQuestionInput({ kind: 'fill_blank', prompt: 'Vacío [[ ]]' }))
  const q = { ...build({ kind: 'fill_blank', prompt: 'El cielo es [[azul|celeste]] y el pasto es [[verde]].' }), points: 2 }
  assert.equal(score(q, { blanks: ['Celeste', ' VERDE '] }).awarded, 2)
  assert.deepEqual(score(q, { blanks: ['azul', 'rojo'] }), { awarded: 1, correct: false })
  const strict = { ...q, options: { items: [], config: { allOrNothing: true } } }
  assert.equal(score(strict, { blanks: ['azul', 'rojo'] }).awarded, 0)
  // A partial edit of the prompt re-validates the blanks.
  assert.throws(() => normalizeQuestionInput({ prompt: 'ya no hay espacios' }, { partial: true, existing: q }), LmsError)
})

test('multiple: optional partial credit is right minus wrong, floored at 0', () => {
  const body = { kind: 'multiple', prompt: 'x', options: [{ text: 'a', correct: true }, { text: 'b', correct: true }, { text: 'c' }, { text: 'd' }] }
  const strict = { ...build(body), points: 4 }
  assert.ok(Array.isArray(strict.options)) // no config: legacy array shape
  const [a, b, c, d] = strict.options.map((o) => o.id)
  assert.equal(score(strict, { optionIds: [a] }).awarded, 0)
  const partial = { ...build({ ...body, config: { partialCredit: true } }), points: 4 }
  assert.deepEqual(readOptions(partial.options).config, { partialCredit: true })
  const ids = readOptions(partial.options).items.map((o) => o.id)
  assert.deepEqual(score(partial, { optionIds: [ids[0]] }), { awarded: 2, correct: false })
  assert.equal(score(partial, { optionIds: [ids[0], ids[2]] }).awarded, 0)
  assert.equal(score(partial, { optionIds: [ids[0], ids[2], ids[3]] }).awarded, 0)
  assert.deepEqual(score(partial, { optionIds: [ids[0], ids[1]] }), { awarded: 4, correct: true })
  assert.ok(b && c && d)
})

test('learner shapes never leak answer keys; reveal adds them', () => {
  const make = (body, id) => build(body, id)
  const questions = [
    make({ kind: 'short', prompt: 'S', options: [{ text: 'secreto-corto' }] }, 's'),
    make({ kind: 'numeric', prompt: 'N', config: { answer: 98765, tolerance: 0.5 } }, 'n'),
    make({ kind: 'ordering', prompt: 'O', options: [{ text: 'uno' }, { text: 'dos' }, { text: 'tres' }] }, 'o'),
    make({ kind: 'matching', prompt: 'M', options: [{ text: 'A', match: '1' }, { text: 'B', match: '2' }] }, 'm'),
    make({ kind: 'fill_blank', prompt: 'Dice [[palabra-oculta|otra-oculta]] aquí' }, 'f'),
    make({ kind: 'multiple', prompt: 'X', options: [{ text: 'a', correct: true }, { text: 'b' }], config: { partialCredit: true } }, 'x'),
  ].map((q) => ({ ...q, explanation: 'explicación-secreta' }))
  const { optionOrder } = drawQuestions(questions, {}, seeded(4))
  for (const q of questions) {
    const safe = learnerQuestion(q, optionOrder[q.id])
    const json = JSON.stringify(safe)
    for (const leak of ['correct', 'secreto-corto', '98765', 'palabra-oculta', 'otra-oculta', 'explicación', 'matchId', 'accepted', 'correctOrder', 'correctPairs', 'blankAnswers', 'tolerance']) {
      assert.equal(json.includes(leak), false, `${q.kind} leaks ${leak}`)
    }
  }
  const matching = learnerQuestion(questions[3], optionOrder.m)
  assert.deepEqual(matching.choices.map((c) => c.text).sort(), ['1', '2'])
  assert.ok(matching.choices.every((c) => !matching.options.some((o) => o.id === c.id)))
  const fill = learnerQuestion(questions[4], [])
  assert.deepEqual(fill.parts, ['Dice ', ' aquí'])
  assert.equal(fill.prompt, 'Dice ____ aquí')

  const shown = (i) => revealedQuestion(questions[i], optionOrder[questions[i].id], { awarded: 0, correct: false })
  assert.deepEqual(shown(0).accepted, ['secreto-corto'])
  assert.equal(shown(1).answer, 98765)
  assert.equal(shown(2).correctOrder.length, 3)
  assert.equal(Object.keys(shown(3).correctPairs).length, 2)
  assert.deepEqual(shown(4).blankAnswers, [['palabra-oculta', 'otra-oculta']])
  assert.equal(shown(5).options.filter((o) => o.correct).length, 1)
})

test('sanitizeAnswers per kind with the question map', () => {
  const qs = [
    build({ kind: 'ordering', prompt: 'O', options: [{ text: 'a' }, { text: 'b' }] }, 'o'),
    build({ kind: 'matching', prompt: 'M', options: [{ text: 'A', match: '1' }, { text: 'B', match: '2' }] }, 'm'),
    build({ kind: 'fill_blank', prompt: '[[x]] [[y]]' }, 'f'),
    build({ kind: 'numeric', prompt: 'N', config: { answer: 1 } }, 'n'),
  ]
  const byId = new Map(qs.map((q) => [q.id, q]))
  const [oa, ob] = readOptions(qs[0].options).items.map((i) => i.id)
  const m = readOptions(qs[1].options).items
  const clean = sanitizeAnswers({
    o: { order: [ob, 'zz', oa, ob] },
    m: { pairs: { [m[0].id]: m[1].matchId, [m[1].id]: 'nope', zz: m[0].matchId } },
    f: { blanks: ['x', 'y', 'extra'] },
    n: { value: 3 },
  }, ['o', 'm', 'f', 'n'], {}, byId)
  assert.deepEqual(clean, { o: { order: [ob, oa] }, m: { pairs: { [m[0].id]: m[1].matchId } }, f: { blanks: ['x', 'y'] }, n: { value: '3' } })
  assert.throws(() => sanitizeAnswers({ n: { value: 'x'.repeat(101) } }, ['n'], {}, byId), LmsError)
})

test('backward compatibility: legacy rows, answers and authoring shape', () => {
  // A row saved before the new kinds: options is a plain array, no config.
  const legacy = { id: 'L', kind: 'multiple', points: 2, prompt: 'P', options: [{ id: 'oa', text: 'a', correct: true }, { id: 'ob', text: 'b', correct: true }, { id: 'oc', text: 'c', correct: false }] }
  assert.equal(score(legacy, { optionIds: ['oa', 'ob'] }).awarded, 2)
  assert.equal(score(legacy, { optionIds: ['oa'] }).awarded, 0)
  assert.deepEqual(drawQuestions([legacy], { shuffleOptions: false }).optionOrder.L, ['oa', 'ob', 'oc'])
  const authored = serializeQuestion({ ...legacy, lessonId: 'x', explanation: null, position: 1 })
  assert.deepEqual(authored.options, legacy.options)
  assert.deepEqual(authored.config, {})
  // An edit that does not touch options keeps the stored array untouched.
  assert.equal(normalizeQuestionInput({ prompt: 'nuevo' }, { partial: true, existing: legacy }).options, undefined)
  // Old attempts saved { optionIds } / { text } and keep scoring the same.
  const open = { id: 'O', kind: 'open', points: 3, options: [] }
  const result = scoreAttempt([legacy, open], { L: { optionIds: ['ob', 'oa'] }, O: { text: 'hola' } }, { O: 1.5 })
  assert.equal(result.scorePoints, 3.5)
})
