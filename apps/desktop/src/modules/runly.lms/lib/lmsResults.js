// Pure helpers for evaluation results and the candidate record (spec
// 2026-11-21 phase 5). No React.

export const RESULT_STATUS = {
  not_started: { label: 'Sin iniciar', variant: 'outline' },
  in_progress: { label: 'En curso', variant: 'warning' },
  submitted: { label: 'Por revisar', variant: 'secondary' },
  expired: { label: 'Por revisar', variant: 'secondary' },
  graded: { label: 'Calificada', variant: 'success' },
  voided: { label: 'Anulada', variant: 'outline' },
}

export const RESULT_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'review', label: 'Por revisar' },
  { value: 'graded', label: 'Calificadas' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'not_started', label: 'Sin iniciar' },
  { value: 'voided', label: 'Anuladas' },
]

export function filterRows(rows, filter) {
  if (filter === 'all') return rows
  if (filter === 'review') return rows.filter((row) => row.pendingCount > 0 || ['submitted', 'expired'].includes(row.status))
  return rows.filter((row) => row.status === filter)
}

// Hiring decision: a person's call, shown apart from the score.
export const DECISION_OPTIONS = [
  { value: 'pending', label: 'Sin decisión' },
  { value: 'advance', label: 'Avanza' },
  { value: 'hold', label: 'En espera' },
  { value: 'reject', label: 'No avanza' },
]
export const DECISION_VARIANTS = { pending: 'outline', advance: 'success', hold: 'warning', reject: 'destructive' }
export const decisionLabel = (value) => DECISION_OPTIONS.find((item) => item.value === (value ?? 'pending'))?.label ?? 'Sin decisión'

const trim2 = (n) => String(Math.round(Number(n) * 100) / 100)
export const scoreText = (score, max) => (score === null || score === undefined ? `— / ${trim2(max ?? 0)}` : `${trim2(score)} / ${trim2(max ?? 0)}`)
export const percent = (score, max) => (score === null || score === undefined || !max ? null : Math.round((Number(score) / Number(max)) * 1000) / 10)

export const HISTORY_LABELS = {
  grade: 'Calificó', grade_partial: 'Guardó avance de revisión', regrade: 'Recalificó', comment: 'Comentó',
  decision: 'Registró la decisión', extend: 'Extendió el tiempo', void: 'Anuló la sesión', extra_session: 'Autorizó un intento adicional', reviewers: 'Cambió los evaluadores',
}

// Short "before -> after" of a history entry.
export function historyChange(event) {
  const before = event.before ?? {}, after = event.after ?? {}
  if (event.action === 'decision') return `${decisionLabel(before.decision)} → ${decisionLabel(after.decision)}`
  if (event.action === 'extend') return `+${(after.extendedMinutes ?? 0) - (before.extendedMinutes ?? 0)} min`
  if (event.action === 'extra_session') return `${before.extraSessions ?? 0} → ${after.extraSessions ?? 0} intentos adicionales`
  if (event.action === 'void') return 'Anulada'
  if ('points' in after || 'points' in before) return `${before.points ?? '—'} → ${after.points ?? '—'} pts`
  // Quiz review: the manual points given so far (the activity total may still be pending).
  if (after.manualPoints) {
    const sum = (map) => Math.round(Object.values(map ?? {}).reduce((acc, value) => acc + (Number(value) || 0), 0) * 100) / 100
    return `Respuestas abiertas: ${sum(before.manualPoints)} → ${sum(after.manualPoints)} pts`
  }
  if ('scorePoints' in after || 'scorePoints' in before) return `${before.scorePoints ?? '—'} → ${after.scorePoints ?? '—'} pts`
  return ''
}

const blank = (value) => value === null || value === undefined || String(value).trim() === ''

// Open-question draft from the record (strings for the inputs).
export function quizDraft(attempt) {
  const points = {}, comments = {}
  for (const question of attempt?.questions ?? []) {
    if (question.kind !== 'open') continue
    const stored = attempt.manualPoints?.[question.id]
    points[question.id] = stored === null || stored === undefined ? '' : String(stored)
    comments[question.id] = attempt.questionFeedback?.[question.id] ?? ''
  }
  return { points, comments, feedback: attempt?.feedback ?? '' }
}

// { body, errors, changed, regrade } to send for a quiz draft.
export function quizPayload(attempt, draft) {
  const errors = {}, points = {}, comments = {}
  let pointsChanged = false
  for (const question of attempt?.questions ?? []) {
    if (question.kind !== 'open') continue
    const raw = draft.points[question.id]
    const stored = attempt.manualPoints?.[question.id]
    if (!blank(raw)) {
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0 || n > question.points) errors[question.id] = `De 0 a ${question.points}.`
      else if (n !== stored) { points[question.id] = n; pointsChanged = true }
    } else if (stored !== undefined && stored !== null) { points[question.id] = ''; pointsChanged = true }
    if ((draft.comments[question.id] ?? '') !== (attempt.questionFeedback?.[question.id] ?? '')) comments[question.id] = draft.comments[question.id]
  }
  const feedbackChanged = (draft.feedback ?? '') !== (attempt?.feedback ?? '')
  return {
    errors,
    changed: pointsChanged || Object.keys(comments).length > 0 || feedbackChanged,
    regrade: pointsChanged && attempt?.status === 'graded',
    body: { points, comments, ...(feedbackChanged ? { feedback: draft.feedback } : {}) },
  }
}

export function deliveryDraft(activity) {
  const sub = activity?.submission ?? {}
  const rubricScores = {}
  for (const criterion of activity?.rubric ?? []) rubricScores[criterion.id] = blank(sub.rubricScores?.[criterion.id]) ? '' : String(sub.rubricScores[criterion.id])
  return { points: blank(sub.points) ? '' : String(sub.points), rubricScores, feedback: sub.feedback ?? '' }
}

export function deliveryPayload(activity, draft) {
  const sub = activity?.submission ?? {}
  const errors = {}
  const rubric = activity?.rubric ?? []
  let body
  if (rubric.length) {
    const scores = {}
    for (const criterion of rubric) {
      const raw = draft.rubricScores[criterion.id]
      if (blank(raw)) continue
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0 || n > criterion.points) errors[criterion.id] = `De 0 a ${criterion.points}.`
      else scores[criterion.id] = n
    }
    body = { rubricScores: scores }
  } else {
    const n = blank(draft.points) ? null : Number(draft.points)
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > activity.maxPoints)) errors.points = `De 0 a ${activity.maxPoints}.`
    body = { points: n }
  }
  // Per criterion: the stored JSON may come back with its keys in another order.
  const stored = sub.rubricScores ?? {}
  const pointsChanged = rubric.length
    ? rubric.some((criterion) => (body.rubricScores[criterion.id] ?? null) !== (blank(stored[criterion.id]) ? null : Number(stored[criterion.id])))
    : body.points !== (sub.points ?? null)
  const feedbackChanged = (draft.feedback ?? '') !== (sub.feedback ?? '')
  return {
    errors,
    changed: pointsChanged || feedbackChanged,
    regrade: pointsChanged && sub.points !== null && sub.points !== undefined,
    body: { ...body, ...(feedbackChanged ? { feedback: draft.feedback } : {}) },
  }
}

// Live total of a rubric draft (null while a criterion is empty).
export function rubricTotal(rubric, scores) {
  if (!rubric?.length) return null
  let sum = 0
  for (const criterion of rubric) {
    const raw = scores?.[criterion.id]
    if (blank(raw) || !Number.isFinite(Number(raw))) return null
    sum += Number(raw)
  }
  return Math.round(sum * 100) / 100
}
