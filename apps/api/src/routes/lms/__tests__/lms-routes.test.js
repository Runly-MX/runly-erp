import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLmsRouter } from '../lms-routes.js'
import { LmsError } from '../lms-core.js'
import { createLmsMedia } from '../lms-media.js'

function requirePermission(key) {
  return async (c, next) => {
    const permissions = new Set((c.req.header('x-permissions') ?? '').split(',').filter(Boolean))
    if (!permissions.has(key)) return c.json({ error: 'forbidden', key }, 403)
    c.set('companyId', 'company-1')
    c.set('userContext', { profile: { id: 'profile-1' }, isAdmin: false, permissionSet: permissions })
    await next()
  }
}

function build(overrides = {}) {
  const calls = []
  const learnService = {
    catalog: async (companyId, actor) => { calls.push(['catalog', companyId, actor]); return [] },
    outline: async (companyId, actor, courseId, opts) => { calls.push(['outline', courseId, opts]); return { course: {}, enrollment: null, sections: [] } },
    openLesson: async () => { throw new LmsError('Bloqueada', 409, 'LOCKED') },
    ...overrides.learn,
  }
  const service = { listCourses: async () => [], ...overrides.service }
  const prisma = { fileAsset: { create: async () => { throw new Error('should not create') } } }
  const supabaseAdmin = { storage: { from: () => ({ createSignedUploadUrl: async () => ({ data: { signedUrl: 'u', token: 't' } }) }) } }
  const app = createLmsRouter({ requirePermission, service, learnService, media: createLmsMedia({ prisma, supabaseAdmin, bucket: 'runly-files' }) })
  return { app, calls }
}

const req = (app, path, permissions, init = {}) => app.request(`http://localhost${path}`, { ...init, headers: { 'x-permissions': permissions.join(','), 'content-type': 'application/json', ...(init.headers ?? {}) } })

test('learner route works with lms.access', async () => {
  const { app, calls } = build()
  const res = await req(app, '/lms/catalog', ['lms.access'])
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { data: [] })
  assert.deepEqual(calls[0], ['catalog', 'company-1', 'profile-1'])
})

test('outline passes canManage from lms.course.manage', async () => {
  const { app, calls } = build()
  await req(app, '/lms/learn/course-1', ['lms.access'])
  await req(app, '/lms/learn/course-1', ['lms.access', 'lms.course.manage'])
  await req(app, '/lms/learn/course-1?preview=1', ['lms.access', 'lms.course.manage'])
  assert.deepEqual(calls.map((c) => c[2]), [{ canManage: false, preview: false }, { canManage: true, preview: false }, { canManage: true, preview: true }])
})

test('authoring route 403s without lms.course.manage', async () => {
  const { app } = build()
  assert.equal((await req(app, '/lms/courses', ['lms.access'])).status, 403)
  assert.equal((await req(app, '/lms/courses', ['lms.course.manage'])).status, 200)
  assert.equal((await req(app, '/lms/courses/x/enrollments', ['lms.course.manage'])).status, 403)
})

test('LmsError maps to its status and code', async () => {
  const { app } = build()
  const res = await req(app, '/lms/learn/lessons/lesson-1', ['lms.access'])
  assert.equal(res.status, 409)
  assert.deepEqual(await res.json(), { error: 'Bloqueada', code: 'LOCKED' })
})

test('presign rejects a 60 MB video and non-video files', async () => {
  const { app } = build()
  let res = await req(app, '/lms/media/presign', ['lms.course.manage'], { method: 'POST', body: JSON.stringify({ fileName: 'a.mp4', mimeType: 'video/mp4', sizeBytes: 60 * 1024 * 1024 }) })
  assert.equal(res.status, 413)
  assert.match((await res.json()).error, /50 MB/)
  res = await req(app, '/lms/media/presign', ['lms.course.manage'], { method: 'POST', body: JSON.stringify({ fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 1000 }) })
  assert.equal(res.status, 400)
})
