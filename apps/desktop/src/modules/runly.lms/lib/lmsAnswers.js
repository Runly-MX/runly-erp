// Learner answers per question kind: display order, navigator state and the
// result of a revealed question. Pure helpers (unit tested).
import { isAnswered } from './lmsEval.js'

// Ordering: the learner's order, or the order the attempt showed.
export function orderedIds(question, answer) {
  const shown = (question.options ?? []).map((option) => option.id)
  const given = Array.isArray(answer?.order) ? answer.order.filter((id) => shown.includes(id)) : []
  return given.length ? [...given, ...shown.filter((id) => !given.includes(id))] : shown
}

// Navigator cell: flagged wins over answered/unanswered.
export function navState(question, answer, flagged) {
  if (flagged) return 'flagged'
  return isAnswered(question, answer) ? 'answered' : 'unanswered'
}

export function toggleFlag(flags, id) {
  const next = new Set(flags)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

// Percentage of answered questions (0-100).
export function answeredPct(questions, answers) {
  const list = questions ?? []
  if (!list.length) return 0
  return Math.round((list.filter((q) => isAnswered(q, answers?.[q.id])).length / list.length) * 100)
}

// correct | partial | wrong | pending | null (not revealed).
export function resultStatus(question) {
  const awarded = question.awardedPoints
  if (awarded === undefined && typeof question.correct !== 'boolean') return null
  if (question.correct === true) return 'correct'
  if (question.kind === 'open' && (awarded === null || awarded === undefined)) return 'pending'
  if (typeof awarded === 'number' && awarded > 0) return 'partial'
  if (question.correct === false) return 'wrong'
  return null
}

const byId = (list) => new Map((list ?? []).map((item) => [item.id, item]))
const num = (value) => (value === null || value === undefined || value === '' ? null : Number(value))

// Rows to show the learner's answer next to the correct one, for list kinds.
// ordering -> [{ text, ok, correctText }]; matching -> [{ left, given, ok, correct }].
export function orderingRows(question, answer) {
  const items = byId(question.options)
  const correct = question.correctOrder ?? null
  return orderedIds(question, answer).map((id, index) => ({
    id,
    text: items.get(id)?.text ?? '—',
    ok: correct ? correct[index] === id : null,
    correctText: correct ? items.get(correct[index])?.text ?? '—' : null,
  }))
}

export function matchingRows(question, answer) {
  const choices = byId(question.choices)
  const pairs = answer?.pairs ?? {}
  return (question.options ?? []).map((left) => {
    const given = pairs[left.id] ?? null
    const correctId = question.correctPairs?.[left.id] ?? null
    return {
      id: left.id,
      left: left.text,
      given: given ? choices.get(given)?.text ?? '—' : null,
      ok: question.correctPairs ? given === correctId : null,
      correct: correctId ? choices.get(correctId)?.text ?? '—' : null,
    }
  })
}

const normalize = (value) => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ')

// fill_blank -> [{ given, ok, accepted: [] }], one per blank.
export function blankRows(question, answer) {
  const count = Math.max(0, (question.parts?.length ?? 1) - 1)
  const given = Array.isArray(answer?.blanks) ? answer.blanks : []
  return Array.from({ length: count }, (_, i) => {
    const accepted = question.blankAnswers?.[i] ?? null
    const same = (a) => (question.exactMatch ? String(a).trim() === String(given[i] ?? '').trim() : normalize(a) === normalize(given[i]))
    return { given: given[i] ?? '', accepted, ok: accepted ? accepted.some((a) => same(a) && String(a).trim() !== '') : null }
  })
}

// Revealed numeric answer: "10 (± 0.5)".
export function numericAnswerText(question) {
  const answer = num(question.answer)
  if (answer === null) return null
  const tolerance = num(question.tolerance) ?? 0
  return tolerance ? `${answer} (± ${tolerance})` : String(answer)
}
