// Pure helpers for the grading surfaces (review queue, submission and attempt
// sheets): file preview kinds, Office eligibility, pass indicator, attempt
// score summary and the URL param that keeps a sheet open across navigation.
import { fileKindOf, getOfficeFormat } from '@runly/core/browser'

// Submission files serialize as { id, name, mimeType, sizeBytes, url }.
const probe = (file) => ({ originalName: file?.name ?? file?.originalName ?? '', mimeType: file?.mimeType ?? '' })

// 'image' renders inline; 'pdf' | 'video' | 'audio' open in the file viewer.
export function previewKind(file) {
  const kind = fileKindOf(probe(file))
  return ['image', 'pdf', 'video', 'audio'].includes(kind) ? kind : null
}

// Formats the Office (WOPI) backend accepts; the server re-checks on open.
export const canOpenInOffice = (file) => Boolean(file?.id && getOfficeFormat(probe(file)))

const blank = (value) => value === null || value === undefined || String(value).trim() === ''

// 'pass' | 'fail' for a 0-100 grade against the lesson's passing score; null
// when there is no passing score or the grade is blank/invalid.
export function passState(grade, passingScore) {
  if (passingScore === null || passingScore === undefined || blank(grade)) return null
  const value = Number(grade)
  if (!Number.isFinite(value) || value < 0 || value > 100) return null
  return value >= Number(passingScore) ? 'pass' : 'fail'
}

const round2 = (n) => Math.round(n * 100) / 100

// Live score of an attempt while grading: auto points come from the scored
// questions, manual ones from the draft (blank or invalid count as 0 and as
// pending). pct is null when the attempt has no points.
export function attemptScoreSummary(questions, draft = {}) {
  let auto = 0, manual = 0, max = 0, pending = 0
  for (const question of questions ?? []) {
    const points = Number(question.points) || 0
    max += points
    if (question.kind !== 'open') { auto += Number(question.awardedPoints) || 0; continue }
    const raw = draft?.[question.id]
    const value = Number(raw)
    if (blank(raw) || !Number.isFinite(value) || value < 0 || value > points) pending += 1
    else manual += value
  }
  const total = round2(auto + manual)
  return { auto: round2(auto), manual: round2(manual), max: round2(max), total, pending, pct: max > 0 ? round2((total / max) * 100) : null }
}

// ?revisar=submission:<id> | attempt:<id>
const REVIEW_TYPES = new Set(['submission', 'attempt'])
export function parseReviewParam(value) {
  const [type, id] = String(value ?? '').split(':')
  return REVIEW_TYPES.has(type) && id ? { type, id } : null
}
export const reviewParam = (open) => (open && REVIEW_TYPES.has(open.type) && open.id ? `${open.type}:${open.id}` : null)

export const filesCountText = (count) => `${count} ${count === 1 ? 'archivo' : 'archivos'}`
