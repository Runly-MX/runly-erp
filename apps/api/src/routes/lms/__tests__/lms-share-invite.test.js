import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LmsError } from '../lms-error.js'
import { guestCertVars, normalizeIntakeAnswers, normalizeIntakeFields, readIntakeFields, slugifyFieldKey } from '../lms-intake-core.js'
import { hashGuestToken, newShareToken, normalizeJoinInput, normalizeShareInput, normalizeShareSettings } from '../lms-share-core.js'
import {
  createAttemptGuard, formatAccessCode, hashAccessCode, normalizeAccessCode, normalizeInviteList, newAccessCode, verifyAccessCode,
} from '../lms-invite-core.js'
import { createLmsGuestService } from '../lms-guest-service.js'
import { createLmsInviteService } from '../lms-invite-service.js'
import { createLmsPublicRouter } from '../lms-public.js'
import { buildCertDocxData, unknownCertTags } from '../lms-cert-docx.js'
import { normalizeCertLayout } from '../lms-cert-pdf-layout.js'
import { buildLmsCourseInviteEmail } from '../../../services/email-templates.js'

// ---- intake form ------------------------------------------------------------
test('intake fields: presets keep their label and type, custom fields get a key, max 5 custom', () => {
  const fields = normalizeIntakeFields([
    { key: 'empresa', label: 'Otra cosa', type: 'number', required: true },
    { label: 'Talla de playera' },
    { key: 'turno', label: 'Turno', type: 'number' },
  ])
  assert.deepEqual(fields[0], { key: 'empresa', label: 'Empresa', type: 'text', required: true, preset: true })
  assert.equal(fields[1].key, 'talla_de_playera')
  assert.equal(fields[2].type, 'number')
  assert.equal(slugifyFieldKey('Área técnica'), 'area_tecnica')
  assert.equal(slugifyFieldKey('123'), 'c_123')
  const six = Array.from({ length: 6 }, (_, i) => ({ label: `Campo ${i}` }))
  assert.throws(() => normalizeIntakeFields(six), /Máximo 5/)
  assert.throws(() => normalizeIntakeFields([{ key: 'nombre', label: 'Nombre' }]), LmsError)
  assert.throws(() => normalizeIntakeFields([{ label: 'X', type: 'date' }]), LmsError)
  assert.throws(() => normalizeIntakeFields([{ key: 'puesto' }, { key: 'puesto' }]), /repetido/)
})

test('share settings: accessMode defaults to open, intake defaults to optional email, explicit [] means name only', () => {
  const base = normalizeShareSettings({})
  assert.equal(base.accessMode, 'open')
  assert.deepEqual(base.intakeFields.map((f) => [f.key, f.required]), [['correo', false]])
  assert.deepEqual(normalizeShareSettings({ intakeFields: [], accessMode: 'invite' }).intakeFields, [])
  assert.equal(normalizeShareSettings({ accessMode: 'secret' }).accessMode, 'open')
  const input = normalizeShareInput({ accessMode: 'invite', intakeFields: [{ key: 'puesto', required: true }] }, { scope: 'preview' })
  assert.deepEqual(input.settings.intakeFields, [{ key: 'puesto', label: 'Puesto', type: 'text', required: true, preset: true }])
  assert.equal(input.settings.scope, 'preview')
  assert.throws(() => normalizeShareInput({ accessMode: 'closed' }), LmsError)
  // Stored junk is dropped, never thrown.
  assert.deepEqual(readIntakeFields([{ key: 'BAD KEY' }, { key: 'x1', label: '' }, { key: 'telefono', required: 'yes' }]).map((f) => f.key), ['telefono'])
})

test('intake answers: required, email, phone, number and length checks; email becomes learner email', () => {
  const fields = normalizeIntakeFields([
    { key: 'correo', required: true }, { key: 'telefono' }, { key: 'numero_empleado', required: true }, { label: 'Edad', type: 'number' },
  ])
  const ok = normalizeJoinInput({ name: 'Ana', answers: { correo: ' ANA@X.MX ', numero_empleado: ' 001 ', telefono: '', edad: '33', extra: 'x' } }, fields)
  assert.deepEqual(ok, { name: 'Ana', email: 'ana@x.mx', profile: { correo: 'ana@x.mx', numero_empleado: '001', edad: '33' } })
  assert.throws(() => normalizeIntakeAnswers(fields, { correo: 'a@b.c' }), /Número de empleado es obligatorio/)
  assert.throws(() => normalizeIntakeAnswers(fields, { correo: 'nope', numero_empleado: '1' }), /correo no es válido/)
  assert.throws(() => normalizeIntakeAnswers(fields, { correo: 'a@b.c', numero_empleado: '1', telefono: '12ab' }), /teléfono/)
  assert.throws(() => normalizeIntakeAnswers(fields, { correo: 'a@b.c', numero_empleado: '1', edad: 'treinta' }), /solo números/)
  assert.throws(() => normalizeIntakeAnswers(fields, { correo: 'a@b.c', numero_empleado: 'x'.repeat(121) }), /120/)
  // A fixed answer (the invited email) wins over what the guest sent.
  assert.equal(normalizeIntakeAnswers(fields, { correo: 'otro@x.mx', numero_empleado: '1' }, { correo: 'inv@x.mx' }).correo, 'inv@x.mx')
})

// ---- access codes -----------------------------------------------------------
test('access codes: 8 unambiguous chars, salted sha256, constant-time verification', () => {
  const code = newAccessCode()
  assert.match(code, /^[A-HJKMNP-Z2-9]{8}$/)
  assert.equal(normalizeAccessCode(` ${formatAccessCode(code).toLowerCase()} `), code)
  assert.equal(normalizeAccessCode('ABC'), null)
  assert.equal(normalizeAccessCode('ABCDEFG0'), null)
  const hash = hashAccessCode(code, 'salt-a')
  assert.match(hash, /^[0-9a-f]{64}$/)
  assert.notEqual(hash, hashAccessCode(code, 'salt-b'))
  assert.equal(verifyAccessCode(formatAccessCode(code), 'salt-a', hash), true)
  assert.equal(verifyAccessCode(code, 'salt-b', hash), false)
  assert.equal(verifyAccessCode('', 'salt-a', hash), false)
  assert.equal(verifyAccessCode(code, 'salt-a', 'short'), false)
})

test('attempt guard locks a key after max failures and clears on success', () => {
  let t = 0
  const guard = createAttemptGuard({ max: 3, windowMs: 1000, lockMs: 5000, now: () => t })
  guard.fail('a'); guard.fail('a')
  assert.equal(guard.lockedFor('a'), 0)
  guard.fail('a')
  assert.equal(guard.lockedFor('a'), 5)
  t = 6000
  assert.equal(guard.lockedFor('a'), 0)
  guard.fail('b'); guard.clear('b')
  assert.equal(guard.failures('b'), 0)
})

test('invite list: dedupes emails, validates, caps names', () => {
  assert.deepEqual(normalizeInviteList({ invites: [{ email: 'A@x.mx', name: ' Ana ' }, { email: 'a@x.mx' }] }), [{ email: 'a@x.mx', name: 'Ana' }])
  assert.throws(() => normalizeInviteList({ invites: [] }), LmsError)
  assert.throws(() => normalizeInviteList({ invites: [{ email: 'nope' }] }), /Correo inválido/)
})

// ---- invite lifecycle over an in-memory prisma -------------------------------
const LESSON = '00000000-0000-7000-8000-000000000001'

function fakeDb(settings) {
  const course = { id: 'course-1', companyId: 'company-1', title: 'Seguridad', status: 'published', enabled: true, sequential: false, shareEnabled: true, shareToken: newShareToken(), shareSettings: settings }
  const sections = [{ id: 's1', title: 'Uno', position: 1, lessons: [{ id: LESSON, kind: 'text', title: 'Intro', enabled: true, required: true, preview: false, settings: {} }] }]
  const learners = [], enrollments = [], invites = []
  const match = (row, where) => Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && 'not' in v ? row[k] !== v.not : (row[k] ?? null) === v))
  const db = {
    course, learners, enrollments, invites,
    lmsCourse: {
      findFirst: async ({ where }) => {
        if (where.shareToken) return where.shareToken === course.shareToken && course.shareEnabled ? course : null
        return where.id === course.id && where.companyId === course.companyId ? course : null
      },
    },
    lmsSection: { findMany: async () => sections },
    lmsLearner: {
      findUnique: async ({ where }) => learners.find((l) => (where.id ? l.id === where.id : l.guestTokenHash === where.guestTokenHash)) ?? null,
      findMany: async ({ where }) => learners.filter((l) => where.id.in.includes(l.id)),
      create: async ({ data }) => { const row = { id: `learner-${learners.length + 1}`, enabled: true, ...data }; learners.push(row); return row },
      update: async ({ where, data }) => Object.assign(learners.find((l) => l.id === where.id), data),
      updateMany: async ({ where, data }) => {
        const rows = learners.filter((l) => l.id === where.id && l.guestTokenHash !== null)
        rows.forEach((row) => Object.assign(row, data))
        return { count: rows.length }
      },
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
    lmsGuestInvite: {
      findUnique: async ({ where }) => (where.linkToken
        ? invites.find((i) => i.linkToken === where.linkToken)
        : invites.find((i) => i.courseId === where.courseId_email.courseId && i.email === where.courseId_email.email)) ?? null,
      findFirst: async ({ where }) => invites.find((i) => match(i, where)) ?? null,
      findMany: async ({ where }) => invites.filter((i) => i.courseId === where.courseId && (!where.email || where.email.in.includes(i.email))),
      create: async ({ data }) => { const row = { id: `00000000-0000-7000-9000-${String(invites.length + 1).padStart(12, '0')}`, learnerId: null, lastUsedAt: null, createdAt: new Date(), ...data }; invites.push(row); return row },
      update: async ({ where, data }) => Object.assign(invites.find((i) => i.id === where.id), data),
      updateMany: async ({ where, data }) => {
        const rows = invites.filter((i) => match(i, where))
        rows.forEach((row) => Object.assign(row, data))
        return { count: rows.length }
      },
    },
    lmsLessonProgress: { findMany: async () => [] },
    company: { findUnique: async () => ({ name: 'Acme', brandingConfig: null }) },
    fileAsset: { findMany: async () => [] },
    $transaction: async (fn) => fn(db),
  }
  return db
}

function build({ settings = { accessMode: 'invite', intakeFields: [{ key: 'correo' }, { key: 'empresa', required: true }] }, sendMail = null } = {}) {
  const db = fakeDb(settings)
  const learn = { resolveMedia: async () => ({ mediaUrl: null, media: null, poster: null }) }
  const guestService = createLmsGuestService({ prisma: db, learn, attemptGuard: createAttemptGuard({ max: 3 }) })
  const app = createLmsPublicRouter({ prisma: db, service: {}, guestService })
  const call = (path, { method = 'GET', guest, body } = {}) => app.request(`http://localhost/public/lms/share/${db.course.shareToken}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(guest ? { authorization: `Guest ${guest}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const mails = []
  const invitesSvc = createLmsInviteService({
    prisma: db,
    sendMail: sendMail ? async (mail) => { mails.push(mail); return sendMail(mail) } : null,
    buildMail: buildLmsCourseInviteEmail,
    appBaseUrl: () => 'https://erp.example.com',
  })
  return { db, call, invitesSvc, mails }
}

test('invites without SMTP are created and return the link and code to share by hand', async () => {
  const { db, invitesSvc } = build()
  const result = await invitesSvc.createInvites('company-1', 'admin-1', 'course-1', { invites: [{ email: 'Ana@x.mx', name: 'Ana' }] })
  assert.equal(result.mailConfigured, false)
  const [entry] = result.created
  assert.equal(entry.sent, false)
  assert.equal(entry.mailError.code, 'MAIL_OFF')
  assert.match(entry.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  assert.equal(entry.link, `https://erp.example.com/app/p/lms/curso/${db.course.shareToken}?i=${db.invites[0].linkToken}`)
  assert.equal(entry.invite.status, 'pending')
  assert.ok(!JSON.stringify(db.invites).includes(entry.code.replace('-', '')))
  const again = await invitesSvc.createInvites('company-1', 'admin-1', 'course-1', { invites: [{ email: 'ana@x.mx' }] })
  assert.equal(again.created.length, 0)
  assert.equal(again.skipped.length, 1)
})

test('invites with SMTP send a branded mail; a failing send falls back to manual delivery', async () => {
  const ok = build({ sendMail: async () => {} })
  const sent = await ok.invitesSvc.createInvites('company-1', 'admin-1', 'course-1', { invites: [{ email: 'bo@x.mx' }] })
  assert.equal(sent.created[0].sent, true)
  assert.ok(ok.db.invites[0].sentAt)
  assert.equal(ok.mails[0].to, 'bo@x.mx')
  assert.ok(ok.mails[0].text.includes(sent.created[0].code))
  assert.equal(ok.mails[0].companyId, 'company-1')
  const bad = build({ sendMail: async () => { throw new Error('ECONNREFUSED') } })
  const failed = await bad.invitesSvc.createInvites('company-1', 'admin-1', 'course-1', { invites: [{ email: 'bo@x.mx' }] })
  assert.equal(failed.created[0].sent, false)
  assert.equal(failed.created[0].mailError.code, 'MAIL_FAILED')
  assert.equal(bad.db.invites[0].sentAt, null)
})

test('invite lifecycle: first entry with intake, resume on another device, wrong codes lock, revoke cuts access', async () => {
  const { db, call, invitesSvc } = build()
  const { created: [entry] } = await invitesSvc.createInvites('company-1', 'admin-1', 'course-1', { invites: [{ email: 'ana@x.mx', name: 'Ana' }] })
  const i = db.invites[0].linkToken

  // Free joining is closed on an invite-only link.
  const join = await call('/join', { method: 'POST', body: { name: 'Intrusa' } })
  assert.equal(join.status, 403)
  assert.equal((await join.json()).code, 'INVITE_ONLY')

  // Code ok, no profile yet -> the intake form.
  const step1 = await (await call('/access', { method: 'POST', body: { i, code: entry.code } })).json()
  assert.deepEqual(step1.data, { needsProfile: true, guest: { name: 'Ana', email: 'ana@x.mx' } })
  assert.equal((await call('/access', { method: 'POST', body: { i, code: entry.code, name: 'Ana Ruiz', answers: {} } })).status, 400)
  const step2 = await (await call('/access', { method: 'POST', body: { i, code: entry.code, name: 'Ana Ruiz', answers: { empresa: 'Contratista SA', correo: 'otra@x.mx' } } })).json()
  const first = step2.data.guestToken
  assert.equal(step2.data.resumed, false)
  assert.equal(db.learners[0].email, 'ana@x.mx')
  assert.deepEqual(db.learners[0].guestProfile, { correo: 'ana@x.mx', empresa: 'Contratista SA' })
  assert.equal(db.invites[0].learnerId, db.learners[0].id)
  assert.equal(db.enrollments[0].source, 'share')
  assert.equal((await call('/me', { guest: first })).status, 200)

  // Another device: email + code -> new token, the first one is signed out.
  const resumed = await (await call('/access', { method: 'POST', body: { email: 'ANA@x.mx', code: entry.code } })).json()
  assert.equal(resumed.data.resumed, true)
  assert.equal(db.learners.length, 1)
  assert.equal(db.learners[0].guestTokenHash, hashGuestToken(resumed.data.guestToken))
  assert.equal((await call('/me', { guest: first })).status, 401)
  assert.equal((await call('/me', { guest: resumed.data.guestToken })).status, 200)

  // Unknown email and wrong code answer the same; 3 failures lock the invite.
  const unknown = await call('/access', { method: 'POST', body: { email: 'nadie@x.mx', code: entry.code } })
  assert.equal(unknown.status, 401)
  for (let n = 0; n < 3; n += 1) assert.equal((await call('/access', { method: 'POST', body: { i, code: 'AAAA-AAAA' } })).status, 401)
  const locked = await call('/access', { method: 'POST', body: { i, code: entry.code } })
  assert.equal(locked.status, 429)
  assert.equal((await locked.json()).code, 'INVITE_LOCKED')

  // Revoke: the live session and the code stop working at once.
  const revoked = await invitesSvc.revokeInvite('company-1', 'course-1', db.invites[0].id)
  assert.equal(revoked.status, 'revoked')
  assert.equal((await call('/me', { guest: resumed.data.guestToken })).status, 401)
  db.learners[0].guestTokenHash = hashGuestToken(resumed.data.guestToken) // even with the old token restored
  const me = await call('/me', { guest: resumed.data.guestToken })
  assert.equal(me.status, 403)
  assert.equal((await me.json()).code, 'GUEST_REMOVED')
})

test('resend issues a new code; the old one stops working', async () => {
  const { db, call, invitesSvc } = build()
  const { created: [entry] } = await invitesSvc.createInvites('company-1', 'admin-1', 'course-1', { invites: [{ email: 'leo@x.mx' }] })
  const again = await invitesSvc.resendInvite('company-1', 'course-1', db.invites[0].id)
  assert.notEqual(again.code, entry.code)
  assert.equal(again.link, entry.link)
  const i = db.invites[0].linkToken
  assert.equal((await call('/access', { method: 'POST', body: { i, code: entry.code } })).status, 401)
  assert.equal((await call('/access', { method: 'POST', body: { i, code: again.code } })).status, 200)
})

test('open links validate the intake form on join and store the answers', async () => {
  const { db, call } = build({ settings: { accessMode: 'open', intakeFields: [{ key: 'numero_empleado', required: true }, { key: 'planta', label: 'Planta' }] } })
  assert.equal((await call('/join', { method: 'POST', body: { name: 'Leo' } })).status, 400)
  const res = await call('/join', { method: 'POST', body: { name: 'Leo', answers: { numero_empleado: '77', planta: 'Norte' } } })
  assert.equal(res.status, 200)
  assert.deepEqual(db.learners[0].guestProfile, { numero_empleado: '77', planta: 'Norte' })
  assert.equal(db.learners[0].email, null)
})

// ---- certificates -----------------------------------------------------------
test('guest certificate tags: preset tags, campo_<key>, docx data, contract and PDF layout keys', () => {
  const vars = guestCertVars({ empresa: 'Contratista SA', numero_empleado: '77', correo: 'a@x.mx', planta: 'Norte' })
  assert.deepEqual(vars, { empresa_alumno: 'Contratista SA', numero_empleado: '77', puesto: '', campo_planta: 'Norte' })
  const data = buildCertDocxData({ certificate: { learnerName: 'Leo', courseTitle: 'C', folio: '2026-000001', hours: 1, issuedAt: new Date() }, guestVars: vars })
  assert.equal(data.empresa_alumno, 'Contratista SA')
  assert.equal(data.campo_planta, 'Norte')
  assert.equal(data.alumno, 'Leo')
  assert.deepEqual(unknownCertTags(['empresa_alumno', 'numero_empleado', 'puesto', 'campo_planta', 'campo_', 'otra']), ['campo_', 'otra'])
  const page = { width: 600, height: 400 }
  const layout = normalizeCertLayout([{ key: 'empresa_alumno', x: 10, y: 10, w: 100, h: 20 }, { key: 'campo_planta', x: 10, y: 40, w: 100, h: 20 }], page)
  assert.deepEqual(layout.fields.map((f) => f.key), ['empresa_alumno', 'campo_planta'])
  assert.throws(() => normalizeCertLayout([{ key: 'campo_X', x: 0, y: 0, w: 50, h: 20 }], page), /desconocido/)
})

test('invite email: Spanish, branded, with link and code', () => {
  const mail = buildLmsCourseInviteEmail({ courseTitle: 'Seguridad', inviteUrl: 'https://erp.example.com/app/p/lms/curso/x?i=y', accessCode: 'ABCD-EFGH', name: 'Ana', brand: { name: 'Acme' } })
  assert.match(mail.subject, /Invitación al curso Seguridad · Acme/)
  assert.ok(mail.html.includes('ABCD-EFGH'))
  assert.ok(mail.text.includes('https://erp.example.com/app/p/lms/curso/x?i=y'))
})
