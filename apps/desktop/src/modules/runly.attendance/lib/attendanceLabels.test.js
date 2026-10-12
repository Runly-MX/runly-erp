import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCsv, flagLabel, kioskStatus, minutesToHours, tallyBy } from './attendanceLabels.js'

test('flag labels are Spanish with fallback', () => {
  assert.equal(flagLabel('clock_skew'), 'Reloj desfasado')
  assert.equal(flagLabel('replay'), 'QR reutilizado')
  assert.equal(flagLabel('otro'), 'otro')
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
