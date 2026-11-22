// Personal calendars of runly.bookings (v1.2 R3): an iCalendar (RFC 5545 / iTIP RFC 5546)
// event per booking plus Google Calendar and Outlook template links. One stable UID per
// booking, SEQUENCE = booking version, local times with the space's IANA zone and a
// VTIMEZONE derived from it. Confirmed -> METHOD:REQUEST, cancelled -> METHOD:CANCEL with
// STATUS:CANCELLED. Nothing here carries the manage token, staff data or internal links.
import { icsToken, icsUrl, verifyIcsToken } from './bookings-links.js'
import { resolveAppBaseUrl } from '../../services/email-templates.js'

const CRLF = '\r\n'
const DAY = 86400000

export const escapeText = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

// Lines longer than 75 octets continue on the next line after one space (never splitting a UTF-8 character).
export function foldLine(line) {
  if (Buffer.byteLength(line) <= 75) return line
  const out = []
  let current = '', size = 0
  for (const ch of line) {
    const bytes = Buffer.byteLength(ch)
    if (size + bytes > 75) { out.push(current); current = ` ${ch}`; size = 1 + bytes } else { current += ch; size += bytes }
  }
  out.push(current)
  return out.join(CRLF)
}

const utcStamp = (date) => new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const formatters = new Map()
const formatter = (timeZone) => {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'longOffset' }))
  }
  return formatters.get(timeZone)
}
function partsOf(date, timeZone) {
  const p = Object.fromEntries(formatter(timeZone).formatToParts(new Date(date)).map((x) => [x.type, x.value]))
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(p.timeZoneName ?? '')
  return { local: `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`, offset: m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0 }
}
export const localStamp = (date, timeZone) => partsOf(date, timeZone).local
const offsetOf = (ms, timeZone) => partsOf(ms, timeZone).offset
const formatOffset = (minutes) => `${minutes < 0 ? '-' : '+'}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}${String(Math.abs(minutes) % 60).padStart(2, '0')}`

// Offset changes of the zone from a year before to a year after the event, found day by
// day and narrowed to the minute: explicit observances, valid for any IANA zone without RRULEs.
export function vtimezone(timeZone, at) {
  const year = new Date(at).getUTCFullYear()
  const from = Date.UTC(year - 1, 0, 1), to = Date.UTC(year + 2, 0, 1)
  const changes = []
  let prev = offsetOf(from, timeZone)
  for (let t = from + DAY; t <= to; t += DAY) {
    const next = offsetOf(t, timeZone)
    if (next === prev) continue
    let lo = t - DAY, hi = t
    while (hi - lo > 60000) { const mid = lo + Math.floor((hi - lo) / 120000) * 60000; if (offsetOf(mid, timeZone) === prev) lo = mid; else hi = mid }
    changes.push({ at: hi, from: prev, to: next })
    prev = next
  }
  const lines = ['BEGIN:VTIMEZONE', `TZID:${timeZone}`]
  if (!changes.length) {
    lines.push('BEGIN:STANDARD', 'DTSTART:19700101T000000', `TZOFFSETFROM:${formatOffset(prev)}`, `TZOFFSETTO:${formatOffset(prev)}`, 'END:STANDARD')
  }
  for (const c of changes) {
    const kind = c.to > c.from ? 'DAYLIGHT' : 'STANDARD'
    // An observance starts at the local time of the change, read with the offset before it.
    lines.push(`BEGIN:${kind}`, `DTSTART:${utcStamp(c.at + c.from * 60000).slice(0, 15)}`, `TZOFFSETFROM:${formatOffset(c.from)}`, `TZOFFSETTO:${formatOffset(c.to)}`, `END:${kind}`)
  }
  lines.push('END:VTIMEZONE')
  return lines
}

// event: { uid, sequence, method: REQUEST | CANCEL, start, end, timezone, summary, description, location, url, organizer: { name, email }, attendee: { name, email }, stamp }
export function buildBookingIcs(event) {
  const cancel = event.method === 'CANCEL'
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Runly//Reservaciones//ES', 'CALSCALE:GREGORIAN', `METHOD:${cancel ? 'CANCEL' : 'REQUEST'}`,
    ...vtimezone(event.timezone, event.start),
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${utcStamp(event.stamp ?? Date.now())}`,
    `DTSTART;TZID=${event.timezone}:${localStamp(event.start, event.timezone)}`,
    `DTEND;TZID=${event.timezone}:${localStamp(event.end, event.timezone)}`,
    `SUMMARY:${escapeText(cancel ? `Cancelada: ${event.summary}` : event.summary)}`,
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    `ORGANIZER;CN="${String(event.organizer.name).replace(/["\r\n]/g, '')}":mailto:${event.organizer.email}`,
    ...(event.attendee?.email ? [`ATTENDEE;CN="${String(event.attendee.name ?? '').replace(/["\r\n]/g, '')}";ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${event.attendee.email}`] : []),
    `STATUS:${cancel ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    'END:VEVENT', 'END:VCALENDAR',
  ]
  return lines.map(foldLine).join(CRLF) + CRLF
}

// Template links copy the event once into the customer's calendar; they never update it.
export function calendarLinks(event) {
  const google = new URL('https://calendar.google.com/calendar/render')
  google.search = new URLSearchParams({ action: 'TEMPLATE', text: event.summary, dates: `${utcStamp(event.start)}/${utcStamp(event.end)}`, details: event.description ?? '', location: event.location ?? '', ctz: event.timezone }).toString()
  const outlook = new URL('https://outlook.live.com/calendar/0/action/compose')
  outlook.search = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: event.summary, startdt: new Date(event.start).toISOString(), enddt: new Date(event.end).toISOString(), body: event.description ?? '', location: event.location ?? '' }).toString()
  return { google: google.toString(), outlook: outlook.toString() }
}

export function createBookingsCalendarFiles({ prisma, env = process.env, meetings = null }) {
  const host = (() => { try { return new URL(resolveAppBaseUrl(env)).hostname } catch { return 'runly.invalid' } })()

  async function load(bookingId) {
    return (await prisma.$queryRaw`
      SELECT b.id, b.company_id, b.status::text AS status, b.starts_at, b.ends_at, b.version, b.reference, b.guest_name, b.guest_email,
             b.manage_token_version, b.manage_token_expires_at, sv.name AS service_name, s.name AS space_name, s.timezone,
             p.location, c.name AS company_name, c.contact_email
        FROM booking b
        JOIN booking_service sv ON sv.id = b.service_id AND sv.company_id = b.company_id
        JOIN booking_space s ON s.id = b.space_id AND s.company_id = b.company_id
        JOIN company c ON c.id = b.company_id
        LEFT JOIN booking_page p ON p.id = b.page_id AND p.company_id = b.company_id
       WHERE b.id = ${bookingId}::uuid`)[0] ?? null
  }

  // Only what the customer needs: what, when, where (or how to join), and the folio.
  async function eventOf(row, brand = null) {
    const meeting = row.status === 'CONFIRMED' && meetings ? await meetings.guestJoin(row.id) : null
    const company = brand?.name || row.company_name
    const description = [
      `${row.service_name} con ${company}`,
      `Folio: ${row.reference}`,
      meeting ? `Unirse a la reunión: ${meeting.url}` : null,
      meeting?.kind === 'runly' ? 'Esperarás en la sala de espera hasta que el negocio te admita.' : null,
    ].filter(Boolean).join('\n')
    return {
      uid: `booking-${row.id}@${host}`,
      sequence: row.version,
      start: row.starts_at, end: row.ends_at, timezone: row.timezone,
      summary: `${row.service_name} · ${company}`,
      description,
      location: meeting ? 'En línea' : row.location || row.space_name,
      url: meeting?.url ?? null,
      organizer: { name: company, email: row.contact_email || `no-reply@${host}` },
      attendee: row.guest_email ? { name: row.guest_name, email: row.guest_email } : null,
    }
  }

  const linked = (row) => row.manage_token_version > 0 && row.manage_token_expires_at && new Date(row.manage_token_expires_at) > new Date()

  // Portal and emails: "Agregar a mi calendario", for confirmed bookings only.
  async function linksFor(bookingId, { brand = null } = {}) {
    const row = await load(bookingId)
    if (!row || row.status !== 'CONFIRMED' || !linked(row)) return null
    const event = await eventOf(row, brand)
    return { ...calendarLinks(event), ics: icsUrl(row.id, icsToken(row.id, row.manage_token_version, env), env) }
  }

  // Public download through the signed link. Pending, rejected or expired bookings have no event.
  async function file(bookingId, token) {
    if (!/^[0-9a-f-]{36}$/i.test(String(bookingId))) return null
    const row = await load(bookingId)
    if (!row || !linked(row) || !verifyIcsToken(token, row.id, row.manage_token_version, env)) return null
    if (row.status !== 'CONFIRMED' && row.status !== 'CANCELLED') return null
    return { filename: `reservacion-${row.reference}.ics`, body: buildBookingIcs({ ...(await eventOf(row)), method: row.status === 'CANCELLED' ? 'CANCEL' : 'REQUEST' }) }
  }

  // Email attachment matching the booking's current state (a late or retried email never
  // contradicts it): the same UID and the current SEQUENCE, so re-sends never duplicate.
  async function attachmentFor(row, kind, brand = null) {
    const update = row.status === 'CONFIRMED' && ['confirmed', 'rescheduled', 'manage_link'].includes(kind)
    const cancel = row.status === 'CANCELLED' && kind === 'cancelled'
    if (!update && !cancel) return null
    const method = cancel ? 'CANCEL' : 'REQUEST'
    return {
      filename: cancel ? 'cancelacion.ics' : 'invitacion.ics',
      content: buildBookingIcs({ ...(await eventOf(row, brand)), method }),
      contentType: `text/calendar; charset=utf-8; method=${method}`,
    }
  }

  return { load, linksFor, file, attachmentFor }
}
