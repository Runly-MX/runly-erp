// runly.bookings v1.2 R3: the iCalendar files, checked with an independent parser
// (node-ical, the one Calendar imports with) plus the RFC 5545 line rules.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import ical from 'node-ical'
import { buildBookingIcs, calendarLinks, foldLine, vtimezone } from '../bookings-ics.js'

const base = (over = {}) => ({
  uid: 'booking-0190a000-0000-7000-8000-000000000001@app.example.test', sequence: 3, method: 'REQUEST',
  start: '2027-01-11T16:00:00Z', end: '2027-01-11T17:00:00Z', timezone: 'America/Mexico_City',
  summary: 'Consulta · Clínica Sur', description: 'Folio: ABC123', location: 'Av. Reforma 100, CDMX',
  organizer: { name: 'Clínica Sur', email: 'hola@clinica.example' }, attendee: { name: 'Ana Pérez', email: 'ana@example.test' },
  stamp: '2026-11-22T12:00:00Z', ...over,
})
const parse = (text) => {
  const data = ical.sync.parseICS(text)
  const event = Object.values(data).find((v) => v.type === 'VEVENT')
  return { data, event }
}

describe('bookings iCalendar files (v1.2 R3)', () => {
  it('RFC 5545 lines: CRLF only, folded at 75 octets without splitting characters', () => {
    const text = buildBookingIcs(base({ description: `Línea larga ${'ñandú, café; á\\é '.repeat(20)}` }))
    assert.ok(text.endsWith('\r\n'))
    assert.ok(!/[^\r]\n/.test(text), 'every newline is CRLF')
    for (const line of text.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `too long: ${line}`)
    assert.equal(foldLine('é'.repeat(50)).split('\r\n').map((l) => l.replace(/^ /, '')).join(''), 'é'.repeat(50))
  })

  it('round-trips UID, SEQUENCE, method, organizer/attendee and special characters', () => {
    const tricky = 'Corte, color; y peinado\\ "VIP"\nSegunda línea · 🌟'
    const { data, event } = parse(buildBookingIcs(base({ summary: tricky, location: 'Sala 2, piso 3; ala B' })))
    assert.equal(event.uid, base().uid)
    assert.equal(Number(event.sequence), 3)
    assert.equal(event.summary, tricky)
    assert.equal(event.location, 'Sala 2, piso 3; ala B')
    assert.equal(data.vcalendar?.method, 'REQUEST')
    assert.match(String(event.organizer?.val ?? event.organizer), /mailto:hola@clinica\.example/)
    assert.equal(event.status, 'CONFIRMED')
  })

  it('local wall time in the IANA zone resolves to the right instant (no DST, DST, half-hour zones)', () => {
    const cases = [
      ['America/Mexico_City', '2027-01-11T16:00:00Z', '2027-01-11T17:00:00Z'], // UTC-6, no DST since 2022
      ['America/New_York', '2027-03-15T13:30:00Z', '2027-03-15T14:30:00Z'], // day after spring forward (EDT)
      ['America/New_York', '2027-11-07T05:30:00Z', '2027-11-07T07:30:00Z'], // spans fall back (01:30 EDT -> 02:30 EST)
      ['Europe/Madrid', '2027-03-28T00:30:00Z', '2027-03-28T01:30:00Z'], // across the jump at 02:00 local
      ['Asia/Kolkata', '2027-06-01T04:30:00Z', '2027-06-01T05:00:00Z'], // +05:30
      ['Australia/Lord_Howe', '2027-10-03T15:00:00Z', '2027-10-03T16:00:00Z'], // half-hour DST shift
    ]
    for (const [timezone, start, end] of cases) {
      const text = buildBookingIcs(base({ timezone, start, end }))
      assert.match(text, new RegExp(`DTSTART;TZID=${timezone.replace('/', '\\/')}:\\d{8}T\\d{6}\\r\\n`))
      const { event } = parse(text)
      assert.equal(new Date(event.start).toISOString(), new Date(start).toISOString(), `${timezone} start`)
      assert.equal(new Date(event.end).toISOString(), new Date(end).toISOString(), `${timezone} end`)
    }
  })

  it('VTIMEZONE observances agree with the zone database at every change', () => {
    const offset = (ms, tz) => { const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date(ms)).find((x) => x.type === 'timeZoneName').value; const m = /GMT([+-])(\d{2}):(\d{2})/.exec(p); return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0 }
    const minutes = (s) => (s[0] === '-' ? -1 : 1) * (Number(s.slice(1, 3)) * 60 + Number(s.slice(3, 5)))
    for (const tz of ['America/New_York', 'Europe/Madrid', 'Australia/Lord_Howe', 'America/Mexico_City']) {
      const lines = vtimezone(tz, '2027-06-01T00:00:00Z')
      const blocks = lines.join('\n').split(/BEGIN:(?:STANDARD|DAYLIGHT)\n/).slice(1)
      assert.ok(blocks.length >= 1, tz)
      for (const block of blocks) {
        const [, dt] = /DTSTART:(\d{8}T\d{6})/.exec(block), from = minutes(/TZOFFSETFROM:([+-]\d{4})/.exec(block)[1]), to = minutes(/TZOFFSETTO:([+-]\d{4})/.exec(block)[1])
        if (dt.startsWith('1970')) { assert.equal(offset(Date.UTC(2027, 5, 1), tz), to); continue }
        const instant = Date.UTC(+dt.slice(0, 4), +dt.slice(4, 6) - 1, +dt.slice(6, 8), +dt.slice(9, 11), +dt.slice(11, 13)) - from * 60000
        assert.equal(offset(instant - 60000, tz), from, `${tz} before ${dt}`)
        assert.equal(offset(instant, tz), to, `${tz} after ${dt}`)
      }
    }
    assert.equal(vtimezone('America/New_York', '2027-06-01T00:00:00Z').filter((l) => l === 'BEGIN:DAYLIGHT').length, 3, '2026-2028')
  })

  it('a move keeps the UID and raises SEQUENCE; a cancellation is METHOD:CANCEL with STATUS:CANCELLED', () => {
    const first = parse(buildBookingIcs(base())).event
    const moved = parse(buildBookingIcs(base({ sequence: 5, start: '2027-01-12T17:00:00Z', end: '2027-01-12T18:00:00Z' }))).event
    assert.equal(moved.uid, first.uid)
    assert.ok(Number(moved.sequence) > Number(first.sequence))
    const cancelText = buildBookingIcs(base({ sequence: 6, method: 'CANCEL' }))
    const cancelled = parse(cancelText)
    assert.equal(cancelled.data.vcalendar?.method, 'CANCEL')
    assert.equal(cancelled.event.status, 'CANCELLED')
    assert.equal(cancelled.event.uid, first.uid)
  })

  it('Google and Outlook links carry the event in UTC and nothing else', () => {
    const links = calendarLinks(base({ description: 'Folio: ABC123' }))
    const g = new URL(links.google), o = new URL(links.outlook)
    assert.equal(g.searchParams.get('dates'), '20270111T160000Z/20270111T170000Z')
    assert.equal(g.searchParams.get('ctz'), 'America/Mexico_City')
    assert.equal(o.searchParams.get('startdt'), '2027-01-11T16:00:00.000Z')
    assert.equal(o.searchParams.get('subject'), 'Consulta · Clínica Sur')
  })
})
