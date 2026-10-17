// Pure rules for public course share links and external guests (runly.lms phase 6).
// No I/O: tokens, hashing, payload normalizers and the shared-lesson filter.
import crypto from 'node:crypto'
import { LmsError } from './lms-error.js'

export const SHARE_SCOPES = ['all', 'preview']
export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{24}$/
const GUEST_TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// 18 random bytes -> 24 url-safe characters.
export const newShareToken = () => crypto.randomBytes(18).toString('base64url')
// 32 random bytes -> 43 url-safe characters. Only its hash is stored.
export const newGuestToken = () => crypto.randomBytes(32).toString('base64url')
export const hashGuestToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex')

export const sharePath = (token) => `/app/p/lms/curso/${token}`

// `Authorization: Guest <token>` -> token, or null when absent or malformed.
export function parseGuestAuthorization(header) {
  const match = /^Guest\s+(\S+)$/i.exec(String(header ?? '').trim())
  return match && GUEST_TOKEN_RE.test(match[1]) ? match[1] : null
}

export function normalizeShareSettings(raw) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return { scope: value.scope === 'preview' ? 'preview' : 'all', allowQuizzes: value.allowQuizzes === true, issueCertificates: value.issueCertificates === true }
}

// PUT /lms/courses/:id/share body. Missing keys keep the current settings.
export function normalizeShareInput(body = {}, current = {}) {
  const base = normalizeShareSettings(current)
  if (body.scope !== undefined && !SHARE_SCOPES.includes(body.scope)) throw new LmsError('Alcance inválido.', 400)
  return {
    enabled: body.enabled === undefined ? null : body.enabled === true,
    settings: {
      scope: body.scope ?? base.scope,
      allowQuizzes: body.allowQuizzes === undefined ? base.allowQuizzes : body.allowQuizzes === true,
      issueCertificates: body.issueCertificates === undefined ? base.issueCertificates : body.issueCertificates === true,
    },
  }
}

// POST /join body: name 2-80 characters, optional email.
export function normalizeJoinInput(body = {}) {
  const name = String(body?.name ?? '').replace(/\s+/g, ' ').trim()
  if (name.length < 2) throw new LmsError('Escribe tu nombre (al menos 2 caracteres).', 400)
  if (name.length > 80) throw new LmsError('El nombre no puede pasar de 80 caracteres.', 400)
  const rawEmail = String(body?.email ?? '').trim().toLowerCase()
  if (rawEmail && (rawEmail.length > 200 || !EMAIL_RE.test(rawEmail))) throw new LmsError('El correo no es válido.', 400)
  return { name, email: rawEmail || null }
}

// Copies each section's free flag onto its lessons as sectionFree (in place).
export function markSectionFree(sections) {
  for (const section of sections ?? []) for (const lesson of section.lessons ?? []) lesson.sectionFree = section.free === true
  return sections
}

const isPreviewMarked = (lesson) => lesson.preview === true || lesson.sectionFree === true

// Free preview for internal users who are not enrolled: lessons in a free section
// or marked as preview. Quizzes and assignments always need an enrollment.
export function isOpenPreview(lesson) {
  if (!lesson || lesson.enabled === false) return false
  if (lesson.kind === 'assignment' || lesson.kind === 'quiz') return false
  return isPreviewMarked(lesson)
}

// Lessons a guest may open: never assignments, quizzes only when allowed and,
// with scope `preview`, only preview lessons and lessons in free sections.
export function isSharedLesson(lesson, settings) {
  if (!lesson || lesson.enabled === false) return false
  if (lesson.kind === 'assignment') return false
  if (lesson.kind === 'quiz' && !settings.allowQuizzes) return false
  return settings.scope === 'all' || isPreviewMarked(lesson)
}

// sections (with ordered lessons) -> same shape keeping only shared lessons and
// the sections that still have any.
export function filterSharedSections(sections, settings) {
  return markSectionFree(sections ?? [])
    .map((section) => ({ ...section, lessons: (section.lessons ?? []).filter((lesson) => isSharedLesson(lesson, settings)) }))
    .filter((section) => section.lessons.length)
}

export function learnerKind(learner) {
  if (!learner) return null
  if (learner.userProfileId) return 'user'
  if (learner.contactId) return 'contact'
  return learner.guestTokenHash ? 'guest' : 'user'
}

// Enrollment fields a guest sees (no internal ids).
export function guestEnrollment(row) {
  if (!row) return null
  const iso = (value) => (value ? new Date(value).toISOString() : null)
  return { status: row.status, progressPct: row.progressPct ?? 0, startedAt: iso(row.startedAt), completedAt: iso(row.completedAt) }
}
