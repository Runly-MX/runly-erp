// Quiz question kinds during an attempt: display order, answer sanitizing,
// scoring, and the learner / revealed shapes. No I/O.
//
// Answer JSON per kind (attempt.answers[questionId]):
//   single | multiple | true_false  { optionIds: [id] }
//   open | short                    { text }
//   numeric                         { value }            (string as typed, "3,5" accepted)
//   ordering                        { order: [itemId] }  (top to bottom)
//   matching                        { pairs: { leftId: rightId } }
//   fill_blank                      { blanks: [text] }   (one per blank, in prompt order)
import { LmsError } from './lms-error.js'
import { blankParts, parseBlanks, parseNumber, readOptions, textMatches } from './lms-question-input.js'

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const round2 = (n) => Math.round(n * 100) / 100
const tooLong = () => new LmsError('Una respuesta es demasiado larga.', 400)

function shuffle(list, random) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// A shuffle that never hands back the solved order (lists of 2+).
function scramble(ids, random) {
  if (ids.length < 2) return [...ids]
  for (let tries = 0; tries < 6; tries += 1) {
    const out = shuffle(ids, random)
    if (out.some((id, index) => id !== ids[index])) return out
  }
  return [...ids.slice(1), ids[0]]
}

// Ids the learner sees, in display order. matching: left ids then right ids.
export function displayOrder(question, shuffleOptions, random) {
  const { items } = readOptions(question.options)
  const ids = items.map((item) => item.id)
  switch (question.kind) {
    case 'true_false': return ids
    case 'single':
    case 'multiple': return shuffleOptions ? shuffle(ids, random) : ids
    case 'ordering': return scramble(ids, random)
    case 'matching': return [...(shuffleOptions ? shuffle(ids, random) : ids), ...scramble(items.map((item) => item.matchId), random)]
    default: return []
  }
}

// Items in the attempt's order; anything missing from the order goes last.
function ordered(items, order, key = 'id') {
  if (!Array.isArray(order)) return items
  const byId = new Map(items.map((item) => [item[key], item]))
  return [...order.map((id) => byId.get(id)).filter(Boolean), ...items.filter((item) => !order.includes(item[key]))]
}

const shortText = (value, max) => {
  const text = String(value ?? '')
  if (text.length > max) throw tooLong()
  return text
}

// One answer cleaned for its question; `order` is the attempt's optionOrder entry.
export function sanitizeAnswer(question, value, order = []) {
  const src = isObject(value) ? value : {}
  const { items } = readOptions(question.options)
  const ids = (list) => (Array.isArray(list) ? list.map(String) : [])
  switch (question.kind) {
    case 'open': return { text: shortText(src.text, 20_000) }
    case 'short': return { text: shortText(src.text, 1000) }
    case 'numeric': return { value: shortText(src.value, 100) }
    case 'ordering': {
      const known = new Set(items.map((item) => item.id))
      return { order: [...new Set(ids(src.order))].filter((id) => known.has(id)) }
    }
    case 'matching': {
      const left = new Set(items.map((item) => item.id)), right = new Set(items.map((item) => item.matchId))
      const pairs = {}
      for (const [leftId, rightId] of Object.entries(isObject(src.pairs) ? src.pairs : {})) {
        if (left.has(leftId) && right.has(String(rightId))) pairs[leftId] = String(rightId)
      }
      return { pairs }
    }
    case 'fill_blank': {
      const count = parseBlanks(question.prompt).length
      return { blanks: (Array.isArray(src.blanks) ? src.blanks : []).slice(0, count).map((text) => shortText(text ?? '', 500)) }
    }
    default: {
      const allowed = Array.isArray(order) && order.length ? order : items.map((item) => item.id)
      return { optionIds: [...new Set(ids(src.optionIds))].filter((id) => allowed.includes(id)) }
    }
  }
}

// -> { awarded, correct } for an auto-scored kind. `shownOrder` is what an
// ordering question displayed (used when the learner never moved an item).
export function scoreQuestion(question, answer, shownOrder) {
  const points = Number(question.points) || 0
  const { items, config } = readOptions(question.options)
  const part = (ratio) => {
    const awarded = round2(points * Math.min(1, Math.max(0, ratio)))
    return { awarded, correct: awarded >= points }
  }
  const all = (ok) => ({ awarded: ok ? points : 0, correct: ok })
  switch (question.kind) {
    case 'short': {
      const text = answer?.text
      return all(items.some((item) => textMatches(text, item.text, config.exactMatch === true)))
    }
    case 'numeric': {
      const given = parseNumber(answer?.value)
      const target = parseNumber(config.answer)
      const tolerance = Math.max(0, parseNumber(config.tolerance) ?? 0)
      return all(given !== null && target !== null && Math.abs(given - target) <= tolerance + 1e-9)
    }
    case 'ordering': {
      const given = Array.isArray(answer?.order) && answer.order.length ? answer.order : Array.isArray(shownOrder) ? shownOrder : []
      const hits = items.filter((item, index) => given[index] === item.id).length
      if (config.partialCredit === true) return part(items.length ? hits / items.length : 0)
      return all(items.length > 0 && hits === items.length)
    }
    case 'matching': {
      const pairs = isObject(answer?.pairs) ? answer.pairs : {}
      const hits = items.filter((item) => pairs[item.id] === item.matchId).length
      if (config.partialCredit === true) return part(items.length ? hits / items.length : 0)
      return all(items.length > 0 && hits === items.length)
    }
    case 'fill_blank': {
      const blanks = parseBlanks(question.prompt)
      const given = Array.isArray(answer?.blanks) ? answer.blanks : []
      const hits = blanks.filter((accepted, index) => accepted.some((option) => textMatches(given[index], option, config.exactMatch === true))).length
      if (config.allOrNothing === true) return all(blanks.length > 0 && hits === blanks.length)
      return part(blanks.length ? hits / blanks.length : 0)
    }
    case 'multiple': {
      const selected = new Set(Array.isArray(answer?.optionIds) ? answer.optionIds : [])
      const correctIds = items.filter((option) => option.correct).map((option) => option.id)
      const right = correctIds.filter((id) => selected.has(id)).length
      const wrong = [...selected].filter((id) => !correctIds.includes(id) && items.some((option) => option.id === id)).length
      if (config.partialCredit === true) return part(correctIds.length ? (right - wrong) / correctIds.length : 0)
      return all(right === correctIds.length && wrong === 0 && selected.size === correctIds.length)
    }
    default: {
      const selected = [...new Set(Array.isArray(answer?.optionIds) ? answer.optionIds : [])]
      const correctIds = items.filter((option) => option.correct).map((option) => option.id)
      return all(selected.length === 1 && correctIds.includes(selected[0]))
    }
  }
}

const partialFlag = (question, config) => {
  if (question.kind === 'fill_blank') return config.allOrNothing !== true
  return ['multiple', 'ordering', 'matching'].includes(question.kind) && config.partialCredit === true
}

// What a learner may see before answers are revealed: no correct flags, no
// accepted answers, no pairings, and fill_blank prompts without their answers.
export function learnerQuestion(question, order) {
  const { items, config } = readOptions(question.options)
  const base = { id: question.id, kind: question.kind, prompt: question.prompt, points: question.points }
  switch (question.kind) {
    case 'ordering':
      return { ...base, options: ordered(items, order).map(({ id, text }) => ({ id, text })), ...(partialFlag(question, config) ? { partialCredit: true } : {}) }
    case 'matching': {
      const leftIds = new Set(items.map((item) => item.id))
      const list = Array.isArray(order) ? order : []
      return {
        ...base,
        options: ordered(items, list.filter((id) => leftIds.has(id))).map(({ id, text }) => ({ id, text })),
        choices: ordered(items, list.filter((id) => !leftIds.has(id)), 'matchId').map(({ matchId, match }) => ({ id: matchId, text: match })),
        ...(partialFlag(question, config) ? { partialCredit: true } : {}),
      }
    }
    case 'fill_blank': {
      const parts = blankParts(question.prompt)
      return { ...base, prompt: parts.join('____'), options: [], parts, ...(partialFlag(question, config) ? { partialCredit: true } : {}) }
    }
    case 'single':
    case 'multiple':
    case 'true_false':
      return { ...base, options: ordered(items, order).map(({ id, text }) => ({ id, text })), ...(partialFlag(question, config) ? { partialCredit: true } : {}) }
    default:
      return { ...base, options: [] }
  }
}

// After submission (per showAnswers) or for graders. result: scoreAttempt().perQuestion[id].
export function revealedQuestion(question, order, result) {
  const { items, config } = readOptions(question.options)
  const out = learnerQuestion(question, order)
  if (['single', 'multiple', 'true_false'].includes(question.kind)) {
    out.options = ordered(items, order).map(({ id, text, correct }) => ({ id, text, correct: correct === true }))
  }
  if (question.kind === 'short') out.accepted = items.map((item) => item.text)
  if (question.kind === 'numeric') Object.assign(out, { answer: parseNumber(config.answer), tolerance: parseNumber(config.tolerance) ?? 0 })
  if (question.kind === 'ordering') out.correctOrder = items.map((item) => item.id)
  if (question.kind === 'matching') out.correctPairs = Object.fromEntries(items.map((item) => [item.id, item.matchId]))
  if (question.kind === 'fill_blank') {
    out.blankAnswers = parseBlanks(question.prompt)
    if (config.exactMatch === true) out.exactMatch = true
  }
  return {
    ...out,
    explanation: question.explanation ?? null,
    awardedPoints: result?.awarded ?? null,
    correct: result?.correct ?? null,
  }
}
