// Daily hours, overtime review and forgotten-punch corrections (admin + self-service).
import { AttendanceError, buildSessions } from './attendance-core.js'
import { addDays, computeDays, daysBetween, localParts, planForDay, totalsOf } from './attendance-days.js'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const MAX_RANGE_DAYS = 93
const text = (v, max = 300) => (v == null ? null : String(v).trim().slice(0, max) || null)

// Where the person is relative to their shift right now (company timezone):
// on_shift | before_shift | after_shift | rest_day | no_shift, plus today's plan and the next start.
export function shiftStatus(shift, tz, now = new Date()) {
  if (!shift) return { state: 'no_shift' }
  const here = localParts(now, tz)
  const plan = planForDay(shift, here.weekday)
  if (!plan) {
    for (let i = 1; i <= 7; i += 1) {
      const next = planForDay(shift, (here.weekday + i) % 7)
      if (next) return { state: 'rest_day', nextDay: addDays(here.day, i), nextStart: next.start, nextEnd: next.end }
    }
    return { state: 'rest_day' }
  }
  const base = { start: plan.start, end: plan.end, expectedMinutes: plan.expectedMinutes }
  if (here.minutes < plan.startMin) return { state: 'before_shift', ...base, minutesToStart: plan.startMin - here.minutes }
  if (here.minutes >= plan.endMin) return { state: 'after_shift', ...base }
  return { state: 'on_shift', ...base, minutesLeft: plan.endMin - here.minutes }
}

export function createAttendanceHours({ prisma, getSettings }) {
  function parseRange(q = {}, tz) {
    const today = localParts(new Date(), tz).day
    const to = DAY.test(q.to ?? '') ? q.to : today
    const from = DAY.test(q.from ?? '') ? q.from : addDays(to, -6)
    if (from > to) throw new AttendanceError('El rango de fechas no es válido.', 400)
    if (daysBetween(from, to).length > MAX_RANGE_DAYS) throw new AttendanceError('El rango máximo es de 93 días.', 400)
    return { from, to }
  }

  // Punch window that covers whole local days (+ margin for overnight sessions).
  const windowOf = ({ from, to }) => ({ gte: new Date(new Date(`${addDays(from, -1)}T00:00:00Z`).getTime() - 12 * 3_600_000), lte: new Date(new Date(`${addDays(to, 2)}T00:00:00Z`).getTime() + 12 * 3_600_000) })

  async function loadShifts(companyId) {
    return new Map((await prisma.attShift.findMany({ where: { companyId } })).map((s) => [s.id, s]))
  }

  async function daysFor(companyId, personIds, range, settings) {
    const [people, shifts, punches, reviewRows] = await Promise.all([
      prisma.attPerson.findMany({ where: { companyId, id: { in: personIds }, }, select: { id: true, shiftId: true } }),
      loadShifts(companyId),
      prisma.attPunch.findMany({ where: { companyId, personId: { in: personIds }, status: { not: 'voided' }, occurredAt: windowOf(range) }, orderBy: { occurredAt: 'asc' } }),
      prisma.attDayReview.findMany({ where: { companyId, personId: { in: personIds }, day: { gte: range.from, lte: range.to } } }),
    ])
    const reviews = new Map(reviewRows.map((r) => [`${r.personId}|${r.day}`, r]))
    return computeDays({ punches, people, shifts, reviews, rules: settings, tz: settings.timezone, ...range })
  }

  // Admin report: one row per person with totals, plus the per-day rows.
  async function report(companyId, q = {}) {
    const settings = await getSettings(companyId)
    const range = parseRange(q, settings.timezone)
    const where = { companyId, enabled: true }
    if (q.personId) where.id = q.personId
    if (q.groupId) where.groupId = q.groupId
    if (q.categoryId) where.categoryId = q.categoryId
    const people = await prisma.attPerson.findMany({ where, select: { id: true, code: true, firstName: true, lastName: true, kind: true, groupId: true, categoryId: true, shiftId: true }, orderBy: [{ firstName: 'asc' }], take: 500 })
    const days = await daysFor(companyId, people.map((p) => p.id), range, settings)
    const byPerson = new Map()
    for (const d of days) byPerson.set(d.personId, [...(byPerson.get(d.personId) ?? []), d])
    const rows = people.map((p) => ({ person: p, totals: totalsOf(byPerson.get(p.id) ?? []), days: byPerson.get(p.id) ?? [] }))
      .filter((r) => r.days.length || q.includeEmpty === 'true')
    return { ...range, timezone: settings.timezone, requireOvertimeApproval: settings.requireOvertimeApproval, rows, totals: totalsOf(days) }
  }

  async function reviewDay(companyId, actorId, body = {}) {
    if (!DAY.test(body.day ?? '')) throw new AttendanceError('El día no es válido.', 400)
    if (!['approved', 'rejected', 'clear'].includes(body.status)) throw new AttendanceError('Elige aprobar o rechazar.', 400)
    const person = await prisma.attPerson.findFirst({ where: { id: body.personId, companyId }, select: { id: true } })
    if (!person) throw new AttendanceError('La persona no existe.', 404)
    if (body.status === 'clear') { await prisma.attDayReview.deleteMany({ where: { personId: person.id, day: body.day } }); return { cleared: true } }
    let approvedMinutes = null
    if (body.status === 'approved' && body.approvedMinutes != null) {
      approvedMinutes = Number(body.approvedMinutes)
      if (!Number.isInteger(approvedMinutes) || approvedMinutes < 0 || approvedMinutes > 960) throw new AttendanceError('Los minutos aprobados no son válidos.', 400)
    }
    const data = { companyId, status: body.status, approvedMinutes, note: text(body.note), reviewedById: actorId, reviewedAt: new Date() }
    return prisma.attDayReview.upsert({ where: { personId_day: { personId: person.id, day: body.day } }, update: data, create: { ...data, personId: person.id, day: body.day } })
  }

  // ---- corrections ("I forgot to punch") ----
  async function listCorrections(companyId, q = {}) {
    const where = { companyId }
    if (['pending', 'approved', 'rejected'].includes(q.status)) where.status = q.status
    if (q.personId) where.personId = q.personId
    const rows = await prisma.attCorrection.findMany({ where, orderBy: { requestedAt: 'desc' }, take: Math.min(Number(q.limit) || 200, 500) })
    const people = await prisma.attPerson.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.personId))] } }, select: { id: true, code: true, firstName: true, lastName: true, groupId: true } })
    const byId = new Map(people.map((p) => [p.id, p]))
    return rows.map((r) => ({ ...r, person: byId.get(r.personId) ?? null }))
  }

  async function pendingCorrectionCount(companyId) {
    return prisma.attCorrection.count({ where: { companyId, status: 'pending' } })
  }

  async function createCorrection({ companyId, personId, direction, occurredAt, reason }) {
    const settings = await getSettings(companyId)
    if (!settings.allowCorrections) throw new AttendanceError('Tu empresa no permite solicitar checadas olvidadas.', 403, 'CORRECTIONS_OFF')
    if (!['in', 'out'].includes(direction)) throw new AttendanceError('Elige entrada o salida.', 400)
    const when = new Date(occurredAt)
    if (Number.isNaN(when.getTime())) throw new AttendanceError('La fecha y hora no son válidas.', 400)
    const now = Date.now()
    if (when.getTime() > now + 5 * 60_000) throw new AttendanceError('No puedes pedir una checada en el futuro.', 400)
    if (when.getTime() < now - 14 * 86_400_000) throw new AttendanceError('Solo puedes pedir checadas de los últimos 14 días.', 400)
    const open = await prisma.attCorrection.count({ where: { personId, status: 'pending' } })
    if (open >= 10) throw new AttendanceError('Tienes demasiadas solicitudes pendientes. Espera a que las revisen.', 429)
    const dup = await prisma.attCorrection.findFirst({ where: { personId, status: 'pending', direction, occurredAt: when }, select: { id: true } })
    if (dup) throw new AttendanceError('Ya enviaste esa solicitud.', 409)
    return prisma.attCorrection.create({ data: { companyId, personId, direction, occurredAt: when, reason: text(reason, 500) } })
  }

  async function resolveCorrection(companyId, actorId, id, body = {}) {
    const row = await prisma.attCorrection.findFirst({ where: { id, companyId } })
    if (!row) throw new AttendanceError('La solicitud no existe.', 404)
    if (row.status !== 'pending') throw new AttendanceError('Esta solicitud ya fue resuelta.', 409)
    if (!['approved', 'rejected'].includes(body.status)) throw new AttendanceError('Elige aprobar o rechazar.', 400)
    let punchId = null
    if (body.status === 'approved') {
      const punch = await prisma.attPunch.create({
        data: { companyId, personId: row.personId, direction: row.direction, occurredAt: row.occurredAt, method: 'manual', flags: ['manual', 'correction'], status: 'valid', note: text(row.reason) ? `Solicitud: ${row.reason}` : 'Solicitud de checada olvidada', createdById: actorId },
      })
      punchId = punch.id
    }
    return prisma.attCorrection.update({ where: { id }, data: { status: body.status, resolvedAt: new Date(), resolvedById: actorId, resolutionNote: text(body.note), punchId } })
  }

  // ---- self-service summary for the phone ----
  async function mySummary(companyId, personId) {
    const settings = await getSettings(companyId)
    const today = localParts(new Date(), settings.timezone).day
    const monthStart = `${today.slice(0, 8)}01`
    const weekStart = addDays(today, -((localParts(new Date(), settings.timezone).weekday + 6) % 7)) // Monday
    const range = { from: monthStart < weekStart ? monthStart : weekStart, to: today }
    const days = await daysFor(companyId, [personId], range, settings)
    const inRange = (from) => days.filter((d) => d.day >= from)
    const person = await prisma.attPerson.findFirst({ where: { id: personId, companyId }, select: { shiftId: true } })
    const [shift, recent, corrections] = await Promise.all([
      person?.shiftId ? prisma.attShift.findFirst({ where: { id: person.shiftId, companyId } }) : null,
      prisma.attPunch.findMany({ where: { companyId, personId, status: { not: 'voided' } }, orderBy: { occurredAt: 'desc' }, take: 8, select: { id: true, direction: true, occurredAt: true, method: true } }),
      prisma.attCorrection.findMany({ where: { personId }, orderBy: { requestedAt: 'desc' }, take: 40, select: { id: true, direction: true, occurredAt: true, status: true, reason: true, resolutionNote: true, requestedAt: true, resolvedAt: true } }),
    ])
    const lastPunch = recent[0] ?? null
    const shiftNow = shiftStatus(shift, settings.timezone)
    const slim = (d) => ({ day: d.day, weekday: d.weekday, workedMinutes: d.workedMinutes, expectedMinutes: d.expectedMinutes, overtimeMinutes: d.overtimeMinutes, countedOvertimeMinutes: d.countedOvertimeMinutes, overtimeStatus: d.overtimeStatus, lateMinutes: d.lateMinutes, earlyLeaveMinutes: d.earlyLeaveMinutes, absent: d.absent, restDay: d.restDay, openSession: d.openSession, firstIn: d.firstIn, lastOut: d.lastOut })
    return {
      timezone: settings.timezone, today, allowCorrections: settings.allowCorrections, requireOvertimeApproval: settings.requireOvertimeApproval,
      shiftNow,
      shift: shift ? { name: shift.name, breakMinutes: shift.breakMinutes ?? 0, dayHours: shift.dayHours ?? null, startTime: shift.startTime, endTime: shift.endTime, days: shift.days } : null,
      insideNow: lastPunch?.direction === 'in',
      week: { from: weekStart, totals: totalsOf(inRange(weekStart)) },
      month: { from: monthStart, totals: totalsOf(inRange(monthStart)) },
      days: days.filter((d) => d.day >= weekStart).map(slim).reverse(),
      recentPunches: recent, corrections,
    }
  }

  return { report, daysFor, reviewDay, listCorrections, pendingCorrectionCount, createCorrection, resolveCorrection, mySummary, buildSessions }
}
