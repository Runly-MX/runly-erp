import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { registerLmsAssessmentRoutes } from '../lms-assessment-routes.js'
import { LmsError } from '../lms-core.js'

function requirePermission(key) {
  return async (c, next) => {
    const permissions = new Set((c.req.header('x-permissions') ?? '').split(',').filter(Boolean))
    if (!permissions.has(key)) return c.json({ error: 'forbidden' }, 403)
    c.set('companyId', 'company-1')
    c.set('userContext', { profile: { id: 'profile-1' } })
    await next()
  }
}

function build(service) {
  const app = new Hono()
  const run = (fallback, fn) => async (c) => {
    try { return await fn(c) } catch (error) {
      if (error instanceof LmsError) return c.json({ error: error.message, code: error.code }, error.status)
      return c.json({ error: fallback }, 500)
    }
  }
  registerLmsAssessmentRoutes(app, { requirePermission, run, service })
  return app
}

const req = (app, path, init = {}, permissions = ['lms.course.manage']) => app.request(`http://localhost${path}`, {
  ...init, headers: { 'x-permissions': permissions.join(','), 'content-type': 'application/json' },
})

test('assessment routes need lms.course.manage', async () => {
  const app = build({ list: async () => [] })
  assert.equal((await req(app, '/lms/assessments', {}, ['lms.access'])).status, 403)
  assert.equal((await req(app, '/lms/assessments')).status, 200)
})

test('create passes company, actor and body; returns 201', async () => {
  const calls = []
  const app = build({ create: async (...args) => { calls.push(args); return { id: 'a1' } } })
  const res = await req(app, '/lms/assessments', { method: 'POST', body: JSON.stringify({ title: 'PVR' }) })
  assert.equal(res.status, 201)
  assert.deepEqual(calls[0], ['company-1', 'profile-1', { title: 'PVR' }])
})

test('service errors keep their status and code (course id on assessment route = 404)', async () => {
  const app = build({ get: async () => { throw new LmsError('La evaluación no existe.', 404) }, update: async () => { throw new LmsError('No se puede publicar', 409, 'NOT_READY') } })
  assert.equal((await req(app, '/lms/assessments/x')).status, 404)
  const res = await req(app, '/lms/assessments/x', { method: 'PATCH', body: '{}' })
  assert.equal(res.status, 409)
  assert.equal((await res.json()).code, 'NOT_READY')
})

test('activity routes reach the service', async () => {
  const calls = []
  const svc = {
    createActivity: async (...args) => { calls.push(['create', ...args]); return {} },
    reorderActivities: async (...args) => { calls.push(['reorder', ...args]); return [] },
    updateActivity: async (...args) => { calls.push(['update', ...args]); return {} },
    deleteActivity: async (...args) => { calls.push(['delete', ...args]); return {} },
  }
  const app = build(svc)
  assert.equal((await req(app, '/lms/assessments/a1/activities', { method: 'POST', body: '{"type":"files"}' })).status, 201)
  await req(app, '/lms/assessments/a1/activities/reorder', { method: 'POST', body: '{"activityIds":[]}' })
  await req(app, '/lms/activities/l1', { method: 'PATCH', body: '{"title":"X"}' })
  await req(app, '/lms/activities/l1', { method: 'DELETE' })
  assert.deepEqual(calls.map((call) => call[0]), ['create', 'reorder', 'update', 'delete'])
  assert.deepEqual(calls[0], ['create', 'company-1', 'a1', { type: 'files' }])
})

test('participant session routes need lms.access; start answers 201 new, 200 resumed', async () => {
  const app = new Hono()
  const run = (fallback, fn) => async (c) => { try { return await fn(c) } catch (error) { return c.json({ error: error.message, code: error.code }, error.status ?? 500) } }
  let resumed = false
  const sessionService = {
    start: async () => ({ session: { session: { id: 's1' } }, resumed }),
    saveAnswers: async () => { throw new LmsError('Se terminó el tiempo.', 409, 'EXPIRED') },
  }
  registerLmsAssessmentRoutes(app, { requirePermission, run, service: {}, sessionService })
  const post = (path, permissions) => req(app, path, { method: 'POST' }, permissions)
  assert.equal((await post('/lms/learn/assessments/a1/sessions', ['lms.course.manage'])).status, 403)
  assert.equal((await post('/lms/learn/assessments/a1/sessions', ['lms.access'])).status, 201)
  resumed = true
  const again = await post('/lms/learn/assessments/a1/sessions', ['lms.access'])
  assert.equal(again.status, 200)
  assert.equal((await again.json()).data.resumed, true)
  const late = await req(app, '/lms/learn/sessions/s1/attempts/t1/answers', { method: 'PUT', body: '{}' }, ['lms.access'])
  assert.equal(late.status, 409)
  assert.equal((await late.json()).code, 'EXPIRED')
})
