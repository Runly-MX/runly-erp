import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLmsRouter } from '../lms-routes.js'
import { LmsError } from '../lms-core.js'
import { normalizeResourceTitle, validateResourceOrder } from '../lms-resources-service.js'
import { canViewCourse, profileDisplayName, summarizeCurriculum } from '../lms-overview-service.js'

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
  const record = (name, result) => async (...args) => { calls.push([name, ...args]); return result }
  const resources = {
    listResources: record('list', []),
    addResource: record('add', { id: 'r1' }),
    updateResource: record('update', { id: 'r1' }),
    deleteResource: async () => { throw new LmsError('El recurso no existe.', 404) },
    reorderResources: record('reorder', []),
  }
  const overview = { overview: record('overview', { course: {} }) }
  const app = createLmsRouter({
    requirePermission, service: {}, learnService: {}, media: {}, evalServices: { quiz: {}, review: {}, assignment: {} },
    socialService: {}, certService: {}, experienceServices: { resources, overview },
  })
  return { app, calls }
}

const req = (app, path, permissions, init = {}) => app.request(`http://localhost${path}`, { ...init, headers: { 'x-permissions': permissions.join(','), 'content-type': 'application/json' } })

test('normalizeResourceTitle trims, empties to null and caps length', () => {
  assert.equal(normalizeResourceTitle('  Guía  '), 'Guía')
  assert.equal(normalizeResourceTitle('   '), null)
  assert.equal(normalizeResourceTitle(undefined), null)
  assert.throws(() => normalizeResourceTitle('x'.repeat(201)), LmsError)
})

test('validateResourceOrder requires every resource exactly once', () => {
  assert.deepEqual(validateResourceOrder(['b', 'a'], ['a', 'b']), ['b', 'a'])
  assert.throws(() => validateResourceOrder(['a'], ['a', 'b']), /todos/)
  assert.throws(() => validateResourceOrder(['a', 'a'], ['a', 'b']), LmsError)
  assert.throws(() => validateResourceOrder(['z', 'a'], ['a', 'b']), LmsError)
  assert.throws(() => validateResourceOrder(null, []), LmsError)
})

test('summarizeCurriculum counts lessons and known durations', () => {
  const sections = [{ lessons: [{ durationSeconds: 60 }, { durationSeconds: null }] }, { lessons: [{ durationSeconds: 30.4 }] }, {}]
  assert.deepEqual(summarizeCurriculum(sections), { lessonCount: 3, totalSeconds: 90 })
  assert.deepEqual(summarizeCurriculum(), { lessonCount: 0, totalSeconds: 0 })
})

test('canViewCourse: drafts only for managers, archived only for enrolled', () => {
  assert.equal(canViewCourse({ status: 'published' }), true)
  assert.equal(canViewCourse({ status: 'draft' }), false)
  assert.equal(canViewCourse({ status: 'draft' }, { canManage: true }), true)
  assert.equal(canViewCourse({ status: 'archived' }), false)
  assert.equal(canViewCourse({ status: 'archived' }, { enrolled: true }), true)
})

test('profileDisplayName falls back to first and last name', () => {
  assert.equal(profileDisplayName({ displayName: 'Ana P.' }), 'Ana P.')
  assert.equal(profileDisplayName({ displayName: '', firstName: 'Ana', lastName: 'Pérez' }), 'Ana Pérez')
  assert.equal(profileDisplayName(null), null)
})

test('course overview is open to lms.access and passes the manager flag', async () => {
  const { app, calls } = build()
  assert.equal((await req(app, '/lms/courses/k1/overview', [])).status, 403)
  assert.equal((await req(app, '/lms/courses/k1/overview', ['lms.access'])).status, 200)
  assert.deepEqual(calls.at(-1), ['overview', 'company-1', 'profile-1', 'k1', { canManage: false }])
  await req(app, '/lms/courses/k1/overview', ['lms.access', 'lms.course.manage'])
  assert.deepEqual(calls.at(-1).at(-1), { canManage: true })
})

test('resource routes require lms.course.manage and map errors', async () => {
  const { app, calls } = build()
  assert.equal((await req(app, '/lms/lessons/l1/resources', ['lms.access'])).status, 403)
  assert.equal((await req(app, '/lms/lessons/l1/resources', ['lms.course.manage'])).status, 200)
  const created = await req(app, '/lms/lessons/l1/resources', ['lms.course.manage'], { method: 'POST', body: JSON.stringify({ fileId: 'f1', title: 'Guía' }) })
  assert.equal(created.status, 201)
  assert.deepEqual(calls.at(-1), ['add', 'company-1', 'l1', { fileId: 'f1', title: 'Guía' }])
  await req(app, '/lms/lessons/l1/resources/reorder', ['lms.course.manage'], { method: 'POST', body: JSON.stringify({ resourceIds: ['b', 'a'] }) })
  assert.deepEqual(calls.at(-1), ['reorder', 'company-1', 'l1', { resourceIds: ['b', 'a'] }])
  assert.equal((await req(app, '/lms/resources/r1', ['lms.course.manage'], { method: 'PATCH', body: JSON.stringify({ title: 'X' }) })).status, 200)
  const removed = await req(app, '/lms/resources/r1', ['lms.course.manage'], { method: 'DELETE' })
  assert.equal(removed.status, 404)
  assert.equal((await removed.json()).error, 'El recurso no existe.')
})
