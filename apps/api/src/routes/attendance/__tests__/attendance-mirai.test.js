import test from 'node:test'
import assert from 'node:assert/strict'
import { createAttendanceMiraiCapabilities } from '../mirai-capabilities.js'

const fakeService = {
  listPeople: async () => [{ id: 'p1', code: 'E1', firstName: 'Ana', lastName: 'Ruiz', kind: 'contractor', groupId: 'g1', categoryId: null, shiftId: 's1', hr: { fullName: 'Ana Ruiz' } }],
  presence: async () => ({ total: 10, present: [{ personId: 'p1', firstName: 'Ana', lastName: 'Ruiz', code: 'E1', since: '2026-10-11T08:00:00Z' }], counts: { total: 1, byKind: { contractor: 1 }, byGroup: { g1: 1 }, byCategory: {} } }),
  compliance: async () => ({ rows: [{ quotaId: 'q', name: 'Soldadores', groupId: 'g1', categoryId: null, required: 3, present: 1, attended: 2, missing: 2, applies: true, ok: false }] }),
  hours: async () => ({ from: 'a', to: 'b', totalMinutes: 90, rows: [{ person: { id: 'p1', firstName: 'Ana', code: 'E1' }, minutes: 90, sessions: 1, openSessions: 0 }] }),
}
const fakeHours = {
  report: async (_companyId, q) => ({
    from: q.from ?? '2026-10-05', to: q.to ?? '2026-10-11', timezone: 'America/Mexico_City', requireOvertimeApproval: true,
    totals: { workedMinutes: 1200, countedOvertimeMinutes: 60, pendingOvertimeMinutes: 120, lateDays: 2, earlyLeaveDays: 0, absentDays: 1 },
    rows: [
      { person: { id: 'p2', firstName: 'Beto', code: 'E2' }, totals: { workedMinutes: 600, expectedMinutes: 600, overtimeMinutes: 0, countedOvertimeMinutes: 0, pendingOvertimeMinutes: 0, lateDays: 2, earlyLeaveDays: 0, absentDays: 1 } },
      { person: { id: 'p1', firstName: 'Ana', code: 'E1' }, totals: { workedMinutes: 600, expectedMinutes: 480, overtimeMinutes: 180, countedOvertimeMinutes: 60, pendingOvertimeMinutes: 120, lateDays: 0, earlyLeaveDays: 0, absentDays: 0 } },
    ],
  }),
}
const fakePrisma = {
  attShift: { findMany: async () => [{ id: 's1', name: 'Matutino', startTime: '08:00', endTime: '16:00' }] },
  attGroup: { findMany: async () => [{ id: 'g1', name: 'Contratista Uno' }] },
  attCategory: { findMany: async () => [] },
}

test('MirAI attendance tools answer from the service and are all gated by attendance.view', async () => {
  const cap = createAttendanceMiraiCapabilities({ prisma: fakePrisma, service: fakeService, hoursService: fakeHours })
  assert.equal(cap.moduleKey, 'runly.attendance')
  assert.deepEqual(cap.actions, [])
  assert.ok(cap.tools.every((t) => t.permission === 'attendance.view'))
  const byName = Object.fromEntries(cap.tools.map((t) => [t.name, t]))
  const presence = await byName.attendance_presence_now.run({}, { companyId: 'c' })
  assert.equal(presence.presentes, 1)
  assert.equal(presence.porGrupo[0].nombre, 'Contratista Uno')
  const quotas = await byName.attendance_quota_compliance.run({}, { companyId: 'c' })
  assert.equal(quotas.incumplidas, 1)
  assert.equal(quotas.cuotas[0].faltan, 2)
  const status = await byName.attendance_person_status.run({ search: 'ana' }, { companyId: 'c' })
  assert.equal(status.personas[0].presenteAhora, true)
  assert.equal(status.personas[0].turno, 'Matutino (08:00-16:00)')
  assert.equal(status.personas[0].vinculadaARH, true)
  const hours = await byName.attendance_hours.run({}, { companyId: 'c' })
  assert.equal(hours.horasTotales, 1.5)
})
