import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSharedLesson, newShareToken, normalizeShareInput, normalizeShareSettings } from '../lms-share-core.js'
import { createLmsGuestService } from '../lms-guest-service.js'
import { createLmsPublicRouter } from '../lms-public.js'
import { createLmsMedia } from '../lms-media.js'
import { createLmsGuestGradeMailer } from '../lms-guest-mail.js'
import { createLmsReviewService } from '../lms-review-service.js'

test('share settings: invite mode turns quizzes and assignments on by default, explicit values win', () => {
  const open = normalizeShareSettings({})
  assert.equal(open.allowQuizzes, false)
  assert.equal(open.allowAssignments, false)
  const invite = normalizeShareSettings({ accessMode: 'invite' })
  assert.equal(invite.allowQuizzes, true)
  assert.equal(invite.allowAssignments, true)
  const overridden = normalizeShareSettings({ accessMode: 'invite', allowQuizzes: false, allowAssignments: false })
  assert.equal(overridden.allowQuizzes, false)
  assert.equal(overridden.allowAssignments, false)
  assert.equal(normalizeShareSettings({ accessMode: 'open', allowAssignments: true }).allowAssignments, true)
})

test('share input stores the evaluation switches only once set, so the mode default keeps applying', () => {
  const switched = normalizeShareInput({ accessMode: 'invite' }, { accessMode: 'open' }).settings
  assert.equal('allowQuizzes' in switched, false)
  assert.equal('allowAssignments' in switched, false)
  assert.equal(normalizeShareSettings(switched).allowAssignments, true)
  const explicit = normalizeShareInput({ allowAssignments: false }, { accessMode: 'invite', allowQuizzes: true }).settings
  assert.equal(explicit.allowAssignments, false)
  assert.equal(explicit.allowQuizzes, true)
  assert.equal(normalizeShareSettings(explicit).allowAssignments, false)
})

test('isSharedLesson includes assignments only when allowed', () => {
  const task = { kind: 'assignment', preview: false }
  assert.equal(isSharedLesson(task, { scope: 'all', allowAssignments: false }), false)
  assert.equal(isSharedLesson(task, { scope: 'all', allowAssignments: true }), true)
  assert.equal(isSharedLesson(task, { scope: 'preview', allowAssignments: true }), false)
  assert.equal(isSharedLesson({ ...task, preview: true }, { scope: 'preview', allowAssignments: true }), true)
})

// ---- guest assignment routes over an in-memory prisma ------------------------
const TASK = '00000000-0000-7000-8000-000000000004'
const FILE_OK = '00000000-0000-7000-8000-0000000000f1'
const FILE_OTHER = '00000000-0000-7000-8000-0000000000f2'

function fakeDb(settings) {
  const course = { id: 'course-1', companyId: 'company-1', title: 'Curso', status: 'published', enabled: true, sequential: false, shareEnabled: true, shareToken: newShareToken(), shareSettings: settings }
  const task = { id: TASK, kind: 'assignment', preview: false, title: 'Tarea', enabled: true, required: true, position: 0, settings: {} }
  const learners = [], enrollments = [], submissions = [], files = []
  const db = {
    course, learners, enrollments, submissions, files,
    lmsCourse: {
      findFirst: async ({ where }) => (where.shareToken === course.shareToken && course.shareEnabled ? course : null),
      findUnique: async () => ({ shareSettings: course.shareSettings }),
    },
    lmsSection: { findMany: async () => [{ id: 'sec-1', title: 'Uno', position: 1, lessons: [task] }] },
    lmsLesson: { findMany: async () => [{ ...task, section: { free: false } }] },
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
      create: async ({ data }) => { const row = { id: `enr-${enrollments.length + 1}`, status: 'active', progressPct: 0, createdAt: new Date(), ...data }; enrollments.push(row); return row },
      update: async ({ where, data }) => ({ ...enrollments.find((e) => e.id === where.id), ...data, learner: {} }),
    },
    lmsLessonProgress: { findMany: async () => [], findUnique: async () => null, upsert: async ({ create }) => create },
    lmsSubmission: {
      findMany: async ({ where }) => submissions.filter((s) => s.enrollmentId === where.enrollmentId && s.lessonId === where.lessonId),
      create: async ({ data }) => { const row = { id: `sub-${submissions.length + 1}`, status: 'submitted', ...data }; submissions.push(row); return row },
    },
    fileAsset: {
      findMany: async ({ where }) => files.filter((f) => where.id.in.includes(f.id) && f.uploadedById === where.uploadedById && f.entityType === where.entityType),
    },
    company: { findUnique: async () => ({ name: 'Acme', brandingConfig: null }) },
    $transaction: async (fn) => fn(db),
  }
  return db
}

function build(settings) {
  const db = fakeDb(settings)
  const presigned = []
  const media = {
    presign: async (companyId, actorId, body, purpose, metadata) => { presigned.push({ companyId, actorId, purpose: purpose.entityType, metadata }); return { fileId: FILE_OK, uploadUrl: 'https://storage.example.com/up', token: 't' } },
    confirm: async (_companyId, fileId) => ({ fileId, fileName: 'a.pdf' }),
  }
  const guestService = createLmsGuestService({ prisma: db, media, learn: { resolveMedia: async () => ({}) } })
  const app = createLmsPublicRouter({ prisma: db, service: {}, guestService })
  const call = (path, { method = 'GET', guest, body } = {}) => app.request(`http://localhost/public/lms/share/${db.course.shareToken}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(guest ? { authorization: `Guest ${guest}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const join = async () => (await (await call('/join', { method: 'POST', body: { name: 'Invitada Uno' } })).json()).data.guestToken
  return { db, call, join, presigned }
}

test('assignments not shared: every guest assignment route answers 404', async () => {
  const { call, join } = build({ scope: 'all' })
  const guest = await join()
  for (const [path, method] of [[`/lessons/${TASK}/submissions`, 'GET'], [`/lessons/${TASK}/submissions`, 'POST'], ['/uploads/presign', 'POST'], [`/uploads/${FILE_OK}/confirm`, 'POST']]) {
    const res = await call(path, { method, guest, body: method === 'POST' ? {} : undefined })
    assert.equal(res.status, 404, path)
    assert.equal((await res.json()).code, 'ASSIGNMENTS_DISABLED')
  }
})

test('guest uploads are owned through metadata and only own files can be submitted', async () => {
  const { db, call, join, presigned } = build({ scope: 'all', allowAssignments: true })
  const guest = await join()
  assert.equal((await call(`/lessons/${TASK}/submissions`)).status, 401)
  const listed = await (await call(`/lessons/${TASK}/submissions`, { guest })).json()
  assert.deepEqual(listed.data.submissions, [])

  const presign = await (await call('/uploads/presign', { method: 'POST', guest, body: { fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 10 } })).json()
  assert.deepEqual(Object.keys(presign.data).sort(), ['fileId', 'uploadUrl'])
  assert.deepEqual(presigned[0], { companyId: 'company-1', actorId: null, purpose: 'LmsSubmission', metadata: { guestLearnerId: 'learner-1' } })

  const meta = { companyId: 'company-1' }
  db.files.push({ id: FILE_OK, uploadedById: null, entityType: 'LmsSubmission', metadata: { ...meta, guestLearnerId: 'learner-1' } })
  db.files.push({ id: FILE_OTHER, uploadedById: null, entityType: 'LmsSubmission', metadata: { ...meta, guestLearnerId: 'learner-9' } })
  const stolen = await call(`/lessons/${TASK}/submissions`, { method: 'POST', guest, body: { fileIds: [FILE_OTHER] } })
  assert.equal(stolen.status, 400)
  assert.equal((await stolen.json()).code, 'INVALID_FILE')

  const sent = await call(`/lessons/${TASK}/submissions`, { method: 'POST', guest, body: { text: 'Mi tarea', fileIds: [FILE_OK] } })
  assert.equal(sent.status, 201)
  const { data } = await sent.json()
  assert.equal(data.lessonStatus, 'pending_review')
  assert.equal(data.late, false)
  assert.equal(db.submissions[0].enrollmentId, 'enr-1')
  const again = await call(`/lessons/${TASK}/submissions`, { method: 'POST', guest, body: { text: 'Otra' } })
  assert.equal(again.status, 409)
})

test('media confirm rejects a guest file owned by another guest learner', async () => {
  const asset = { id: FILE_OK, entityType: 'LmsSubmission', uploadedById: null, metadata: { companyId: 'c1', guestLearnerId: 'learner-2' } }
  const media = createLmsMedia({ prisma: { fileAsset: { findFirst: async () => asset } }, supabaseAdmin: { storage: { from: () => ({}) } }, bucket: 'b' })
  await assert.rejects(media.confirm('c1', FILE_OK, { entityType: 'LmsSubmission', uploadedById: null, guestLearnerId: 'learner-1' }), { status: 404 })
})

// ---- grade email (best effort) ------------------------------------------------
const guestRow = () => ({
  id: 'sub-1', status: 'submitted', enrollmentId: 'enr-1', lessonId: 'l1',
  lesson: { id: 'l1', title: 'Tarea', kind: 'assignment', settings: {} },
  enrollment: {
    id: 'enr-1', status: 'active', learner: { id: 'learner-1', displayName: 'Ana', guestTokenHash: 'h', userProfileId: null },
    course: { id: 'course-1', companyId: 'company-1', title: 'Curso', shareEnabled: true, shareToken: 'tok' },
  },
})

test('grade mailer emails the invited guest and never throws', async () => {
  const sent = []
  const prisma = { lmsGuestInvite: { findFirst: async () => ({ email: 'ana@example.com' }) } }
  const mailer = createLmsGuestGradeMailer({ prisma, sendMail: async (mail) => sent.push(mail), appBaseUrl: () => 'https://erp.example.com' })
  const row = guestRow()
  assert.equal(await mailer.graded({ enrollment: row.enrollment, course: row.enrollment.course, lesson: row.lesson, detail: 'tu entrega fue aprobada.' }), true)
  assert.equal(sent[0].to, 'ana@example.com')
  assert.match(sent[0].subject, /Tu tarea fue calificada/)
  assert.match(sent[0].text, /https:\/\/erp\.example\.com\/app\/p\/lms\/curso\/tok/)

  const failing = createLmsGuestGradeMailer({ prisma, sendMail: async () => { throw new Error('smtp down') }, appBaseUrl: () => 'https://erp.example.com' })
  assert.equal(await failing.graded({ enrollment: row.enrollment, course: row.enrollment.course, lesson: row.lesson, detail: 'x' }), false)
  const noInvite = createLmsGuestGradeMailer({ prisma: { lmsGuestInvite: { findFirst: async () => null } }, sendMail: async (mail) => sent.push(mail), appBaseUrl: () => 'https://erp.example.com' })
  assert.equal(await noInvite.graded({ enrollment: row.enrollment, course: row.enrollment.course, lesson: row.lesson, detail: 'x' }), false)
  assert.equal(sent.length, 1)
})

test('grading a guest submission succeeds even when the guest mailer fails', async () => {
  const row = guestRow()
  const prisma = {
    lmsSubmission: {
      findFirst: async () => row,
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => ({ ...row, status: 'approved', fileIds: [] }),
    },
    lmsLessonProgress: { findUnique: async () => null, upsert: async () => ({}), findMany: async () => [] },
    lmsLesson: { findMany: async () => [] },
    lmsCourse: { findUnique: async () => ({ shareSettings: {} }) },
    lmsEnrollment: { update: async () => ({ id: 'enr-1', learner: {} }) },
    fileAsset: { findMany: async () => [] },
    $transaction: async (fn) => fn(prisma),
  }
  const notified = []
  for (const guestMailer of [{ graded: () => { throw new Error('sync boom') } }, { graded: async () => { throw new Error('async boom') } }]) {
    const review = createLmsReviewService({ prisma, notifier: { graded: async (args) => notified.push(args) }, guestMailer })
    const result = await review.gradeSubmission('company-1', 'grader-1', 'sub-1', { decision: 'approve' })
    assert.equal(result.status, 'approved')
  }
  assert.equal(notified[0].recipientId, null)
})
