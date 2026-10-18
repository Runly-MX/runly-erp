// Quiz question kinds: storage shape and author input validation. No I/O.
//
// `lms_quiz_question.options` holds either the legacy array of items (choice
// kinds without extra settings) or `{ items, config }` when a kind needs
// configuration. readOptions() reads both, so old rows keep working.
import { LmsError } from './lms-error.js'

export const QUESTION_KINDS = ['single', 'multiple', 'true_false', 'open', 'short', 'numeric', 'ordering', 'matching', 'fill_blank']
// Kinds whose `items` the learner sees as a list of ids (shuffled per attempt).
export const LIST_KINDS = ['single', 'multiple', 'true_false', 'ordering', 'matching']
export const TEXT_KINDS = ['open', 'short']
export const MAX_ITEMS = 20
export const MAX_BLANKS = 30
const TRUE_FALSE = [{ id: 'true', text: 'Verdadero' }, { id: 'false', text: 'Falso' }]
const BLANK_RE = /\[\[([^\]]*)\]\]/g

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const fail = (message) => { throw new LmsError(message, 400) }

// -> { items: [], config: {} } for both storage shapes.
export function readOptions(raw) {
  if (Array.isArray(raw)) return { items: raw, config: {} }
  if (isObject(raw)) return { items: Array.isArray(raw.items) ? raw.items : [], config: isObject(raw.config) ? raw.config : {} }
  return { items: [], config: {} }
}

// Legacy array when there is nothing to configure, so unchanged kinds keep their shape.
export function writeOptions(items, config) {
  const clean = Object.fromEntries(Object.entries(config ?? {}).filter(([, value]) => value !== undefined && value !== false && value !== null))
  return Object.keys(clean).length ? { items, config: clean } : items
}

// Lower case, no accents, single spaces: "  Ciudad de  México " === "ciudad de mexico".
export function normalizeText(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

export const textMatches = (given, accepted, exact = false) => {
  if (exact) return String(given ?? '').trim() === String(accepted ?? '').trim() && String(given ?? '').trim() !== ''
  const g = normalizeText(given)
  return g !== '' && g === normalizeText(accepted)
}

// "3,5" -> 3.5, " 1e3 " -> 1000; null when it is not a number.
export function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  let text = String(value ?? '').trim().replace(/\s+/g, '')
  if (!text) return null
  if (/^[-+]?\d+,\d+$/.test(text)) text = text.replace(',', '.')
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

// Blanks of a fill_blank prompt: [['Madrid'], ['rojo', 'colorado']].
export function parseBlanks(prompt) {
  const out = []
  for (const match of String(prompt ?? '').matchAll(BLANK_RE)) {
    out.push(match[1].split('|').map((answer) => answer.trim()).filter(Boolean))
  }
  return out
}

// Learner view of a fill_blank prompt: the text around each blank.
export function blankParts(prompt) {
  return String(prompt ?? '').split(BLANK_RE).filter((_, index) => index % 2 === 0)
}

// Ids for authored items: explicit known ids win, then the id at the same
// position, so editing text or reordering keeps identities.
function assignIds(raw, existingItems, makeId, used = new Set()) {
  const previous = (existingItems ?? []).map((item) => item?.id).filter((id) => id && id !== 'true' && id !== 'false')
  const known = new Set(previous)
  const claimed = new Set(raw.map((item) => item?.id).filter((id) => known.has(id)))
  return raw.map((item, index) => {
    let id = null
    if (known.has(item?.id) && !used.has(item.id)) id = item.id
    else if (previous[index] && !claimed.has(previous[index]) && !used.has(previous[index])) id = previous[index]
    while (!id || used.has(id)) id = makeId()
    used.add(id)
    return id
  })
}

function itemText(value, label, max = 1000) {
  const text = String(value ?? '').trim()
  if (!text) fail(`Escribe el texto de cada ${label}.`)
  if (text.length > max) fail(`Un texto de ${label} es demasiado largo.`)
  return text
}

function listOf(raw, { min, label }) {
  if (!Array.isArray(raw)) fail(`Agrega ${label}.`)
  if (raw.length < min) fail(min === 1 ? `Agrega al menos una ${label}.` : `Agrega al menos ${min} ${label}.`)
  if (raw.length > MAX_ITEMS) fail(`Una pregunta admite como máximo ${MAX_ITEMS} elementos.`)
  return raw
}

const flag = (config, key) => config?.[key] === true

function choiceOptions(kind, raw, existing, makeId, config) {
  const list = listOf(raw, { min: 2, label: 'opciones' })
  const ids = assignIds(list, existing.items, makeId)
  const items = list.map((option, index) => ({ id: ids[index], text: itemText(option?.text, 'opción'), correct: option?.correct === true }))
  const correct = items.filter((option) => option.correct).length
  if (kind === 'single' && correct !== 1) fail('Marca exactamente una opción correcta.')
  if (kind === 'multiple' && correct < 1) fail('Marca al menos una opción correcta.')
  return writeOptions(items, kind === 'multiple' ? { partialCredit: flag(config, 'partialCredit') } : {})
}

function trueFalseOptions(raw) {
  if (!Array.isArray(raw)) fail('Indica si la respuesta correcta es Verdadero o Falso.')
  const marked = new Set()
  raw.forEach((option, index) => {
    if (option?.correct !== true) return
    const id = option.id === 'true' || option.id === 'false' ? option.id : ['true', 'false'][index]
    if (id) marked.add(id)
  })
  if (marked.size !== 1) fail('Indica si la respuesta correcta es Verdadero o Falso.')
  return TRUE_FALSE.map((option) => ({ ...option, correct: marked.has(option.id) }))
}

function shortOptions(raw, existing, makeId, config) {
  const list = listOf(raw, { min: 1, label: 'respuesta aceptada' })
  const ids = assignIds(list, existing.items, makeId)
  const seen = new Set()
  const items = []
  list.forEach((answer, index) => {
    const text = itemText(answer?.text, 'respuesta aceptada', 200)
    const key = flag(config, 'exactMatch') ? text : normalizeText(text)
    if (seen.has(key)) return
    seen.add(key)
    items.push({ id: ids[index], text })
  })
  return { items, config: { exactMatch: flag(config, 'exactMatch') } }
}

function numericOptions(config) {
  const answer = parseNumber(config?.answer)
  if (answer === null) fail('Escribe la respuesta numérica correcta.')
  const tolerance = config?.tolerance === undefined || config?.tolerance === null || config?.tolerance === '' ? 0 : parseNumber(config.tolerance)
  if (tolerance === null || tolerance < 0) fail('La tolerancia debe ser un número mayor o igual a 0.')
  if (Math.abs(answer) > 1e12 || tolerance > 1e12) fail('El número es demasiado grande.')
  return { items: [], config: { answer, tolerance } }
}

function orderingOptions(raw, existing, makeId, config) {
  const list = listOf(raw, { min: 2, label: 'elementos para ordenar' })
  const ids = assignIds(list, existing.items, makeId)
  const items = list.map((item, index) => ({ id: ids[index], text: itemText(item?.text, 'elemento', 500) }))
  return { items, config: { partialCredit: flag(config, 'partialCredit') } }
}

function matchingOptions(raw, existing, makeId, config) {
  const list = listOf(raw, { min: 2, label: 'parejas' })
  const used = new Set()
  const ids = assignIds(list, existing.items, makeId, used)
  const previousMatch = new Map((existing.items ?? []).map((item) => [item?.id, item?.matchId]))
  const rights = new Set()
  const items = list.map((item, index) => {
    const text = itemText(item?.text, 'elemento de la izquierda', 500)
    const match = itemText(item?.match, 'elemento de la derecha', 500)
    const key = normalizeText(match)
    if (rights.has(key)) fail('Cada elemento de la derecha debe ser distinto.')
    rights.add(key)
    let matchId = previousMatch.get(ids[index])
    while (!matchId || used.has(matchId)) matchId = makeId()
    used.add(matchId)
    return { id: ids[index], text, match, matchId }
  })
  return { items, config: { partialCredit: flag(config, 'partialCredit') } }
}

function fillBlankOptions(prompt, config) {
  const blanks = parseBlanks(prompt)
  if (!blanks.length) fail('Marca al menos un espacio en blanco con [[respuesta]].')
  if (blanks.length > MAX_BLANKS) fail(`Una pregunta admite como máximo ${MAX_BLANKS} espacios en blanco.`)
  if (blanks.some((answers) => !answers.length)) fail('Cada espacio en blanco necesita al menos una respuesta, por ejemplo [[Madrid]].')
  if (blanks.some((answers) => answers.some((answer) => answer.length > 200))) fail('Una respuesta de un espacio en blanco es demasiado larga.')
  return { items: [], config: { allOrNothing: flag(config, 'allOrNothing'), exactMatch: flag(config, 'exactMatch') } }
}

// Storage value of `options` for a kind. `existing` is the stored value (any shape).
export function normalizeOptionsFor(kind, { options, config, prompt, existing, makeId }) {
  const prev = readOptions(existing)
  const cfg = isObject(config) ? config : {}
  switch (kind) {
    case 'open': return []
    case 'true_false': return trueFalseOptions(options)
    case 'single':
    case 'multiple': return choiceOptions(kind, options, prev, makeId, cfg)
    case 'short': return shortOptions(options, prev, makeId, cfg)
    case 'numeric': return numericOptions(cfg)
    case 'ordering': return orderingOptions(options, prev, makeId, cfg)
    case 'matching': return matchingOptions(options, prev, makeId, cfg)
    case 'fill_blank': return fillBlankOptions(prompt, cfg)
    default: return fail('Tipo de pregunta inválido.')
  }
}
