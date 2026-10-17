import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLmsRouter } from '../lms-routes.js'
import { createLmsPublicRouter } from '../lms-public.js'
import { createLmsCertService } from '../lms-cert-service.js'
import { createTokenBucketLimiter } from '../../../lib/token-bucket-limiter.js'
import { LmsError } from '../lms-error.js'

function requirePermission(key) {
  return async (c, next) => {
    const permissions = new Set((c.req.header('x-permissions') ?? '').split(',').filter(Boolean))
    if (!permissions.has(key)) return c.json({ error: 'forbidden', key }, 403)
    c.set('companyId', 'company-1')
    c.set('userContext', { profile: { id: 'profile-1' }, isAdmin: false, permissionSet: permissions })
    await next()
  }
}

const notFound = async () => { throw new LmsError('El certificado no existe.', 404, 'NOT_FOUND') }
const pdf = { buffer: Buffer.from('%PDF-1.3 fake'), filename: 'certificado-2026-000001.pdf' }
const req = (app, path, permissions = [], init = {}) => app.request(`http://localhost${path}`, { ...init, headers: { 'x-permissions': permissions.join(','), 'content-type': 'application/json' } })

test('internal routes: permissions, status codes and PDF headers', async () => {
  const calls = []
  const certService = {
    listTemplates: async () => [],
    createTemplate: async (...args) => { calls.push(args); return { id: 't1' } },
    disableTemplate: async () => { throw new LmsError('La plantilla está asignada a 1 curso.', 409, 'IN_USE') },
    issueManual: async () => { throw new LmsError('La persona aún no completa el curso.', 409, 'NOT_COMPLETED') },
    myCertificatePdf: async () => pdf,
  }
  const app = createLmsRouter({ requirePermission, service: {}, learnService: {}, media: {}, evalServices: { quiz: {}, review: {}, assignment: {} }, socialService: {}, certService })
  assert.equal((await req(app, '/lms/certificate-templates', ['lms.access'])).status, 403)
  assert.equal((await req(app, '/lms/certificate-templates', ['lms.course.manage'], { method: 'POST', body: JSON.stringify({ name: 'A' }) })).status, 201)
  assert.deepEqual(calls[0], ['company-1', 'profile-1', { name: 'A' }])
  const del = await req(app, '/lms/certificate-templates/t1', ['lms.course.manage'], { method: 'DELETE' })
  assert.equal(del.status, 409)
  assert.equal((await del.json()).code, 'IN_USE')
  assert.equal((await req(app, '/lms/enrollments/e1/certificate', ['lms.course.manage'], { method: 'POST' })).status, 403)
  const issue = await req(app, '/lms/enrollments/e1/certificate', ['lms.enrollment.manage'], { method: 'POST' })
  assert.equal(issue.status, 409)
  assert.equal((await issue.json()).code, 'NOT_COMPLETED')
  const mine = await req(app, '/lms/my/certificates/c1/pdf', ['lms.access'])
  assert.equal(mine.status, 200)
  assert.equal(mine.headers.get('content-type'), 'application/pdf')
  assert.equal(Buffer.from(await mine.arrayBuffer()).subarray(0, 4).toString(), '%PDF')
})

test('public: unknown token is 404 and the limiter answers 429 after capacity', async () => {
  const service = {
    publicCertificate: async (token) => (token === 'ok' ? { folio: '2026-000001', revoked: false } : notFound()),
    publicCertificatePdf: async () => pdf,
  }
  const app = createLmsPublicRouter({ service, limiter: createTokenBucketLimiter({ capacity: 3, refillPerSecond: 0.0001 }) })
  const missing = await app.request('http://localhost/public/lms/certificates/nope')
  assert.equal(missing.status, 404)
  assert.equal((await missing.json()).code, 'NOT_FOUND')
  assert.equal((await app.request('http://localhost/public/lms/certificates/ok')).status, 200)
  assert.equal((await app.request('http://localhost/public/lms/certificates/ok/pdf')).headers.get('content-type'), 'application/pdf')
  const limited = await app.request('http://localhost/public/lms/certificates/ok')
  assert.equal(limited.status, 429)
  assert.ok(limited.headers.get('retry-after'))
  // Another client keeps its own bucket.
  assert.equal((await app.request('http://localhost/public/lms/certificates/ok', { headers: { 'x-forwarded-for': '10.0.0.2' } })).status, 200)
})

function fakePrisma({ certificates = [], enrollment = null, template = null }) {
  return {
    lmsLearner: { findUnique: async ({ where }) => (where.companyId_userProfileId.userProfileId === 'profile-1' ? { id: 'learner-1' } : null) },
    lmsCertificate: {
      findFirst: async ({ where }) => certificates.find((row) => row.id === where.id && row.companyId === where.companyId && (!where.learnerId || row.learnerId === where.learnerId)) ?? null,
    },
    lmsEnrollment: { findFirst: async () => enrollment },
    lmsCourse: { findUnique: async () => ({ certificateTemplate: template }) },
    lmsCertificateTemplate: { findUnique: async () => null },
    company: { findUnique: async () => ({ name: 'Acme', brandingConfig: null }) },
  }
}

const cert = (id, learnerId) => ({ id, companyId: 'company-1', learnerId, courseId: 'k1', templateId: null, folio: '2026-000001', token: 'a'.repeat(24), learnerName: 'Ana', courseTitle: 'Curso', hours: 1, issuedAt: new Date('2026-10-16T12:00:00Z'), revokedAt: null })

test('learner cannot download someone else certificate', async () => {
  const svc = createLmsCertService({ prisma: fakePrisma({ certificates: [cert('mine', 'learner-1'), cert('theirs', 'learner-2')] }), appBaseUrl: () => null })
  const own = await svc.myCertificatePdf('company-1', 'profile-1', 'mine')
  assert.equal(own.buffer.subarray(0, 4).toString(), '%PDF')
  await assert.rejects(svc.myCertificatePdf('company-1', 'profile-1', 'theirs'), (error) => error.status === 404)
  await assert.rejects(svc.myCertificatePdf('company-1', 'profile-2', 'mine'), (error) => error.status === 404)
})

test('manual issue: NOT_COMPLETED and NO_TEMPLATE; verifyUrl relative without app URL', async () => {
  let svc = createLmsCertService({ prisma: fakePrisma({ enrollment: { id: 'e1', status: 'active' } }) })
  await assert.rejects(svc.issueManual('company-1', 'profile-1', 'e1'), (error) => error.code === 'NOT_COMPLETED')
  svc = createLmsCertService({ prisma: fakePrisma({ enrollment: { id: 'e1', status: 'completed', courseId: 'k1' }, template: { enabled: false } }) })
  await assert.rejects(svc.issueManual('company-1', 'profile-1', 'e1'), (error) => error.code === 'NO_TEMPLATE')
  svc = createLmsCertService({ prisma: {}, appBaseUrl: () => null })
  assert.equal(svc.verifyUrlFor('tok'), '/app/p/lms/cert/tok')
  svc = createLmsCertService({ prisma: {}, appBaseUrl: () => 'https://app.example.com' })
  assert.equal(svc.verifyUrlFor('tok'), 'https://app.example.com/app/p/lms/cert/tok')
})
