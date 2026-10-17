// Pure rules for runly.lms social features: discussion threads, reviews and
// announcements. No I/O.
import { LmsError } from './lms-error.js'

export const COMMENT_MAX = 5000
export const REVIEW_BODY_MAX = 2000
export const REVIEW_MIN_PROGRESS = 30
const ANNOUNCEMENT_BODY_MAX = 20_000

const iso = (value) => (value ? new Date(value).toISOString() : null)
const has = (body, key) => Object.prototype.hasOwnProperty.call(body ?? {}, key)
const time = (value) => new Date(value).getTime()

export function normalizeCommentBody(raw) {
  const text = String(raw ?? '').trim()
  if (!text) throw new LmsError('Escribe un comentario.', 400)
  if (text.length > COMMENT_MAX) throw new LmsError(`El comentario no puede pasar de ${COMMENT_MAX} caracteres.`, 400)
  return text
}

// A reply to a reply is stored under the same root.
export function rootIdFor(parent) {
  if (!parent) return null
  return parent.parentId ?? parent.id
}

// viewer: { learnerId, profileId }
export function isCommentAuthor(row, viewer) {
  if (row.authorLearnerId) return Boolean(viewer?.learnerId) && row.authorLearnerId === viewer.learnerId
  return Boolean(viewer?.profileId) && row.authorProfileId === viewer.profileId
}

// row.author: { kind, id, displayName, avatarUrl } resolved by the service.
// viewer: { learnerId, profileId, canManage, readOnly }
export function commentShape(row, viewer, replies) {
  const deleted = Boolean(row.deletedAt)
  const mine = isCommentAuthor(row, viewer)
  const writable = !deleted && !viewer?.readOnly
  const shape = {
    id: row.id,
    lessonId: row.lessonId,
    parentId: row.parentId ?? null,
    author: row.author,
    isInstructor: row.isInstructor === true,
    body: deleted ? null : row.body,
    resolved: row.resolved === true,
    pinned: row.pinned === true,
    editedAt: iso(row.editedAt),
    deleted,
    createdAt: iso(row.createdAt),
    canEdit: writable && mine,
    canDelete: writable && (mine || viewer?.canManage === true),
  }
  if (replies) shape.replies = replies
  return shape
}

// rows: roots and replies of one lesson. Roots: pinned first, then newest.
// Replies: oldest first; deleted replies vanish, deleted roots stay only with replies.
// viewer.onlyOwn keeps the threads the viewer started (dropped learners).
export function buildThreads(rows, viewer = {}) {
  const repliesByRoot = new Map()
  for (const row of rows) {
    if (!row.parentId || row.deletedAt) continue
    if (!repliesByRoot.has(row.parentId)) repliesByRoot.set(row.parentId, [])
    repliesByRoot.get(row.parentId).push(row)
  }
  return rows
    .filter((row) => !row.parentId)
    .filter((row) => !viewer.onlyOwn || isCommentAuthor(row, viewer))
    .map((root) => {
      const replies = (repliesByRoot.get(root.id) ?? []).sort((a, b) => time(a.createdAt) - time(b.createdAt))
      return { root, replies }
    })
    .filter(({ root, replies }) => !root.deletedAt || replies.length > 0)
    .sort((a, b) => (Number(b.root.pinned === true) - Number(a.root.pinned === true)) || time(b.root.createdAt) - time(a.root.createdAt))
    .map(({ root, replies }) => commentShape(root, viewer, replies.map((reply) => commentShape(reply, viewer))))
}

// ctx: { isRoot, isAuthor, isStaff }. Body: author only. Pin: staff, roots.
// Resolve: staff or the root author, roots.
export function normalizeCommentPatch(body = {}, { isRoot, isAuthor = false, isStaff = false } = {}) {
  const data = {}
  if (has(body, 'body')) {
    if (!isAuthor) throw new LmsError('Solo el autor puede editar el comentario.', 403)
    data.body = normalizeCommentBody(body.body)
  }
  for (const key of ['pinned', 'resolved']) {
    if (!has(body, key)) continue
    if (!isRoot) throw new LmsError('Solo las preguntas se pueden fijar o marcar como resueltas.', 400)
    const allowed = isStaff || (key === 'resolved' && isAuthor)
    if (!allowed) throw new LmsError('No tienes permiso para cambiar esta pregunta.', 403)
    data[key] = body[key] === true
  }
  if (!Object.keys(data).length) throw new LmsError('No hay cambios que guardar.', 400)
  return data
}

export function canReview(enrollment) {
  if (!enrollment || enrollment.status === 'dropped') return false
  return enrollment.status === 'completed' || Number(enrollment.progressPct ?? 0) >= REVIEW_MIN_PROGRESS
}

export function ratingAggregate(rows = []) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let sum = 0
  let count = 0
  for (const row of rows) {
    if (row.hidden) continue
    const rating = Number(row.rating)
    if (!(rating in distribution)) continue
    distribution[rating] += 1
    sum += rating
    count += 1
  }
  return { ratingAvg: count ? Math.round((sum / count) * 100) / 100 : null, ratingCount: count, distribution }
}

function optionalBody(value, max, label) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  if (text.length > max) throw new LmsError(`${label} no puede pasar de ${max} caracteres.`, 400)
  return text || null
}

export function normalizeReviewInput(body = {}) {
  const rating = Number(body.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new LmsError('La calificación debe ser de 1 a 5 estrellas.', 400)
  return { rating, body: optionalBody(body.body, REVIEW_BODY_MAX, 'La reseña') }
}

export function normalizeReviewModeration(body = {}) {
  const data = {}
  if (has(body, 'hidden')) data.hidden = body.hidden === true
  if (has(body, 'replyBody')) data.replyBody = optionalBody(body.replyBody, REVIEW_BODY_MAX, 'La respuesta')
  if (!Object.keys(data).length) throw new LmsError('No hay cambios que guardar.', 400)
  return data
}

export function normalizeAnnouncementInput(body = {}, { partial = false } = {}) {
  const data = {}
  if (!partial || has(body, 'title')) {
    const title = String(body.title ?? '').trim()
    if (!title) throw new LmsError('El título es obligatorio.', 400)
    if (title.length > 200) throw new LmsError('El título no puede pasar de 200 caracteres.', 400)
    data.title = title
  }
  if (!partial || has(body, 'body')) {
    const text = String(body.body ?? '').trim()
    if (!text) throw new LmsError('Escribe el contenido del anuncio.', 400)
    if (text.length > ANNOUNCEMENT_BODY_MAX) throw new LmsError('El anuncio es demasiado largo.', 400)
    data.body = text
  }
  if (!Object.keys(data).length) throw new LmsError('No hay cambios que guardar.', 400)
  return data
}

// Profile id behind a comment author; null for contact-backed learners.
const authorProfileId = (row) => (row.authorLearnerId ? row.authorLearner?.userProfileId ?? null : row.authorProfileId ?? null)

// Root author plus earlier repliers, deduped, skipping deleted comments and the actor.
export function replyRecipients({ root, replies = [], actor }) {
  const ids = []
  for (const row of [root, ...replies]) {
    if (!row || row.deletedAt) continue
    const id = authorProfileId(row)
    if (id && id !== actor && !ids.includes(id)) ids.push(id)
  }
  return ids
}
