// xlsx of a reservations search. Times are written as text in the space's own
// time zone (with the zone name in the header), never in the server's or browser's.
import ExcelJS from 'exceljs'

const STATUS = { PENDING: 'Pendiente', CONFIRMED: 'Confirmada', CANCELLED: 'Cancelada', REJECTED: 'Rechazada', COMPLETED: 'Completada', NO_SHOW: 'No presentada', EXPIRED: 'Expirada' }
const CHANNEL = { backoffice: 'Backoffice', portal: 'Portal', website: 'Sitio web', pos: 'Punto de venta', api: 'API' }

export function localDateTime(value, timeZone) {
  if (!value) return ''
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value)).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}

export async function bookingsWorkbook({ space, items, services, resources }) {
  const serviceName = new Map(services.map((s) => [s.id, s.name]))
  const resourceName = new Map(resources.map((r) => [r.id, r.name]))
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Reservaciones', { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = [
    { header: `Inicio (${space.timezone})`, key: 'start', width: 20 },
    { header: `Fin (${space.timezone})`, key: 'end', width: 20 },
    { header: 'Estado', key: 'status', width: 15 },
    { header: 'Servicio', key: 'service', width: 26 },
    { header: 'Recurso', key: 'resource', width: 24 },
    { header: 'Cliente', key: 'guest', width: 28 },
    { header: 'Correo', key: 'email', width: 28 },
    { header: 'Teléfono', key: 'phone', width: 18 },
    { header: 'Personas', key: 'party', width: 10 },
    { header: 'Canal', key: 'channel', width: 14 },
    { header: 'Notas', key: 'notes', width: 40 },
  ]
  sheet.getRow(1).font = { bold: true }
  for (const b of items) {
    sheet.addRow({
      start: localDateTime(b.startsAt, space.timezone),
      end: localDateTime(b.endsAt, space.timezone),
      status: STATUS[b.status] ?? b.status,
      service: serviceName.get(b.serviceId) ?? '',
      resource: (b.resourceIds ?? []).map((id) => resourceName.get(id) ?? '').filter(Boolean).join(', '),
      guest: b.guestName ?? '',
      email: b.guestEmail ?? '',
      phone: b.guestPhone ?? '',
      party: b.partySize,
      channel: CHANNEL[b.channel] ?? b.channel,
      notes: b.notes ?? '',
    })
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
