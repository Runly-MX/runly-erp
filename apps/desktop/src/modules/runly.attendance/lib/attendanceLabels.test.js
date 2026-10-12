import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCsv, flagLabel, formatDayLabel, overtimeStatusLabel, overtimeStatusTone, planLabel, flagVariant, methodLabel, kioskStatus, minutesToHours, tallyBy } from './attendanceLabels.js'

test('flag labels are Spanish with fallback', () => {
  assert.equal(flagLabel('clock_skew'), 'Reloj desfasado')
  assert.equal(flagLabel('replay'), 'QR reutilizado')
  assert.equal(flagLabel('otro'), 'otro')
  assert.equal(flagLabel('no_photo'), 'Sin foto')
  assert.equal(flagVariant('no_photo'), flagVariant('proof_failed'))
  assert.equal(methodLabel('phone_scan'), 'Teléfono (escaneo)')
})

test('buildCsv quotes cells and prefixes BOM', () => {
  const csv = buildCsv(['Nombre', 'Horas'], [['Ana, "A"', '1 h']])
  assert.equal(csv, '﻿Nombre,Horas\r\n"Ana, ""A""",1 h\r\n')
})

test('kioskStatus', () => {
  const now = Date.now()
  assert.equal(kioskStatus({ pairingPending: true }, now).key, 'pending')
  assert.equal(kioskStatus({ paired: true, lastSeenAt: new Date(now - 60_000) }, now).key, 'online')
  assert.equal(kioskStatus({ paired: true, lastSeenAt: new Date(now - 10 * 60_000) }, now).key, 'offline')
  assert.equal(kioskStatus({ revokedAt: new Date() }, now).key, 'revoked')
})

test('minutesToHours and tallyBy', () => {
  assert.equal(minutesToHours(125), '2 h 05 min')
  const rows = tallyBy({ a: 1, none: 3 }, new Map([['a', 'Grupo A']]), 'Sin grupo')
  assert.deepEqual(rows.map((r) => r.label), ['Sin grupo', 'Grupo A'])
})

test('correction flag and overtime review labels', () => {
  assert.equal(flagLabel('correction'), 'Solicitada por la persona')
  assert.equal(overtimeStatusLabel('pending'), 'Pendiente')
  assert.equal(overtimeStatusLabel('auto'), 'Automática')
  assert.equal(overtimeStatusTone('approved'), 'teal')
  assert.equal(formatDayLabel('2026-10-12'), 'Lun 12 oct')
  assert.equal(planLabel({ restDay: false, weekday: 1, planStart: '08:00', planEnd: '17:00' }), 'Lun 08:00-17:00')
  assert.equal(planLabel({ restDay: true }), 'Descanso')
})
