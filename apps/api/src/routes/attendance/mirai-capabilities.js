// apps/api/src/routes/attendance/mirai-capabilities.js
//
// runly.attendance capability for MirAI (contract:
// docs/ai-context/mirai-module-capabilities.md). Read-only tools over the same
// service the HTTP routes use, so answers never exceed what attendance.view
// returns. No actions: punches are written by kiosks, never from chat.
// publicLookup: not applicable — attendance data is private to the company.
import { createAttendanceService } from './attendance-service.js'

const LIST_MAX = 30
const fullName = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(' ')
const KIND_LABEL = { internal: 'interno', contractor: 'contratista', visitor: 'visitante' }

export function createAttendanceMiraiCapabilities({ prisma, service = null }) {
  const svc = service ?? createAttendanceService({ prisma })

  const names = async (companyId) => {
    const [groups, categories] = await Promise.all([
      prisma.attGroup.findMany({ where: { companyId }, select: { id: true, name: true } }),
      prisma.attCategory.findMany({ where: { companyId }, select: { id: true, name: true } }),
    ])
    return { group: new Map(groups.map((g) => [g.id, g.name])), category: new Map(categories.map((c) => [c.id, c.name])) }
  }

  const attendance_presence_now = {
    name: 'attendance_presence_now',
    permission: 'attendance.view',
    definition: {
      description: 'Quien esta dentro ahora segun las checadas (ultimas 24 h): total y desglose por tipo, grupo/contratista y categoria, mas hasta 30 nombres.',
      parameters: { type: 'object', properties: {} },
    },
    async run(_args, actx) {
      const [report, label] = await Promise.all([svc.presence(actx.companyId), names(actx.companyId)])
      const by = (counts, map) => Object.entries(counts).map(([id, n]) => ({ nombre: map.get(id) ?? 'Sin asignar', presentes: n }))
      return {
        presentes: report.counts.total,
        personalActivo: report.total,
        porTipo: Object.entries(report.counts.byKind).map(([k, n]) => ({ tipo: KIND_LABEL[k] ?? k, presentes: n })),
        porGrupo: by(report.counts.byGroup, label.group),
        porCategoria: by(report.counts.byCategory, label.category),
        personas: report.present.slice(0, LIST_MAX).map((p) => ({ personId: p.personId, nombre: fullName(p), codigo: p.code, desde: p.since })),
      }
    },
  }

  const attendance_quota_compliance = {
    name: 'attendance_quota_compliance',
    permission: 'attendance.view',
    definition: {
      description: 'Cumplimiento de cuotas minimas de contratistas ahora: por cuota, requeridos, presentes, asistentes del dia y cuantos faltan.',
      parameters: { type: 'object', properties: {} },
    },
    async run(_args, actx) {
      const [report, label] = await Promise.all([svc.compliance(actx.companyId), names(actx.companyId)])
      return {
        cuotas: report.rows.map((r) => ({
          cuota: r.name ?? null, grupo: label.group.get(r.groupId) ?? null, categoria: label.category.get(r.categoryId) ?? null,
          requeridos: r.required, presentes: r.present, asistieronHoy: r.attended, faltan: r.missing, aplicaHoy: r.applies, cumple: r.ok,
        })),
        incumplidas: report.rows.filter((r) => r.applies && !r.ok).length,
      }
    },
  }

  const attendance_hours = {
    name: 'attendance_hours',
    permission: 'attendance.view',
    definition: {
      description: 'Horas trabajadas por persona en un rango (ISO). Sin rango usa las ultimas 24 h. Devuelve hasta 30 personas ordenadas por horas.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Inicio ISO 8601.' },
          to: { type: 'string', description: 'Fin ISO 8601.' },
        },
      },
    },
    async run(args, actx) {
      const report = await svc.hours(actx.companyId, { from: args?.from, to: args?.to })
      return {
        desde: report.from, hasta: report.to, horasTotales: Math.round((report.totalMinutes / 60) * 10) / 10,
        personas: report.rows.slice(0, LIST_MAX).map((r) => ({
          personId: r.person.id, nombre: fullName(r.person), codigo: r.person.code ?? null,
          horas: Math.round((r.minutes / 60) * 10) / 10, sesiones: r.sessions, sesionesAbiertas: r.openSessions,
        })),
      }
    },
  }

  const attendance_person_status = {
    name: 'attendance_person_status',
    permission: 'attendance.view',
    definition: {
      description: 'Busca personas de Asistencia por nombre o codigo y dice si estan dentro ahora, su turno, grupo, categoria y si estan vinculadas a RH. Hasta 10 resultados.',
      parameters: { type: 'object', properties: { search: { type: 'string', description: 'Nombre o codigo.' } }, required: ['search'] },
    },
    async run(args, actx) {
      const [list, report, label, shifts] = await Promise.all([
        svc.listPeople(actx.companyId, { q: args?.search, limit: 10, enabled: 'true' }), svc.presence(actx.companyId),
        names(actx.companyId), prisma.attShift.findMany({ where: { companyId: actx.companyId }, select: { id: true, name: true, startTime: true, endTime: true } }),
      ])
      const inside = new Map(report.present.map((p) => [p.personId, p.since]))
      const shiftById = new Map(shifts.map((s) => [s.id, s]))
      return {
        total: list.length,
        personas: list.map((p) => {
          const shift = shiftById.get(p.shiftId)
          return {
            personId: p.id, nombre: fullName(p), codigo: p.code, tipo: KIND_LABEL[p.kind] ?? p.kind,
            grupo: label.group.get(p.groupId) ?? null, categoria: label.category.get(p.categoryId) ?? null,
            turno: shift ? `${shift.name} (${shift.startTime}-${shift.endTime})` : null,
            presenteAhora: inside.has(p.id), dentroDesde: inside.get(p.id) ?? null, vinculadaARH: Boolean(p.hr), colaboradorRH: p.hr?.fullName ?? null,
          }
        }),
      }
    },
  }

  return {
    moduleKey: 'runly.attendance',
    label: 'Asistencia',
    summary: 'Checador: buscar personas y ver si estan dentro, quien esta dentro ahora, cumplimiento de cuotas de contratistas y horas trabajadas (solo consulta).',
    tools: [attendance_person_status, attendance_presence_now, attendance_quota_compliance, attendance_hours],
    actions: [],
    publicLookup: [],
    async describeContext() { return null },
  }
}
