import crypto from 'node:crypto'
import {
  AttendanceError, buildSessions, computeCompliance, hashPin, normalizeUid, presentAt, randomToken,
} from './attendance-core.js'
import { assertLinkable, attachHr, createAttendanceHr, kindFromEmployment, photosByPerson } from './attendance-hr.js'

// text: undefined stays undefined (untouched on update), blank becomes null. req: for NOT NULL columns.
const text = (v, max = 200) => (v === undefined ? undefined : v == null ? null : String(v).trim().slice(0, max) || null)
const req = (v, max = 200) => text(v, max) ?? undefined
const uuidOrNull = (v) => (v ? String(v) : null)
const intOr = (v, fallback) => (Number.isInteger(Number(v)) && v !== '' && v != null ? Number(v) : fallback)
const days = (v) => (Array.isArray(v) ? [...new Set(v.map(Number).filter((d) => d >= 0 && d <= 6))].sort() : undefined)
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
// { "1": { start, end }, ... } with valid weekdays/times; null clears it; undefined leaves it untouched.
function dayHours(v) {
  if (v === undefined) return undefined
  if (v === null) return null
  if (typeof v !== 'object') return undefined
  const out = {}
  for (const [k, w] of Object.entries(v)) {
    if (!/^[0-6]$/.test(k) || !w || !HHMM.test(w.start ?? '') || !HHMM.test(w.end ?? '')) continue
    out[k] = { start: w.start, end: w.end }
  }
  return Object.keys(out).length ? out : null
}
const PERSON_KINDS = ['internal', 'contractor', 'visitor']
const ENROLL_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

// Whitelisted writable fields per catalog. `required` are checked on create.
const CATALOGS = {
  sites: {
    model: 'attSite', label: 'sitio', required: ['name'],
    pick: (b) => ({
      name: req(b.name, 120), address: text(b.address, 300), timezone: req(b.timezone, 60),
      latitude: b.latitude == null || b.latitude === '' ? null : Number(b.latitude),
      longitude: b.longitude == null || b.longitude === '' ? null : Number(b.longitude),
      radiusM: b.radiusM == null || b.radiusM === '' ? null : intOr(b.radiusM, null), enabled: b.enabled,
    }),
  },
  groups: {
    model: 'attGroup', label: 'grupo', required: ['name'],
    pick: (b) => ({ name: req(b.name, 120), kind: b.kind === 'internal' ? 'internal' : b.kind === 'contractor' ? 'contractor' : undefined, notes: text(b.notes, 1000), enabled: b.enabled }),
  },
  categories: { model: 'attCategory', label: 'categoría', required: ['name'], pick: (b) => ({ name: req(b.name, 120), enabled: b.enabled }) },
  shifts: {
    model: 'attShift', label: 'turno', required: ['name', 'startTime', 'endTime'],
    pick: (b) => ({
      name: req(b.name, 120), startTime: HHMM.test(b.startTime ?? '') ? b.startTime : undefined, endTime: HHMM.test(b.endTime ?? '') ? b.endTime : undefined,
      days: days(b.days), graceMinutes: b.graceMinutes == null ? undefined : Math.max(0, Math.min(240, intOr(b.graceMinutes, 10))), enabled: b.enabled,
      breakMinutes: b.breakMinutes == null ? undefined : Math.max(0, Math.min(240, intOr(b.breakMinutes, 0))), dayHours: dayHours(b.dayHours),
    }),
  },
  quotas: {
    model: 'attQuota', label: 'cuota', required: ['minCount'],
    pick: (b) => ({
      name: req(b.name, 120), groupId: b.groupId === undefined ? undefined : uuidOrNull(b.groupId), categoryId: b.categoryId === undefined ? undefined : uuidOrNull(b.categoryId),
      siteId: b.siteId === undefined ? undefined : uuidOrNull(b.siteId), minCount: b.minCount == null ? undefined : Math.max(0, intOr(b.minCount, 0)), days: days(b.days), enabled: b.enabled,
    }),
  },
}

const defined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
const isUnique = (e) => e?.code === 'P2002'

export function createAttendanceService({ prisma, signFile = null }) {
  const hrLink = createAttendanceHr({ prisma })
  async function catalogList(kind, companyId) {
    const cfg = CATALOGS[kind]
    return prisma[cfg.model].findMany({ where: { companyId }, orderBy: kind === 'quotas' ? { createdAt: 'desc' } : { name: 'asc' } })
  }

  async function catalogSave(kind, companyId, id, body) {
    const cfg = CATALOGS[kind]
    const data = defined(cfg.pick(body ?? {}))
    if (kind === 'shifts' && data.dayHours) data.days = Object.keys(data.dayHours).map(Number).sort()
    if (kind === 'shifts' && data.dayHours && !data.startTime) { const first = Object.values(data.dayHours)[0]; data.startTime = first.start; data.endTime = first.end }
    if (!id) {
      for (const key of cfg.required) if (data[key] == null) throw new AttendanceError(`Falta el campo obligatorio (${key}) del ${cfg.label}.`, 400)
    } else if (Object.keys(data).length === 0) throw new AttendanceError('No hay cambios que guardar.', 400)
    try {
      if (!id) return await prisma[cfg.model].create({ data: { companyId, ...data } })
      const found = await prisma[cfg.model].findFirst({ where: { id, companyId } })
      if (!found) throw new AttendanceError(`El ${cfg.label} no existe.`, 404)
      return await prisma[cfg.model].update({ where: { id }, data })
    } catch (error) {
      if (isUnique(error)) throw new AttendanceError(`Ya existe un ${cfg.label} con ese nombre.`, 409)
      throw error
    }
  }

  async function catalogRemove(kind, companyId, id) {
    const cfg = CATALOGS[kind]
    const found = await prisma[cfg.model].findFirst({ where: { id, companyId } })
    if (!found) throw new AttendanceError(`El ${cfg.label} no existe.`, 404)
    if (kind === 'quotas') { await prisma.attQuota.delete({ where: { id } }); return { deleted: true } }
    const column = { sites: 'siteId', groups: 'groupId', categories: 'categoryId', shifts: 'shiftId' }[kind]
    const inUse = kind === 'sites'
      ? (await prisma.attKiosk.count({ where: { companyId, siteId: id } })) + (await prisma.attPunch.count({ where: { companyId, siteId: id } }))
      : await prisma.attPerson.count({ where: { companyId, [column]: id } })
    if (inUse > 0) { await prisma[cfg.model].update({ where: { id }, data: { enabled: false } }); return { deleted: false, disabled: true } }
    await prisma[cfg.model].delete({ where: { id } })
    return { deleted: true }
  }

  // ---- people -----------------------------------------------------------
  const personSelect = { credentials: { where: { status: { not: 'revoked' } }, select: { id: true, type: true, uid: true, label: true, status: true, lastUsedAt: true, createdAt: true } } }
  const serializePerson = (p) => {
    const { pinHash, enrollCode, ...rest } = p
    return { ...rest, hasPin: Boolean(pinHash), enrollPending: Boolean(enrollCode && p.enrollExpiresAt && p.enrollExpiresAt > new Date()) }
  }

  function personData(body, { partial }) {
    const data = {
      code: req(body.code, 40), firstName: req(body.firstName, 120), lastName: text(body.lastName, 120),
      kind: PERSON_KINDS.includes(body.kind) ? body.kind : undefined,
      groupId: body.groupId === undefined ? undefined : uuidOrNull(body.groupId),
      categoryId: body.categoryId === undefined ? undefined : uuidOrNull(body.categoryId),
      shiftId: body.shiftId === undefined ? undefined : uuidOrNull(body.shiftId),
      hrEmployeeId: body.hrEmployeeId === undefined ? undefined : uuidOrNull(body.hrEmployeeId),
      photoFileId: body.photoFileId === undefined ? undefined : uuidOrNull(body.photoFileId),
      enabled: body.enabled,
    }
    if (!partial) {
      if (!data.code) throw new AttendanceError('El código de empleado es obligatorio.', 400)
      if (!data.firstName) throw new AttendanceError('El nombre es obligatorio.', 400)
    }
    if (body.pin !== undefined && body.pin !== null && body.pin !== '') {
      if (!/^\d{4,8}$/.test(String(body.pin))) throw new AttendanceError('El PIN debe tener de 4 a 8 dígitos.', 400)
      data.pinHash = hashPin(body.pin)
    }
    if (body.pin === null) data.pinHash = null
    return defined(data)
  }

  async function assertRefs(companyId, data) {
    const checks = [['groupId', 'attGroup'], ['categoryId', 'attCategory'], ['shiftId', 'attShift']]
    for (const [field, model] of checks) {
      if (data[field] && !(await prisma[model].findFirst({ where: { id: data[field], companyId }, select: { id: true } }))) throw new AttendanceError('La referencia seleccionada no existe.', 400)
    }
  }

  async function listPeople(companyId, query = {}) {
    const where = { companyId }
    if (query.kind) where.kind = query.kind
    if (query.groupId) where.groupId = query.groupId
    if (query.categoryId) where.categoryId = query.categoryId
    if (query.enabled === 'true' || query.enabled === 'false') where.enabled = query.enabled === 'true'
    const q = text(query.q, 80)
    if (q) where.OR = [{ code: { contains: q, mode: 'insensitive' } }, { firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }]
    const rows = await prisma.attPerson.findMany({ where, orderBy: [{ firstName: 'asc' }, { code: 'asc' }], take: Math.min(intOr(query.limit, 500), 1000), include: personSelect })
    return attachHr(prisma, companyId, rows.map(serializePerson), signFile)
  }

  async function getPerson(companyId, id) {
    const row = await prisma.attPerson.findFirst({ where: { id, companyId }, include: personSelect })
    if (!row) throw new AttendanceError('La persona no existe.', 404)
    return (await attachHr(prisma, companyId, [serializePerson(row)], signFile))[0]
  }

  async function savePerson(companyId, id, body) {
    const data = personData(body ?? {}, { partial: true })
    await assertRefs(companyId, data)
    if (data.hrEmployeeId) {
      const employee = await assertLinkable(prisma, companyId, data.hrEmployeeId, id)
      if (body?.syncProfile) Object.assign(data, { firstName: employee.firstName, lastName: employee.lastName, kind: kindFromEmployment(employee.employmentType) })
      if (!id) {
        data.firstName ??= employee.firstName
        data.lastName ??= employee.lastName
        data.code ??= (await uniqueCode(companyId, employee)) ?? undefined
      }
    }
    if (!id && (!data.code || !data.firstName)) personData(body ?? {}, { partial: false })
    try {
      if (!id) {
        const created = await prisma.attPerson.create({ data: { companyId, ...data } })
        return getPerson(companyId, created.id)
      }
      const found = await prisma.attPerson.findFirst({ where: { id, companyId }, select: { id: true } })
      if (!found) throw new AttendanceError('La persona no existe.', 404)
      await prisma.attPerson.update({ where: { id }, data })
      return getPerson(companyId, id)
    } catch (error) {
      if (isUnique(error)) throw new AttendanceError('Ya existe una persona con ese código.', 409)
      throw error
    }
  }

  // Employee code when free, else a stable fallback derived from the HR id.
  async function uniqueCode(companyId, employee, taken = null) {
    const used = taken ?? new Set((await prisma.attPerson.findMany({ where: { companyId }, select: { code: true } })).map((p) => p.code))
    let code = text(employee.employeeCode, 40) || `RH-${employee.id.slice(-6).toUpperCase()}`
    if (used.has(code)) code = `${code}-${employee.id.slice(-4).toUpperCase()}`
    return used.has(code) ? null : code
  }

  async function importFromHr(companyId) {
    const employees = await prisma.hrEmployee.findMany({ where: { companyId, enabled: true, status: { not: 'terminated' } }, select: { id: true, employeeCode: true, firstName: true, lastName: true, employmentType: true } })
    const linked = new Set((await prisma.attPerson.findMany({ where: { companyId, hrEmployeeId: { not: null } }, select: { hrEmployeeId: true } })).map((p) => p.hrEmployeeId))
    const codes = new Set((await prisma.attPerson.findMany({ where: { companyId }, select: { code: true } })).map((p) => p.code))
    let created = 0
    for (const employee of employees) {
      if (linked.has(employee.id)) continue
      const code = await uniqueCode(companyId, employee, codes)
      if (!code) continue
      codes.add(code)
      await prisma.attPerson.create({ data: { companyId, code, firstName: employee.firstName, lastName: employee.lastName, kind: kindFromEmployment(employee.employmentType), hrEmployeeId: employee.id } })
      created += 1
    }
    return { created, skipped: employees.length - created }
  }

  async function createEnrollInvite(companyId, personId) {
    const person = await prisma.attPerson.findFirst({ where: { id: personId, companyId } })
    if (!person) throw new AttendanceError('La persona no existe.', 404)
    let code = ''
    for (let i = 0; i < 10; i += 1) code += ENROLL_ALPHABET[crypto.randomInt(0, ENROLL_ALPHABET.length)]
    const expiresAt = new Date(Date.now() + 48 * 3_600_000)
    await prisma.attPerson.update({ where: { id: personId }, data: { enrollCode: code, enrollExpiresAt: expiresAt } })
    return { code, expiresAt }
  }

  async function cancelEnrollInvite(companyId, personId) {
    const person = await prisma.attPerson.findFirst({ where: { id: personId, companyId } })
    if (!person) throw new AttendanceError('La persona no existe.', 404)
    await prisma.attPerson.update({ where: { id: personId }, data: { enrollCode: null, enrollExpiresAt: null } })
    return { cancelled: Boolean(person.enrollCode) }
  }

  // Email address to offer when sending the invite: HR work/personal email of the linked employee.
  async function inviteEmailSuggestion(companyId, personId) {
    const person = await prisma.attPerson.findFirst({ where: { id: personId, companyId }, select: { hrEmployeeId: true } })
    if (!person?.hrEmployeeId) return null
    const e = await prisma.hrEmployee.findFirst({ where: { id: person.hrEmployeeId, companyId }, select: { workEmail: true, personalEmail: true } })
    return e?.workEmail || e?.personalEmail || null
  }

  async function addCardCredential(companyId, personId, body) {
    const person = await prisma.attPerson.findFirst({ where: { id: personId, companyId }, select: { id: true } })
    if (!person) throw new AttendanceError('La persona no existe.', 404)
    const uid = normalizeUid(body?.uid)
    if (uid.length < 4) throw new AttendanceError('El identificador de la tarjeta no es válido.', 400)
    const taken = await prisma.attCredential.findFirst({ where: { companyId, type: 'card', uid, status: { not: 'revoked' } } })
    if (taken) throw new AttendanceError('Esa tarjeta ya está asignada.', 409)
    return prisma.attCredential.create({ data: { companyId, personId, type: 'card', uid, label: text(body?.label, 80), status: 'active' } })
  }

  async function setCredentialStatus(companyId, credentialId, status) {
    const found = await prisma.attCredential.findFirst({ where: { id: credentialId, companyId } })
    if (!found) throw new AttendanceError('La credencial no existe.', 404)
    return prisma.attCredential.update({ where: { id: credentialId }, data: { status } })
  }

  // ---- punches ----------------------------------------------------------
  function punchWhere(companyId, q = {}) {
    const where = { companyId }
    if (q.personId) where.personId = q.personId
    if (q.siteId) where.siteId = q.siteId
    if (q.kioskId) where.kioskId = q.kioskId
    if (q.status) where.status = q.status
    if (q.groupId) where.person = { groupId: q.groupId }
    if (q.from || q.to) where.occurredAt = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) }
    return where
  }

  async function listPunches(companyId, q = {}) {
    const rows = await prisma.attPunch.findMany({
      where: punchWhere(companyId, q), orderBy: { occurredAt: 'desc' }, take: Math.min(intOr(q.limit, 200), 1000),
      include: { person: { select: { id: true, code: true, firstName: true, lastName: true, kind: true, groupId: true, categoryId: true } } },
    })
    if (!signFile) return rows
    // Evidence photos: thumbnail for the table and full size for the viewer (the thumbnail
    // variant is small, so enlarging it looked blurry). Each person also carries the
    // linked HR picture so the avatar is the real photo.
    const photos = await photosByPerson(prisma, companyId, rows.map((r) => r.personId), signFile)
    return Promise.all(rows.map(async (row) => {
      const withPerson = { ...row, person: { ...row.person, ...(photos.get(row.personId) ?? {}) } }
      if (!row.selfieFileId) return withPerson
      const [selfieUrl, selfieFullUrl] = await Promise.all([signFile(row.selfieFileId, 'card'), signFile(row.selfieFileId, 'full')])
      return { ...withPerson, selfieUrl, selfieFullUrl }
    }))
  }

  async function createManualPunch(companyId, actorId, body) {
    const person = await prisma.attPerson.findFirst({ where: { id: body?.personId, companyId }, select: { id: true } })
    if (!person) throw new AttendanceError('La persona no existe.', 404)
    if (!['in', 'out'].includes(body?.direction)) throw new AttendanceError('La dirección debe ser entrada o salida.', 400)
    const occurredAt = new Date(body?.occurredAt ?? Date.now())
    if (Number.isNaN(occurredAt.getTime())) throw new AttendanceError('La fecha no es válida.', 400)
    return prisma.attPunch.create({
      data: { id: body.id ?? undefined, companyId, personId: person.id, siteId: uuidOrNull(body.siteId), direction: body.direction, occurredAt, method: 'manual', note: text(body.note, 500), createdById: actorId, flags: ['manual'], status: 'valid' },
    })
  }

  async function voidPunch(companyId, actorId, id, note) {
    const found = await prisma.attPunch.findFirst({ where: { id, companyId } })
    if (!found) throw new AttendanceError('La checada no existe.', 404)
    return prisma.attPunch.update({ where: { id }, data: { status: 'voided', note: text(note, 500) ?? found.note, createdById: found.createdById ?? actorId } })
  }

  // ---- reports ----------------------------------------------------------
  const range = (q) => {
    const to = q.to ? new Date(q.to) : new Date()
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 24 * 3_600_000)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new AttendanceError('El rango de fechas no es válido.', 400)
    return { from, to }
  }

  async function presence(companyId, q = {}) {
    const at = q.at ? new Date(q.at) : new Date()
    const punches = await prisma.attPunch.findMany({ where: { companyId, occurredAt: { gte: new Date(at.getTime() - 24 * 3_600_000), lte: at }, status: { not: 'voided' } }, orderBy: { occurredAt: 'asc' } })
    const inside = presentAt(punches, at)
    const people = await prisma.attPerson.findMany({ where: { companyId, enabled: true }, select: { id: true, code: true, firstName: true, lastName: true, kind: true, groupId: true, categoryId: true, shiftId: true } })
    const byId = new Map(people.map((p) => [p.id, p]))
    const photos = await photosByPerson(prisma, companyId, inside.map((p) => p.personId), signFile)
    const present = inside.map((p) => ({ ...byId.get(p.personId), ...(photos.get(p.personId) ?? {}), personId: p.personId, since: p.occurredAt, siteId: p.siteId ?? null, method: p.method })).filter((p) => p.id)
    const tally = (key) => present.reduce((acc, p) => { const k = p[key] ?? 'none'; acc[k] = (acc[k] ?? 0) + 1; return acc }, {})
    return { at, total: people.length, present, counts: { total: present.length, byKind: tally('kind'), byGroup: tally('groupId'), byCategory: tally('categoryId') } }
  }

  async function hours(companyId, q = {}) {
    const { from, to } = range(q)
    const punches = await prisma.attPunch.findMany({ where: { ...punchWhere(companyId, q), occurredAt: { gte: from, lte: to } }, orderBy: { occurredAt: 'asc' } })
    const sessions = buildSessions(punches)
    const people = await prisma.attPerson.findMany({ where: { companyId, id: { in: [...new Set(sessions.map((s) => s.personId))] } }, select: { id: true, code: true, firstName: true, lastName: true, kind: true, groupId: true, categoryId: true } })
    const byId = new Map(people.map((p) => [p.id, p]))
    const rows = new Map()
    for (const s of sessions) {
      const row = rows.get(s.personId) ?? { person: byId.get(s.personId) ?? { id: s.personId }, minutes: 0, sessions: 0, openSessions: 0, firstIn: s.start, lastOut: null }
      row.minutes += s.minutes
      row.sessions += 1
      if (s.open) row.openSessions += 1
      if (s.end && (!row.lastOut || new Date(s.end) > new Date(row.lastOut))) row.lastOut = s.end
      rows.set(s.personId, row)
    }
    const photos = await photosByPerson(prisma, companyId, [...rows.keys()], signFile)
    for (const [personId, row] of rows) if (photos.has(personId)) row.person = { ...row.person, ...photos.get(personId) }
    return { from, to, rows: [...rows.values()].sort((a, b) => b.minutes - a.minutes), totalMinutes: [...rows.values()].reduce((n, r) => n + r.minutes, 0), sessions }
  }

  async function compliance(companyId, q = {}) {
    const at = q.at ? new Date(q.at) : new Date()
    const { from, to } = q.from || q.to ? range(q) : { from: new Date(at.getTime() - 24 * 3_600_000), to: at }
    const [quotas, people, punches] = await Promise.all([
      prisma.attQuota.findMany({ where: { companyId, enabled: true } }),
      prisma.attPerson.findMany({ where: { companyId } }),
      prisma.attPunch.findMany({ where: { companyId, occurredAt: { gte: new Date(Math.min(from.getTime(), at.getTime() - 24 * 3_600_000)), lte: to > at ? to : at }, status: { not: 'voided' } }, orderBy: { occurredAt: 'asc' } }),
    ])
    return { at, rows: computeCompliance({ quotas, people, punches, at, from, to }) }
  }

  async function summary(companyId) {
    const [pres, comp, people, kiosks, flagged] = await Promise.all([
      presence(companyId), compliance(companyId),
      prisma.attPerson.count({ where: { companyId, enabled: true } }),
      prisma.attKiosk.findMany({ where: { companyId, enabled: true }, select: { id: true, name: true, lastSeenAt: true, pairedAt: true, revokedAt: true } }),
      prisma.attPunch.count({ where: { companyId, status: 'flagged', occurredAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
    ])
    const pendingCorrections = await prisma.attCorrection.count({ where: { companyId, status: 'pending' } })
    const failing = comp.rows.filter((r) => r.applies && !r.ok)
    return { people, present: pres.counts, quotas: { total: comp.rows.length, failing: failing.length, rows: comp.rows }, kiosks, flaggedLast7d: flagged, pendingCorrections }
  }

  // ---- company policy ---------------------------------------------------
  const RETENTION_CHOICES = [7, 15, 30, 60, 90, 180, 365]
  const DEFAULT_SETTINGS = { evidenceRetentionDays: 30, requirePhotoForQr: true, timezone: 'America/Mexico_City', dailyThresholdMinutes: 480, overtimeRoundingMinutes: 0, requireOvertimeApproval: false, allowCorrections: true }
  const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS)

  async function getSettings(companyId) {
    const row = await prisma.attSettings.findUnique({ where: { companyId } })
    return { ...DEFAULT_SETTINGS, ...(row ? Object.fromEntries(SETTING_KEYS.map((k) => [k, row[k]])) : {}) }
  }

  async function saveSettings(companyId, body = {}) {
    const data = {}
    if (body.evidenceRetentionDays !== undefined) {
      const days = Number(body.evidenceRetentionDays)
      if (!RETENTION_CHOICES.includes(days)) throw new AttendanceError('Elige un periodo de conservación válido.', 400)
      data.evidenceRetentionDays = days
    }
    if (typeof body.requirePhotoForQr === 'boolean') data.requirePhotoForQr = body.requirePhotoForQr
    if (typeof body.requireOvertimeApproval === 'boolean') data.requireOvertimeApproval = body.requireOvertimeApproval
    if (typeof body.allowCorrections === 'boolean') data.allowCorrections = body.allowCorrections
    if (body.dailyThresholdMinutes !== undefined) {
      const m = Number(body.dailyThresholdMinutes)
      if (!Number.isInteger(m) || m < 60 || m > 960) throw new AttendanceError('La jornada diaria debe estar entre 1 y 16 horas.', 400)
      data.dailyThresholdMinutes = m
    }
    if (body.overtimeRoundingMinutes !== undefined) {
      const m = Number(body.overtimeRoundingMinutes)
      if (![0, 5, 10, 15, 30, 60].includes(m)) throw new AttendanceError('El redondeo no es válido.', 400)
      data.overtimeRoundingMinutes = m
    }
    if (body.timezone !== undefined) {
      try { new Intl.DateTimeFormat('en', { timeZone: String(body.timezone) }) } catch { throw new AttendanceError('La zona horaria no es válida.', 400) }
      data.timezone = String(body.timezone)
    }
    if (!Object.keys(data).length) throw new AttendanceError('No hay cambios que guardar.', 400)
    await prisma.attSettings.upsert({ where: { companyId }, update: data, create: { companyId, ...data } })
    return getSettings(companyId)
  }

  // ---- kiosks (admin side) ---------------------------------------------
  const serializeKiosk = ({ deviceTokenHash, pairingSecretHash, ...k }) => ({ ...k, paired: Boolean(deviceTokenHash) && !k.revokedAt, pairingPending: Boolean(k.pairingCode) && !k.approvedAt })

  async function listKiosks(companyId) {
    return (await prisma.attKiosk.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } })).map(serializeKiosk)
  }

  async function saveKiosk(companyId, id, body = {}) {
    const data = defined({
      name: req(body.name, 120), siteId: body.siteId === undefined ? undefined : uuidOrNull(body.siteId),
      mode: ['both', 'in', 'out'].includes(body.mode) ? body.mode : undefined,
      requireSelfie: typeof body.requireSelfie === 'boolean' ? body.requireSelfie : undefined,
      allowPin: typeof body.allowPin === 'boolean' ? body.allowPin : undefined,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
    })
    if (data.siteId && !(await prisma.attSite.findFirst({ where: { id: data.siteId, companyId }, select: { id: true } }))) throw new AttendanceError('El sitio no existe.', 400)
    if (!id) {
      if (!data.name) throw new AttendanceError('El nombre del kiosko es obligatorio.', 400)
      return serializeKiosk(await prisma.attKiosk.create({ data: { companyId, linkToken: randomToken(24), qrSecret: randomToken(32), ...data } }))
    }
    const found = await prisma.attKiosk.findFirst({ where: { id, companyId }, select: { id: true } })
    if (!found) throw new AttendanceError('El kiosko no existe.', 404)
    return serializeKiosk(await prisma.attKiosk.update({ where: { id }, data }))
  }

  async function approveKiosk(companyId, id, code) {
    const kiosk = await prisma.attKiosk.findFirst({ where: { id, companyId } })
    if (!kiosk) throw new AttendanceError('El kiosko no existe.', 404)
    if (!kiosk.pairingCode || String(code ?? '').trim() !== kiosk.pairingCode) throw new AttendanceError('El código de emparejamiento no coincide.', 400, 'BAD_PAIRING_CODE')
    return serializeKiosk(await prisma.attKiosk.update({ where: { id }, data: { approvedAt: new Date() } }))
  }

  // Forget the paired device (or cancel a pending pairing) so a new one can pair.
  async function resetKiosk(companyId, id) {
    const kiosk = await prisma.attKiosk.findFirst({ where: { id, companyId } })
    if (!kiosk) throw new AttendanceError('El kiosko no existe.', 404)
    return serializeKiosk(await prisma.attKiosk.update({
      where: { id },
      data: { deviceTokenHash: null, pairedAt: null, approvedAt: null, pairingCode: null, pairingSecretHash: null, pairingLabel: null, pairingRequestedAt: null, revokedAt: null, linkToken: randomToken(24) },
    }))
  }

  async function revokeKiosk(companyId, id) {
    const kiosk = await prisma.attKiosk.findFirst({ where: { id, companyId } })
    if (!kiosk) throw new AttendanceError('El kiosko no existe.', 404)
    return serializeKiosk(await prisma.attKiosk.update({ where: { id }, data: { revokedAt: new Date(), deviceTokenHash: null } }))
  }

  return {
    catalogList, catalogSave, catalogRemove,
    listPeople, getPerson, savePerson, importFromHr,
    hrSuggestions: (companyId, q) => hrLink.suggestions(companyId, q),
    linkHr: async (companyId, personId, body) => getPerson(companyId, await hrLink.link(companyId, personId, body)),
    unlinkHr: async (companyId, personId) => getPerson(companyId, await hrLink.unlink(companyId, personId)),
    personFromHr: async (companyId, hrEmployeeId) => getPerson(companyId, await hrLink.fromHr(companyId, hrEmployeeId, uniqueCode)),
    employeeAttendance: (companyId, hrEmployeeId) => hrLink.employeeAttendance(companyId, hrEmployeeId),
    uniqueCode, createEnrollInvite, cancelEnrollInvite, inviteEmailSuggestion, addCardCredential, setCredentialStatus,
    listPunches, createManualPunch, voidPunch,
    presence, hours, compliance, summary,
    listKiosks, saveKiosk, approveKiosk, resetKiosk, revokeKiosk,
    getSettings, saveSettings, RETENTION_CHOICES,
    CATALOG_KINDS: Object.keys(CATALOGS),
  }
}
