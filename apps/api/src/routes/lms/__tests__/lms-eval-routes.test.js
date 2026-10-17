import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLmsRouter } from '../lms-routes.js'
import { LmsError } from '../lms-core.js'
import { createLmsMedia } from '../lms-media.js'
import { setLessonOutcome } from '../lms-progress.js'

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
  const quiz = {
    startAttempt: async (companyId, actor, lessonId) => ({ attempt: { id: 'a1', lessonId }, resumed: lessonId === 'resume' }),
    submitAttempt: async () => ({ id: 'a1', status: 'graded', lessonStatus: 'completed', enrollment: { id: 'e1' } }),
    saveAnswers: async () => { throw new LmsError('Se terminó el tiempo.', 409, 'EXPIRED') },
  }
  const review = {
    queue: async (companyId, query) => { calls.push(['queue', companyId, query]); return [] },
    grantExtraAttempt: async (companyId, enrollmentId, lessonId) => ({ extraAttempts: 1, lessonStatus: 'in_progress', enrollmentId, lessonId }),
  }
  const supabaseAdmin = { storage: { from: () => ({ createSignedUploadUrl: async () => ({ data: { signedUrl: 'u', token: 't' } }) }) } }
  const prisma = { fileAsset: { create: async ({ data }) => { calls.push(['asset', data.entityType]); return { id: 'f1' } } } }
  const media = createLmsMedia({ prisma, supabaseAdmin, bucket: 'runly-files' })
  const app = createLmsRouter({ requirePermission, service: {}, learnService: {}, media, evalServices: { quiz, review, assignment: undefined } })
  return { app, calls }
}

const req = (app, path, permissions, init = {}) => app.request(`http://localhost${path}`, { ...init, headers: { 'x-permissions': permissions.join(','), 'content-type': 'application/json' } })

test('review routes require lms.grade', async () => {
  const { app, calls } = build()
  assert.equal((await req(app, '/lms/review', ['lms.access', 'lms.course.manage'])).status, 403)
  const res = await req(app, '/lms/review?courseId=c1', ['lms.grade'])
  assert.equal(res.status, 200)
  assert.deepEqual([calls[0][0], calls[0][1], { ...calls[0][2] }], ['queue', 'company-1', { courseId: 'c1' }])
  assert.equal((await req(app, '/lms/enrollments/e1/lessons/l1/extra-attempt', ['lms.enrollment.manage'], { method: 'POST' })).status, 403)
  assert.equal((await req(app, '/lms/enrollments/e1/lessons/l1/extra-attempt', ['lms.grade'], { method: 'POST' })).status, 200)
})

test('start attempt answers 201 when new and 200 when resumed', async () => {
  const { app } = build()
  assert.equal((await req(app, '/lms/learn/lessons/new/attempts', ['lms.access'], { method: 'POST' })).status, 201)
  const res = await req(app, '/lms/learn/lessons/resume/attempts', ['lms.access'], { method: 'POST' })
  assert.equal(res.status, 200)
  assert.deepEqual((await res.json()).data, { id: 'a1', lessonId: 'resume' })
})

test('submit returns the attempt with lessonStatus at the top level; LmsError codes map', async () => {
  const { app } = build()
  const res = await req(app, '/lms/learn/attempts/a1/submit', ['lms.access'], { method: 'POST', body: '{}' })
  assert.equal((await res.json()).data.lessonStatus, 'completed')
  const expired = await req(app, '/lms/learn/attempts/a1/answers', ['lms.access'], { method: 'PUT', body: JSON.stringify({ answers: {} }) })
  assert.equal(expired.status, 409)
  assert.deepEqual(await expired.json(), { error: 'Se terminó el tiempo.', code: 'EXPIRED' })
  assert.equal((await req(app, '/lms/lessons/l1/questions', ['lms.access'])).status, 403)
})

test('learner upload presign enforces submission types and 50 MB', async () => {
  const { app, calls } = build()
  let res = await req(app, '/lms/learn/uploads/presign', ['lms.access'], { method: 'POST', body: JSON.stringify({ fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 51 * 1024 * 1024 }) })
  assert.equal(res.status, 413)
  res = await req(app, '/lms/learn/uploads/presign', ['lms.access'], { method: 'POST', body: JSON.stringify({ fileName: 'a.exe', mimeType: 'application/x-msdownload', sizeBytes: 10 }) })
  assert.equal(res.status, 400)
  res = await req(app, '/lms/learn/uploads/presign', ['lms.access'], { method: 'POST', body: JSON.stringify({ fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 1000 }) })
  assert.equal(res.status, 200)
  assert.deepEqual(calls.at(-1), ['asset', 'LmsSubmission'])
})

function fakeDb({ progress = null, lessons, completed }) {
  const writes = []
  return {
    writes,
    lmsLessonProgress: {
      findUnique: async () => progress,
      upsert: async (args) => { writes.push(['progress', args.update]); return args.update },
      findMany: async () => completed.map((lessonId) => ({ lessonId })),
    },
    lmsLesson: { findMany: async () => lessons },
    lmsEnrollment: { update: async ({ data }) => { writes.push(['enrollment', data]); return { id: 'e1', ...data } } },
  }
}

test('setLessonOutcome never downgrades completed and completes the enrollment at 100', async () => {
  const enrollment = { id: 'e1', companyId: 'c1', courseId: 'k1', status: 'active', completedAt: null }
  const lessons = [{ id: 'l1', required: true, enabled: true }, { id: 'l2', required: true, enabled: true }]
  const done = new Date('2026-10-01T00:00:00Z')
  let db = fakeDb({ progress: { status: 'completed', completedAt: done }, lessons, completed: ['l1'] })
  let result = await setLessonOutcome(db, { enrollment, lessonId: 'l1', status: 'failed' })
  assert.equal(result.lessonStatus, 'completed')
  assert.equal(db.writes[0][1].completedAt, done)
  assert.equal(db.writes[1][1].progressPct, 50)
  assert.equal(db.writes[1][1].status, undefined)

  db = fakeDb({ lessons, completed: ['l1', 'l2'] })
  result = await setLessonOutcome(db, { enrollment, lessonId: 'l2', status: 'completed' })
  assert.equal(result.enrollment.status, 'completed')
  assert.equal(result.enrollment.progressPct, 100)
})
