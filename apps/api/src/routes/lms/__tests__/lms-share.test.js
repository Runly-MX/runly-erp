import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SHARE_TOKEN_RE, filterSharedSections, hashGuestToken, isSharedLesson, learnerKind, newGuestToken, newShareToken,
  normalizeJoinInput, normalizeShareInput, parseGuestAuthorization,
} from '../lms-share-core.js'
import { createLmsGuestService } from '../lms-guest-service.js'
import { createLmsPublicRouter } from '../lms-public.js'
import { LmsError } from '../lms-core.js'

test('share and guest tokens: url-safe, sized, hashed as sha256 hex', () => {
  const share = newShareToken()
  assert.match(share, SHARE_TOKEN_RE)
  assert.notEqual(share, newShareToken())
  const guest = newGuestToken()
  assert.equal(guest.length, 43)
  assert.match(hashGuestToken(guest), /^[0-9a-f]{64}$/)
  assert.equal(hashGuestToken(guest), hashGuestToken(guest))
  assert.notEqual(hashGuestToken(guest), hashGuestToken(newGuestToken()))
})

test('parseGuestAuthorization accepts only the Guest scheme with a well-formed token', () => {
  const token = newGuestToken()
  assert.equal(parseGuestAuthorization(`Guest ${token}`), token)
  assert.equal(parseGuestAuthorization(`Bearer ${token}`), null)
  assert.equal(parseGuestAuthorization('Guest short'), null)
  assert.equal(parseGuestAuthorization(undefined), null)
})

test('scope filter: preview-only, quizzes on request, assignments never', () => {
  const lessons = [
    { id: 'a', kind: 'video', preview: true },
    { id: 'b', kind: 'text', preview: false },
    { id: 'c', kind: 'quiz', preview: true },
    { id: 'd', kind: 'assignment', preview: true },
  ]
  const ids = (settings) => lessons.filter((lesson) => isSharedLesson(lesson, settings)).map((lesson) => lesson.id)
  assert.deepEqual(ids({ scope: 'all', allowQuizzes: false }), ['a', 'b'])
  assert.deepEqual(ids({ scope: 'all', allowQuizzes: true }), ['a', 'b', 'c'])
  assert.deepEqual(ids({ scope: 'preview', allowQuizzes: true }), ['a', 'c'])
  const sections = filterSharedSections([{ id: 's1', lessons: [lessons[1]] }, { id: 's2', lessons }], { scope: 'preview', allowQuizzes: false })
  assert.deepEqual(sections.map((s) => [s.id, s.lessons.map((l) => l.id)]), [['s2', ['a']]])
})

test('join validation: name 2-80, optional valid email', () => {
  assert.deepEqual(normalizeJoinInput({ name: '  Ana   López ', email: ' ANA@X.COM ' }), { name: 'Ana López', email: 'ana@x.com' })
  assert.deepEqual(normalizeJoinInput({ name: 'Bo' }), { name: 'Bo', email: null })
  assert.throws(() => normalizeJoinInput({ name: 'A' }), LmsError)
  assert.throws(() => normalizeJoinInput({ name: 'x'.repeat(81) }), LmsError)
  assert.throws(() => normalizeJoinInput({ name: 'Ana', email: 'no-mail' }), LmsError)
})

test('share input keeps current settings for missing keys and rejects bad scopes', () => {
  assert.deepEqual(normalizeShareInput({ enabled: true }, { scope: 'preview', allowQuizzes: true }), { enabled: true, settings: { scope: 'preview', allowQuizzes: true, issueCertificates: false } })
  assert.deepEqual(normalizeShareInput({ allowQuizzes: false }), { enabled: null, settings: { scope: 'all', allowQuizzes: false, issueCertificates: false } })
  assert.throws(() => normalizeShareInput({ scope: 'everything' }), LmsError)
  assert.equal(learnerKind({ guestTokenHash: 'h' }), 'guest')
  assert.equal(learnerKind({ userProfileId: 'p' }), 'user')
})

// ---- service + routes over an in-memory prisma -----------------------------
const LESSON_IDS = { video: '00000000-0000-7000-8000-000000000001', text: '00000000-0000-7000-8000-000000000002', quiz: '00000000-0000-7000-8000-000000000003', task: '00000000-0000-7000-8000-000000000004' }

function fakeDb({ settings = { scope: 'all', allowQuizzes: false } } = {}) {
  const course = { id: 'course-1', companyId: 'company-1', title: 'Curso', status: 'published', enabled: true, sequential: false, shareEnabled: true, shareToken: newShareToken(), shareSettings: settings }
  const lesson = (id, kind, preview = false) => ({ id, kind, preview, title: kind, enabled: true, required: true, position: 0, settings: {} })
  const sections = [{ id: 'sec-1', title: 'Uno', position: 1, lessons: [lesson(LESSON_IDS.video, 'video', true), lesson(LESSON_IDS.text, 'text'), lesson(LESSON_IDS.quiz, 'quiz', true), lesson(LESSON_IDS.task, 'assignment', true)] }]
  const learners = [], enrollments = []
  const db = {
    course,
    learners,
    enrollments,
    lmsCourse: { findFirst: async ({ where }) => (where.shareToken === course.shareToken && course.shareEnabled && course.status === where.status ? course : null) },
    lmsSection: { findMany: async () => sections },
    lmsLearner: {
      findUnique: async ({ where }) => learners.find((l) => l.guestTokenHash === where.guestTokenHash) ?? null,
      create: async ({ data }) => { const row = { id: `learner-${learners.length + 1}`, enabled: true, ...data }; learners.push(row); return row },
    },
    lmsEnrollment: {
      findUnique: async ({ where }) => {
        const key = where.courseId_learnerId
        const row = enrollments.find((e) => e.courseId === key.courseId && e.learnerId === key.learnerId)
        return row ? { ...row, learner: learners.find((l) => l.id === row.learnerId) } : null
      },
      create: async ({ data }) => { const row = { id: `enr-${enrollments.length + 1}`, status: 'active', progressPct: 0, ...data }; enrollments.push(row); return row },
      update: async () => ({}),
    },
    lmsLessonProgress: { findMany: async () => [], upsert: async ({ create }) => create },
    company: { findUnique: async () => ({ name: 'Acme', brandingConfig: null }) },
    fileAsset: { findMany: async () => [] },
    $transaction: async (fn) => fn(db),
  }
  return db
}

function build(options) {
  const db = fakeDb(options)
  const learn = { resolveMedia: async () => ({ mediaUrl: null, media: null, poster: null }), applyProgress: async () => ({ lessonStatus: 'completed', enrollment: { status: 'active', progressPct: 50 } }) }
  const guestService = createLmsGuestService({ prisma: db, learn })
  const app = createLmsPublicRouter({ prisma: db, service: {}, guestService })
  const call = (path, { method = 'GET', guest, body } = {}) => app.request(`http://localhost/public/lms/share/${db.course.shareToken}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(guest ? { authorization: `Guest ${guest}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { db, app, call }
}

test('join stores only the token hash and re-joining returns the same guest', async () => {
  const { db, call } = build()
  const res = await call('/join', { method: 'POST', body: { name: 'Invitada Uno' } })
  assert.equal(res.status, 200)
  const { data } = await res.json()
  assert.equal(db.learners.length, 1)
  assert.equal(db.learners[0].guestTokenHash, hashGuestToken(data.guestToken))
  assert.ok(!JSON.stringify(db.learners[0]).includes(data.guestToken))
  assert.equal(db.enrollments[0].source, 'share')
  const again = await (await call('/join', { method: 'POST', guest: data.guestToken, body: {} })).json()
  assert.equal(again.data.resumed, true)
  assert.equal(db.learners.length, 1)
  assert.equal((await call('/join', { method: 'POST', body: { name: 'A' } })).status, 400)
})

test('summary lists shared lessons only, without ids', async () => {
  const { call } = build({ settings: { scope: 'preview', allowQuizzes: false } })
  const { data } = await (await call('')).json()
  const lessons = data.sections.flatMap((s) => s.lessons)
  assert.deepEqual(lessons.map((l) => l.kind), ['video'])
  assert.equal(lessons[0].id, undefined)
  assert.equal(data.company.name, 'Acme')
})

test('access rules: guest token required, rotated link 404, out-of-scope lesson 404, quizzes disabled 404', async () => {
  const { db, call } = build({ settings: { scope: 'all', allowQuizzes: false } })
  const { data } = await (await call('/join', { method: 'POST', body: { name: 'Invitado' } })).json()
  const guest = data.guestToken
  assert.equal((await call('/me')).status, 401)
  const me = await (await call('/me', { guest })).json()
  assert.deepEqual(me.data.sections[0].lessons.map((l) => l.kind), ['video', 'text'])
  assert.equal((await call(`/lessons/${LESSON_IDS.text}`, { guest })).status, 200)
  assert.equal((await call(`/lessons/${LESSON_IDS.task}`, { guest })).status, 404)
  assert.equal((await call(`/lessons/${LESSON_IDS.quiz}`, { guest })).status, 404)
  const quiz = await call(`/lessons/${LESSON_IDS.quiz}/quiz`, { guest })
  assert.equal(quiz.status, 404)
  assert.equal((await quiz.json()).code, 'QUIZZES_DISABLED')
  assert.equal((await call(`/lessons/${LESSON_IDS.video}/progress`, { method: 'POST', guest, body: { positionSeconds: 10 } })).status, 200)

  const oldToken = db.course.shareToken
  db.course.shareToken = newShareToken()
  const rotated = await createLmsPublicRouter({ prisma: db, service: {}, guestService: createLmsGuestService({ prisma: db }) })
    .request(`http://localhost/public/lms/share/${oldToken}/me`, { headers: { authorization: `Guest ${guest}` } })
  assert.equal(rotated.status, 404)
  db.course.shareEnabled = false
  assert.equal((await call('/me', { guest })).status, 404)
})

test('a dropped guest is refused', async () => {
  const { db, call } = build()
  const { data } = await (await call('/join', { method: 'POST', body: { name: 'Invitado' } })).json()
  db.enrollments[0].status = 'dropped'
  const res = await call('/me', { guest: data.guestToken })
  assert.equal(res.status, 403)
  assert.equal((await res.json()).code, 'GUEST_REMOVED')
})

function outcomeDb({ issueCertificates }) {
  const lessons = [
    { id: 'a', kind: 'video', preview: false, required: true, enabled: true, section: { free: true } },
    { id: 'b', kind: 'text', preview: false, required: true, enabled: true, section: { free: false } },
  ]
  const created = []
  const db = {
    created,
    lmsLessonProgress: { findUnique: async () => null, upsert: async () => ({}), findMany: async () => [{ lessonId: 'a' }] },
    lmsLesson: { findMany: async () => lessons },
    lmsCourse: {
      findUnique: async () => ({
        title: 'Curso', estimatedMinutes: 30, certificateTemplateId: 't1', certificateTemplate: { id: 't1', enabled: true },
        shareSettings: { scope: 'preview', issueCertificates },
      }),
    },
    lmsEnrollment: { update: async ({ data }) => ({ id: 'e1', companyId: 'co', courseId: 'c1', learnerId: 'l1', ...data, learner: {} }) },
    lmsCertificate: { findFirst: async () => null, create: async ({ data }) => { created.push(data); return { id: 'cert', ...data } } },
    lmsLearner: { findUnique: async () => ({ displayName: 'Invitada Uno' }) },
    $queryRaw: async () => [],
  }
  return db
}

test('guest at 100% of the shared lessons: certificate only when the link issues them', async () => {
  const { setLessonOutcome } = await import('../lms-progress.js')
  const enrollment = { id: 'e1', companyId: 'co', courseId: 'c1', learnerId: 'l1', status: 'active', source: 'share' }

  const off = outcomeDb({ issueCertificates: false })
  const noCert = await setLessonOutcome(off, { enrollment, lessonId: 'a', status: 'completed' })
  assert.equal(noCert.enrollment.progressPct, 100)
  assert.equal(noCert.enrollment.status, 'completed')
  assert.equal(noCert.certificate, null)
  assert.equal(off.created.length, 0)

  const on = outcomeDb({ issueCertificates: true })
  const withCert = await setLessonOutcome(on, { enrollment, lessonId: 'a', status: 'completed' })
  assert.equal(on.created.length, 1)
  assert.equal(on.created[0].learnerName, 'Invitada Uno')
  assert.equal(withCert.certificate.id, 'cert')
})

test('free preview: free-section and preview lessons open, quizzes and assignments never', async () => {
  const { isOpenPreview, markSectionFree } = await import('../lms-share-core.js')
  const [section] = markSectionFree([{ free: true, lessons: [{ kind: 'video' }, { kind: 'quiz' }, { kind: 'assignment' }] }])
  assert.deepEqual(section.lessons.map(isOpenPreview), [true, false, false])
  assert.equal(isOpenPreview({ kind: 'text', preview: true }), true)
  assert.equal(isOpenPreview({ kind: 'text', preview: false, sectionFree: false }), false)
  assert.equal(isSharedLesson({ kind: 'text', sectionFree: true }, { scope: 'preview', allowQuizzes: false }), true)
})

test('promo video: video/embed of the same course, free section or preview only', async () => {
  const { isPromoEligible } = await import('../lms-promo.js')
  const base = { courseId: 'c1', enabled: true, kind: 'video', preview: true }
  assert.equal(isPromoEligible(base, 'c1'), true)
  assert.equal(isPromoEligible({ ...base, kind: 'embed', preview: false, sectionFree: true }, 'c1'), true)
  assert.equal(isPromoEligible({ ...base, preview: false }, 'c1'), false)
  assert.equal(isPromoEligible({ ...base, kind: 'text' }, 'c1'), false)
  assert.equal(isPromoEligible(base, 'c2'), false)
})
