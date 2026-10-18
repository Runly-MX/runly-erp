// Pure rules for public course share links and external guests (runly.lms phase 6).
// No I/O: tokens, hashing, payload normalizers and the shared-lesson filter.
import crypto from 'node:crypto'
import { LmsError } from './lms-error.js'
import { DEFAULT_INTAKE_FIELDS, EMAIL_FIELD_KEY, normalizeIntakeAnswers, normalizeIntakeFields, readIntakeFields } from './lms-intake-core.js'

export const SHARE_SCOPES = ['all', 'preview']
// open: anyone with the link joins with the intake form. invite: only emailed
// invitations (email + access code), for long courses.
export const ACCESS_MODES = ['open', 'invite']
export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{24}$/
const GUEST_TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/

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

// Evaluation switches whose default follows the access mode: invited guests see
// the whole course (quizzes and assignments on), open links leave them off.
// A stored boolean always wins over the default.
const EVAL_KEYS = ['allowQuizzes', 'allowAssignments']
const plainObject = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {})

export function normalizeShareSettings(raw) {
  const value = plainObject(raw)
  const accessMode = ACCESS_MODES.includes(value.accessMode) ? value.accessMode : 'open'
  const evalFlag = (key) => (typeof value[key] === 'boolean' ? value[key] : accessMode === 'invite')
  return {
    scope: value.scope === 'preview' ? 'preview' : 'all',
    allowQuizzes: evalFlag('allowQuizzes'),
    allowAssignments: evalFlag('allowAssignments'),
    issueCertificates: value.issueCertificates === true,
    accessMode,
    intakeFields: readIntakeFields(value.intakeFields),
  }
}

// PUT /lms/courses/:id/share body. Missing keys keep the current settings. The
// evaluation switches are stored only once set explicitly, so an unset one keeps
// following the access mode default.
export function normalizeShareInput(body = {}, current = {}) {
  const raw = plainObject(current)
  const base = normalizeShareSettings(raw)
  if (body.scope !== undefined && !SHARE_SCOPES.includes(body.scope)) throw new LmsError('Alcance inválido.', 400)
  if (body.accessMode !== undefined && !ACCESS_MODES.includes(body.accessMode)) throw new LmsError('Modo de acceso inválido.', 400)
  const evalFlags = {}
  for (const key of EVAL_KEYS) {
    if (body[key] !== undefined) evalFlags[key] = body[key] === true
    else if (typeof raw[key] === 'boolean') evalFlags[key] = raw[key]
  }
  return {
    enabled: body.enabled === undefined ? null : body.enabled === true,
    settings: {
      scope: body.scope ?? base.scope,
      ...evalFlags,
      issueCertificates: body.issueCertificates === undefined ? base.issueCertificates : body.issueCertificates === true,
      accessMode: body.accessMode ?? base.accessMode,
      intakeFields: body.intakeFields === undefined ? base.intakeFields : normalizeIntakeFields(body.intakeFields),
    },
  }
}

export function normalizeGuestName(value) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (name.length < 2) throw new LmsError('Escribe tu nombre (al menos 2 caracteres).', 400)
  if (name.length > 80) throw new LmsError('El nombre no puede pasar de 80 caracteres.', 400)
  return name
}

// POST /join body: { name 2-80, answers: { key: value } } validated against the
// course intake fields. The `correo` answer (or a legacy top-level `email`) is
// also the learner email. `fixed` forces answers (the invited email).
export function normalizeJoinInput(body = {}, fields = DEFAULT_INTAKE_FIELDS, fixed = {}) {
  const name = normalizeGuestName(body?.name)
  const answers = { ...(body?.answers && typeof body.answers === 'object' ? body.answers : {}) }
  if (answers[EMAIL_FIELD_KEY] === undefined && body?.email !== undefined) answers[EMAIL_FIELD_KEY] = body.email
  const profile = normalizeIntakeAnswers(fields, answers, fixed)
  return { name, email: profile[EMAIL_FIELD_KEY] ?? fixed[EMAIL_FIELD_KEY] ?? null, profile }
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

// Lessons a guest may open: quizzes and assignments only when allowed and,
// with scope `preview`, only preview lessons and lessons in free sections.
export function isSharedLesson(lesson, settings) {
  if (!lesson || lesson.enabled === false) return false
  if (lesson.kind === 'assignment' && !settings.allowAssignments) return false
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
