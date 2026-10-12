// Link between attendance people and HR employees. An attendance person can
// exist without HR (contractors, visitors); when linked, the HR employee (and
// its Runly user, if any) is the same identity. One person per HR employee.
import { AttendanceError, buildSessions, presentAt } from './attendance-core.js'

const HR_SELECT = {
  id: true, employeeCode: true, firstName: true, lastName: true, workEmail: true, jobTitle: true, department: true,
  employmentType: true, status: true, userProfileId: true, enabled: true,
  userProfile: { select: { displayName: true, avatarFileId: true } },
  jobTitleRef: { select: { name: true } },
  departmentRef: { select: { name: true } },
}

export function serializeHr(e) {
  if (!e) return null
  return {
    id: e.id, fullName: [e.firstName, e.lastName].filter(Boolean).join(' '), employeeCode: e.employeeCode ?? null,
    workEmail: e.workEmail ?? null, jobTitle: e.jobTitleRef?.name ?? e.jobTitle ?? null, department: e.departmentRef?.name ?? e.department ?? null,
    employmentType: e.employmentType ?? null, status: e.status, userProfileId: e.userProfileId ?? null, userDisplayName: e.userProfile?.displayName ?? null,
  }
}

export const kindFromEmployment = (employmentType) => (employmentType === 'contractor' ? 'contractor' : 'internal')

// The employee's picture: own cover photo (FileAsset isCover) first, else the linked
// Runly user's avatar - same priority the HR detail screen uses.
async function withPhotos(prisma, rows, signFile) {
  if (!signFile || !rows.length) return rows.map((e) => ({ ...serializeHr(e), avatarUrl: null, photoUrl: null }))
  const covers = await prisma.fileAsset.findMany({ where: { entityType: 'HrEmployee', entityId: { in: rows.map((e) => e.id) }, isCover: true, enabled: true }, select: { id: true, entityId: true } })
  const coverByEmployee = new Map(covers.map((c) => [c.entityId, c.id]))
  return Promise.all(rows.map(async (e) => {
    const fileId = coverByEmployee.get(e.id) ?? e.userProfile?.avatarFileId ?? null
    const [avatarUrl, photoUrl] = fileId ? await Promise.all([signFile(fileId, 'card'), signFile(fileId, 'full')]) : [null, null]
    return { ...serializeHr(e), avatarUrl, photoUrl }
  }))
}

export async function loadHrMap(prisma, companyId, ids, signFile = null) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return new Map()
  const rows = await prisma.hrEmployee.findMany({ where: { companyId, id: { in: unique } }, select: HR_SELECT })
  return new Map((await withPhotos(prisma, rows, signFile)).map((e) => [e.id, e]))
}

export async function attachHr(prisma, companyId, people, signFile = null) {
  const map = await loadHrMap(prisma, companyId, people.map((p) => p.hrEmployeeId), signFile)
  return people.map((p) => ({ ...p, hr: p.hrEmployeeId ? map.get(p.hrEmployeeId) ?? null : null }))
}

// Throws unless the employee exists in the company and is free (or already linked to `exceptPersonId`).
export async function assertLinkable(prisma, companyId, hrEmployeeId, exceptPersonId = null) {
  const employee = await prisma.hrEmployee.findFirst({ where: { id: hrEmployeeId, companyId }, select: HR_SELECT })
  if (!employee) throw new AttendanceError('El colaborador de RH no existe.', 404)
  const taken = await prisma.attPerson.findFirst({ where: { companyId, hrEmployeeId, ...(exceptPersonId ? { id: { not: exceptPersonId } } : {}) }, select: { id: true } })
  if (taken) throw new AttendanceError('Ese colaborador ya está vinculado a otra persona de Asistencia.', 409, 'HR_ALREADY_LINKED')
  return employee
}

export function createAttendanceHr({ prisma }) {
  async function suggestions(companyId, query = {}) {
    const q = String(query.q ?? '').trim().slice(0, 80)
    if (q.length < 2) return []
    const limit = Math.min(Math.max(Number(query.limit) || 8, 1), 20)
    const tokens = q.split(/\s+/).filter(Boolean)
    const rows = await prisma.hrEmployee.findMany({
      where: {
        companyId, enabled: true, status: { not: 'terminated' },
        AND: tokens.map((t) => ({ OR: [
          { firstName: { contains: t, mode: 'insensitive' } }, { lastName: { contains: t, mode: 'insensitive' } },
          { employeeCode: { contains: t, mode: 'insensitive' } }, { workEmail: { contains: t, mode: 'insensitive' } },
        ] })),
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }], take: limit, select: HR_SELECT,
    })
    const linked = await prisma.attPerson.findMany({ where: { companyId, hrEmployeeId: { in: rows.map((r) => r.id) } }, select: { id: true, hrEmployeeId: true } })
    const byEmployee = new Map(linked.map((p) => [p.hrEmployeeId, p.id]))
    return rows.map((r) => ({ ...serializeHr(r), linkedPersonId: byEmployee.get(r.id) ?? null }))
  }

  async function link(companyId, personId, body = {}) {
    const person = await prisma.attPerson.findFirst({ where: { id: personId, companyId } })
    if (!person) throw new AttendanceError('La persona no existe.', 404)
    if (!body.hrEmployeeId) throw new AttendanceError('Selecciona un colaborador de RH.', 400)
    const employee = await assertLinkable(prisma, companyId, body.hrEmployeeId, personId)
    const data = { hrEmployeeId: employee.id }
    if (body.syncProfile) Object.assign(data, { firstName: employee.firstName, lastName: employee.lastName, kind: kindFromEmployment(employee.employmentType) })
    await prisma.attPerson.update({ where: { id: personId }, data })
    return personId
  }

  async function unlink(companyId, personId) {
    const person = await prisma.attPerson.findFirst({ where: { id: personId, companyId }, select: { id: true } })
    if (!person) throw new AttendanceError('La persona no existe.', 404)
    await prisma.attPerson.update({ where: { id: personId }, data: { hrEmployeeId: null } })
    return personId
  }

  async function fromHr(companyId, hrEmployeeId, uniqueCode) {
    const employee = await assertLinkable(prisma, companyId, hrEmployeeId)
    const code = await uniqueCode(companyId, employee)
    const person = await prisma.attPerson.create({ data: { companyId, code, firstName: employee.firstName, lastName: employee.lastName, kind: kindFromEmployment(employee.employmentType), hrEmployeeId: employee.id } })
    return person.id
  }

  // What the HR employee screen shows: shift, presence, week hours, recent punches.
  async function employeeAttendance(companyId, hrEmployeeId) {
    const person = await prisma.attPerson.findFirst({
      where: { companyId, hrEmployeeId },
      include: { credentials: { where: { status: { not: 'revoked' } }, select: { id: true, type: true, label: true, status: true } } },
    })
    if (!person) return null
    const now = new Date()
    const [shift, group, category, recent, week] = await Promise.all([
      person.shiftId ? prisma.attShift.findFirst({ where: { id: person.shiftId, companyId } }) : null,
      person.groupId ? prisma.attGroup.findFirst({ where: { id: person.groupId, companyId }, select: { id: true, name: true } }) : null,
      person.categoryId ? prisma.attCategory.findFirst({ where: { id: person.categoryId, companyId }, select: { id: true, name: true } }) : null,
      prisma.attPunch.findMany({ where: { companyId, personId: person.id }, orderBy: { occurredAt: 'desc' }, take: 10 }),
      prisma.attPunch.findMany({ where: { companyId, personId: person.id, status: { not: 'voided' }, occurredAt: { gte: new Date(now.getTime() - 7 * 86_400_000), lte: now } }, orderBy: { occurredAt: 'asc' } }),
    ])
    const lastValid = recent.find((p) => p.status !== 'voided') ?? null
    return {
      person: { id: person.id, code: person.code, kind: person.kind, enabled: person.enabled, hasPin: Boolean(person.pinHash), shift: shift ? { id: shift.id, name: shift.name, startTime: shift.startTime, endTime: shift.endTime, days: shift.days } : null, group, category },
      credentials: person.credentials,
      presentNow: presentAt(week, now).some((p) => p.personId === person.id),
      lastPunch: lastValid ? { direction: lastValid.direction, occurredAt: lastValid.occurredAt, method: lastValid.method } : null,
      minutesLast7d: buildSessions(week).reduce((n, s) => n + s.minutes, 0),
      recentPunches: recent.slice(0, 5).map((p) => ({ id: p.id, direction: p.direction, occurredAt: p.occurredAt, method: p.method, flags: p.flags, status: p.status })),
    }
  }

  return { suggestions, link, unlink, fromHr, employeeAttendance }
}
