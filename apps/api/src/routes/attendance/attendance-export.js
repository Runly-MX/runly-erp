// xlsx exports for runly.attendance: people, punches and hours.
// Dates are shifted by the caller's timezone offset (minutes, as returned by
// Date#getTimezoneOffset) so Excel shows local time instead of UTC.
import ExcelJS from 'exceljs'

const KIND = { internal: 'Interno', contractor: 'Contratista', visitor: 'Visitante' }
const METHOD = { pin: 'PIN', code: 'Código', card: 'Tarjeta', phone_qr: 'Llave de teléfono (QR)', phone_scan: 'Llave de teléfono (escaneo)', manual: 'Manual' }
const FLAG = { clock_skew: 'Reloj desfasado', offline: 'Sin conexión', sequence: 'Secuencia irregular', proof_failed: 'Identidad no verificada', replay: 'QR reutilizado', manual: 'Manual', future_time: 'Hora futura', outside_geofence: 'Fuera del radio', no_photo: 'Sin foto' }
const fullName = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(' ')

const local = (value, offsetMin) => (value ? new Date(new Date(value).getTime() - Number(offsetMin || 0) * 60_000) : null)

async function sheetBuffer(name, columns, rows) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18, style: c.numFmt ? { numFmt: c.numFmt } : undefined }))
  sheet.getRow(1).font = { bold: true }
  rows.forEach((row) => sheet.addRow(row))
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export function createAttendanceExport({ prisma, service }) {
  async function lookups(companyId) {
    const [groups, categories, shifts, sites] = await Promise.all([
      prisma.attGroup.findMany({ where: { companyId }, select: { id: true, name: true } }),
      prisma.attCategory.findMany({ where: { companyId }, select: { id: true, name: true } }),
      prisma.attShift.findMany({ where: { companyId }, select: { id: true, name: true } }),
      prisma.attSite.findMany({ where: { companyId }, select: { id: true, name: true } }),
    ])
    const map = (list) => new Map(list.map((x) => [x.id, x.name]))
    return { group: map(groups), category: map(categories), shift: map(shifts), site: map(sites) }
  }

  async function people(companyId) {
    const [list, names] = await Promise.all([service.listPeople(companyId, { limit: 1000 }), lookups(companyId)])
    return sheetBuffer('Personas', [
      { header: 'Código', key: 'code' }, { header: 'Nombre', key: 'name', width: 30 }, { header: 'Tipo', key: 'kind' }, { header: 'Grupo', key: 'group', width: 26 },
      { header: 'Categoría', key: 'category', width: 22 }, { header: 'Turno', key: 'shift', width: 22 }, { header: 'Colaborador RH', key: 'hr', width: 28 }, { header: 'Activo', key: 'enabled', width: 10 },
    ], list.map((p) => ({
      code: p.code, name: fullName(p), kind: KIND[p.kind] ?? p.kind, group: names.group.get(p.groupId) ?? '', category: names.category.get(p.categoryId) ?? '',
      shift: names.shift.get(p.shiftId) ?? '', hr: p.hr?.fullName ?? '', enabled: p.enabled ? 'Sí' : 'No',
    })))
  }

  async function punches(companyId, query = {}) {
    const [list, names] = await Promise.all([service.listPunches(companyId, { ...query, limit: 1000 }), lookups(companyId)])
    const offset = query.offset
    return sheetBuffer('Checadas', [
      { header: 'Fecha y hora', key: 'at', width: 20, numFmt: 'yyyy-mm-dd hh:mm:ss' }, { header: 'Código', key: 'code' }, { header: 'Persona', key: 'name', width: 30 },
      { header: 'Dirección', key: 'direction' }, { header: 'Método', key: 'method', width: 18 }, { header: 'Sitio', key: 'site', width: 22 }, { header: 'Estado', key: 'status' },
      { header: 'Marcas', key: 'flags', width: 38 }, { header: 'Nota', key: 'note', width: 30 },
    ], list.map((p) => ({
      at: local(p.occurredAt, offset), code: p.person?.code, name: fullName(p.person), direction: p.direction === 'in' ? 'Entrada' : 'Salida', method: METHOD[p.method] ?? p.method,
      site: names.site.get(p.siteId) ?? '', status: p.status === 'voided' ? 'Anulada' : p.status === 'flagged' ? 'Por revisar' : 'Válida',
      flags: (p.flags ?? []).map((f) => FLAG[f] ?? f).join(', '), note: p.note ?? '',
    })))
  }

  async function hours(companyId, query = {}) {
    const [report, names] = await Promise.all([service.hours(companyId, query), lookups(companyId)])
    return sheetBuffer('Horas', [
      { header: 'Código', key: 'code' }, { header: 'Persona', key: 'name', width: 30 }, { header: 'Grupo', key: 'group', width: 26 }, { header: 'Horas', key: 'hours', width: 12, numFmt: '0.00' },
      { header: 'Sesiones', key: 'sessions', width: 12 }, { header: 'Sesiones abiertas', key: 'open', width: 18 },
    ], report.rows.map((r) => ({
      code: r.person?.code ?? '', name: fullName(r.person), group: names.group.get(r.person?.groupId) ?? '', hours: Math.round((r.minutes / 60) * 100) / 100, sessions: r.sessions, open: r.openSessions,
    })))
  }

  return { people, punches, hours }
}
