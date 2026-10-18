// Quiz question authoring: question <-> form values, kind switches, validation
// and the learner-shaped preview. Pure helpers (unit tested).

export const QUESTION_KINDS = ['single', 'multiple', 'true_false', 'short', 'numeric', 'fill_blank', 'ordering', 'matching', 'open']
export const CHOICE_KINDS = ['single', 'multiple']
export const MAX_ITEMS = 20
export const POINTS = { min: 1, max: 100 }
// [[answer|alternative]] blanks. The Markdown editor escapes brackets (and
// sometimes pipes) when it saves, so `\[\[Madrid\]\]` counts as a blank too.
const BLANK_RE = /\\?\[\\?\[((?:\\.|[^\]\\])*)\\?\]\\?\]/g
const unescapeMd = (text) => text.replace(/\\(.)/g, '$1')

const blank = (value) => String(value ?? '').trim() === ''
const asText = (value) => (value === null || value === undefined ? '' : String(value))
let seq = 0
// Stable React/dnd key for a row (never sent to the API).
export const rowKey = () => `r${(seq += 1)}`

const choice = (text = '', correct = false, id) => ({ key: rowKey(), ...(id ? { id } : {}), text, correct })
const textRow = (text = '', id) => ({ key: rowKey(), ...(id ? { id } : {}), text })
const pairRow = (text = '', match = '', id) => ({ key: rowKey(), ...(id ? { id } : {}), text, match })

export function emptyQuestionForm(kind = 'single') {
  return {
    kind, prompt: '', points: '1', explanation: '',
    options: [choice(), choice()],
    trueFalse: 'true',
    accepted: [textRow()],
    items: [textRow(), textRow(), textRow()],
    pairs: [pairRow(), pairRow(), pairRow()],
    numericAnswer: '', tolerance: '',
    partialCredit: false, exactMatch: false, allOrNothing: false,
  }
}

// API question ({ kind, prompt, options, config, points, explanation }) -> form.
export function questionToForm(question) {
  if (!question) return emptyQuestionForm()
  const form = emptyQuestionForm(question.kind)
  const items = Array.isArray(question.options) ? question.options : []
  const config = question.config ?? {}
  Object.assign(form, {
    prompt: question.prompt ?? '',
    points: asText(question.points ?? 1),
    explanation: question.explanation ?? '',
    partialCredit: config.partialCredit === true,
    exactMatch: config.exactMatch === true,
    allOrNothing: config.allOrNothing === true,
  })
  if (CHOICE_KINDS.includes(question.kind)) form.options = items.map((o) => choice(o.text ?? '', Boolean(o.correct), o.id))
  if (question.kind === 'true_false') form.trueFalse = items.find((o) => o.id === 'true')?.correct === false ? 'false' : 'true'
  if (question.kind === 'short') form.accepted = items.map((o) => textRow(o.text ?? '', o.id))
  if (question.kind === 'ordering') form.items = items.map((o) => textRow(o.text ?? '', o.id))
  if (question.kind === 'matching') form.pairs = items.map((o) => pairRow(o.text ?? '', o.match ?? '', o.id))
  if (question.kind === 'numeric') Object.assign(form, { numericAnswer: asText(config.answer), tolerance: config.tolerance ? asText(config.tolerance) : '' })
  return form
}

// Kind switch: choice kinds keep their rows (single keeps one correct answer);
// every other kind keeps its own rows, so switching back loses nothing.
export function changeQuestionKind(form, kind) {
  if (kind === 'single') {
    let seen = false
    const options = form.options.map((option) => {
      const correct = option.correct && !seen
      if (option.correct) seen = true
      return { ...option, correct }
    })
    return { ...form, kind, options }
  }
  return { ...form, kind }
}

// "Correcta" marker: exclusive for single (radio), independent for multiple.
export function setOptionCorrect(form, index, checked) {
  return {
    ...form,
    options: form.options.map((option, i) => {
      if (i === index) return { ...option, correct: form.kind === 'single' ? true : checked }
      return form.kind === 'single' && checked ? { ...option, correct: false } : option
    }),
  }
}

// Row list helpers for options / accepted / items / pairs.
export const ROW_FACTORY = { options: () => choice(), accepted: () => textRow(), items: () => textRow(), pairs: () => pairRow() }
export function insertRow(form, field, afterIndex) {
  const rows = form[field]
  if (rows.length >= MAX_ITEMS) return form
  const next = [...rows]
  next.splice(afterIndex + 1, 0, ROW_FACTORY[field]())
  return { ...form, [field]: next }
}
export const updateRow = (form, field, index, patch) => ({ ...form, [field]: form[field].map((row, i) => (i === index ? { ...row, ...patch } : row)) })
export const removeRow = (form, field, index) => ({ ...form, [field]: form[field].filter((_, i) => i !== index) })
export const reorderRows = (form, field, rows) => ({ ...form, [field]: rows })

// "3,5" -> 3.5; null when it is not a number.
export function parseNumber(value) {
  let text = String(value ?? '').trim().replace(/\s+/g, '')
  if (!text) return null
  if (/^[-+]?\d+,\d+$/.test(text)) text = text.replace(',', '.')
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

export function parseBlanks(prompt) {
  return [...String(prompt ?? '').matchAll(BLANK_RE)].map((m) => unescapeMd(m[1]).split('|').map((a) => a.trim()).filter(Boolean))
}
export const blankParts = (prompt) => String(prompt ?? '').split(BLANK_RE).filter((_, index) => index % 2 === 0).map(unescapeMd)

const normalize = (value) => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ')

function rowsError(rows, { min, empty, few }) {
  if (rows.length < min) return few
  if (rows.some((row) => blank(row.text))) return empty
  return null
}

export function validateQuestionForm(form) {
  const errors = {}
  if (blank(form.prompt)) errors.prompt = 'Escribe la pregunta.'
  const points = Number(form.points)
  if (blank(form.points) || !Number.isInteger(points) || points < POINTS.min || points > POINTS.max) errors.points = 'Escribe un número entero de 1 a 100.'
  const set = (key, message) => { if (message) errors[key] = message }
  if (CHOICE_KINDS.includes(form.kind)) {
    const correct = form.options.filter((option) => option.correct).length
    set('options', rowsError(form.options, { min: 2, few: 'Agrega al menos dos opciones.', empty: 'Completa o elimina las opciones vacías.' })
      ?? (form.kind === 'single' && correct !== 1 ? 'Marca la opción correcta.' : null)
      ?? (form.kind === 'multiple' && correct < 1 ? 'Marca al menos una opción correcta.' : null))
  }
  if (form.kind === 'short') set('accepted', rowsError(form.accepted, { min: 1, few: 'Agrega al menos una respuesta aceptada.', empty: 'Completa o elimina las respuestas vacías.' }))
  if (form.kind === 'ordering') set('items', rowsError(form.items, { min: 2, few: 'Agrega al menos dos elementos.', empty: 'Completa o elimina los elementos vacíos.' }))
  if (form.kind === 'matching') {
    const rights = form.pairs.map((pair) => normalize(pair.match))
    set('pairs', form.pairs.length < 2 ? 'Agrega al menos dos parejas.'
      : form.pairs.some((pair) => blank(pair.text) || blank(pair.match)) ? 'Completa los dos lados de cada pareja.'
        : new Set(rights).size !== rights.length ? 'Cada elemento de la derecha debe ser distinto.' : null)
  }
  if (form.kind === 'numeric') {
    if (parseNumber(form.numericAnswer) === null) errors.numericAnswer = 'Escribe la respuesta correcta como número.'
    const tolerance = parseNumber(form.tolerance)
    if (!blank(form.tolerance) && (tolerance === null || tolerance < 0)) errors.tolerance = 'Escribe un número mayor o igual a 0.'
  }
  if (form.kind === 'fill_blank' && !errors.prompt) {
    const blanks = parseBlanks(form.prompt)
    if (!blanks.length) errors.prompt = 'Marca al menos un espacio en blanco con [[respuesta]].'
    else if (blanks.some((answers) => !answers.length)) errors.prompt = 'Cada espacio en blanco necesita su respuesta, por ejemplo [[Madrid]].'
  }
  return errors
}

const withId = (row, extra) => ({ ...(row.id ? { id: row.id } : {}), ...extra })

// Form -> POST/PATCH body ({ kind, prompt, options, config, points, explanation }).
export function formToQuestion(form) {
  let options = []
  let config = {}
  const kind = form.kind
  if (CHOICE_KINDS.includes(kind)) options = form.options.map((row) => withId(row, { text: row.text.trim(), correct: Boolean(row.correct) }))
  if (kind === 'multiple') config = { partialCredit: Boolean(form.partialCredit) }
  if (kind === 'true_false') options = [{ text: 'Verdadero', correct: form.trueFalse === 'true' }, { text: 'Falso', correct: form.trueFalse === 'false' }]
  if (kind === 'short') { options = form.accepted.map((row) => withId(row, { text: row.text.trim() })); config = { exactMatch: Boolean(form.exactMatch) } }
  if (kind === 'ordering') { options = form.items.map((row) => withId(row, { text: row.text.trim() })); config = { partialCredit: Boolean(form.partialCredit) } }
  if (kind === 'matching') { options = form.pairs.map((row) => withId(row, { text: row.text.trim(), match: row.match.trim() })); config = { partialCredit: Boolean(form.partialCredit) } }
  if (kind === 'numeric') config = { answer: parseNumber(form.numericAnswer), tolerance: parseNumber(form.tolerance) ?? 0 }
  if (kind === 'fill_blank') config = { allOrNothing: Boolean(form.allOrNothing), exactMatch: Boolean(form.exactMatch) }
  const points = Math.min(POINTS.max, Math.max(POINTS.min, Math.round(Number(form.points)) || 1))
  return { kind, prompt: form.prompt.trim(), options, config, points, explanation: form.explanation.trim() || null }
}

// The question as a learner would receive it, for the editor's "Vista del alumno".
export function formToPreview(form) {
  const base = { id: 'preview', kind: form.kind, prompt: form.prompt || '*Escribe la pregunta para verla aquí.*', points: Number(form.points) || 1, options: [] }
  const partial = form.kind === 'fill_blank' ? !form.allOrNothing : Boolean(form.partialCredit) && ['multiple', 'ordering', 'matching'].includes(form.kind)
  if (partial) base.partialCredit = true
  if (CHOICE_KINDS.includes(form.kind)) base.options = form.options.map((row, i) => ({ id: row.key, text: row.text || `Opción ${i + 1}` }))
  if (form.kind === 'true_false') base.options = [{ id: 'true', text: 'Verdadero' }, { id: 'false', text: 'Falso' }]
  if (form.kind === 'ordering') base.options = form.items.map((row, i) => ({ id: row.key, text: row.text || `Elemento ${i + 1}` }))
  if (form.kind === 'matching') {
    base.options = form.pairs.map((row, i) => ({ id: row.key, text: row.text || `Elemento ${i + 1}` }))
    base.choices = form.pairs.map((row, i) => ({ id: `${row.key}m`, text: row.match || `Respuesta ${i + 1}` }))
  }
  if (form.kind === 'fill_blank') {
    base.parts = blankParts(form.prompt)
    base.prompt = base.parts.join('____')
  }
  return base
}

// First line of a markdown prompt, without markup and with blanks shown as ____.
export function promptPreview(prompt) {
  const line = String(prompt ?? '').replace(BLANK_RE, '\u0001').split('\n').find((text) => text.trim())
  const clean = line?.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/, '')
    .replace(/[*_`~\\]/g, '').replaceAll('\u0001', '____').trim()
  return clean || 'Sin texto'
}
