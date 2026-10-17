import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLmsRouter } from '../lms-routes.js'
import { LmsError } from '../lms-core.js'

function requirePermission(key) {
  return async (c, next) => {
    const permissions = new Set((c.req.header('x-permissions') ?? '').split(',').filter(Boolean))
    if (!permissions.has(key)) return c.json({ error: 'forbidden', key }, 403)
    c.set('companyId', 'company-1')
    c.set('userContext', { profile: { id: 'profile-1' }, isAdmin: false, permissionSet: permissions })
    await next()
  }
}

function build() {
  const calls = []
  const record = (name, result) => async (...args) => { calls.push([name, ...args]); return typeof result === 'function' ? result(...args) : result }
  const socialService = {
    listComments: record('listComments', []),
    createComment: record('createComment', { id: 'c1' }),
    updateComment: record('updateComment', { id: 'c1' }),
    deleteComment: async () => { throw new LmsError('No tienes permiso para eliminar este comentario.', 403) },
    getReviews: record('getReviews', { ratingAvg: null, ratingCount: 0 }),
    saveMyReview: async () => { throw new LmsError('Avanza al menos 30 % del curso para calificarlo.', 409, 'NOT_ELIGIBLE') },
    moderateReview: record('moderateReview', { id: 'r1' }),
    listAnnouncements: record('listAnnouncements', []),
    createAnnouncement: record('createAnnouncement', { id: 'a1' }),
    updateAnnouncement: record('updateAnnouncement', { id: 'a1' }),
    deleteAnnouncement: record('deleteAnnouncement', { id: 'a1' }),
  }
  const app = createLmsRouter({ requirePermission, service: {}, learnService: {}, media: {}, evalServices: { quiz: {}, review: {}, assignment: {} }, socialService })
  return { app, calls }
}

const req = (app, path, permissions, init = {}) => app.request(`http://localhost${path}`, { ...init, headers: { 'x-permissions': permissions.join(','), 'content-type': 'application/json' } })

test('discussion passes staff flags: grader is staff, not manager', async () => {
  const { app, calls } = build()
  assert.equal((await req(app, '/lms/lessons/l1/comments', [])).status, 403)
  await req(app, '/lms/lessons/l1/comments', ['lms.access', 'lms.grade'])
  assert.deepEqual(calls.at(-1), ['listComments', 'company-1', 'profile-1', 'l1', { canManage: false, isStaff: true }])
  const res = await req(app, '/lms/lessons/l1/comments', ['lms.access'], { method: 'POST', body: JSON.stringify({ body: 'hola', parentId: 'p1' }) })
  assert.equal(res.status, 201)
  assert.deepEqual(calls.at(-1).slice(4), [{ body: 'hola', parentId: 'p1' }, { canManage: false, isStaff: false }])
  await req(app, '/lms/comments/c1', ['lms.access', 'lms.course.manage'], { method: 'PATCH', body: JSON.stringify({ pinned: true }) })
  assert.deepEqual(calls.at(-1).at(-1), { canManage: true, isStaff: true })
})

test('service errors map to status and code', async () => {
  const { app } = build()
  const del = await req(app, '/lms/comments/c1', ['lms.access'], { method: 'DELETE' })
  assert.equal(del.status, 403)
  const review = await req(app, '/lms/courses/k1/reviews/mine', ['lms.access'], { method: 'PUT', body: JSON.stringify({ rating: 5 }) })
  assert.equal(review.status, 409)
  assert.deepEqual(await review.json(), { error: 'Avanza al menos 30 % del curso para calificarlo.', code: 'NOT_ELIGIBLE' })
})

test('moderation and announcement writes require lms.course.manage', async () => {
  const { app, calls } = build()
  assert.equal((await req(app, '/lms/reviews/r1', ['lms.access', 'lms.grade'], { method: 'PATCH', body: '{}' })).status, 403)
  assert.equal((await req(app, '/lms/reviews/r1', ['lms.course.manage'], { method: 'PATCH', body: JSON.stringify({ hidden: true }) })).status, 200)
  assert.equal((await req(app, '/lms/courses/k1/announcements', ['lms.access'], { method: 'POST', body: '{}' })).status, 403)
  const created = await req(app, '/lms/courses/k1/announcements', ['lms.course.manage'], { method: 'POST', body: JSON.stringify({ title: 'T', body: 'B' }) })
  assert.equal(created.status, 201)
  assert.equal((await req(app, '/lms/announcements/a1', ['lms.access'], { method: 'DELETE' })).status, 403)
  assert.equal((await req(app, '/lms/announcements/a1', ['lms.course.manage'], { method: 'DELETE' })).status, 200)
  await req(app, '/lms/courses/k1/announcements', ['lms.access'])
  assert.deepEqual(calls.at(-1), ['listAnnouncements', 'company-1', 'profile-1', 'k1', { canManage: false, isStaff: false }])
  await req(app, '/lms/courses/k1/reviews', ['lms.access'])
  assert.equal(calls.at(-1)[0], 'getReviews')
})
