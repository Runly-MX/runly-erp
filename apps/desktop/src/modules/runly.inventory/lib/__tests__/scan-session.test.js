import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCsv, codeKey, findRowByCode, loadSession, normalizeScanCode, publicTokenFromCode, saveSession, sessionCounts, sessionReducer, toExportTable,
} from '../scan-session.js'

const TOKEN = 'b'.repeat(43)
const laptop = { id: 'i1', name: 'Laptop', folio: 'LAP-1', assetTag: 'AT-1', serialNumber: 'SN-1', adminStatus: 'registered', brandName: 'Dell' }

describe('scan code normalization', () => {
  it('trims, drops control characters and extracts link tokens', () => {
    assert.equal(normalizeScanCode('  LAP-1\r\n'), 'LAP-1')
    assert.equal(normalizeScanCode('\tAT-1\u0000'), 'AT-1')
    assert.equal(publicTokenFromCode(`https://erp.example.com/app/p/inv/${TOKEN}`), TOKEN)
    assert.equal(publicTokenFromCode('LAP-1'), null)
    assert.equal(codeKey(' lap-1 '), codeKey('LAP-1'))
    assert.equal(codeKey(`/app/p/inv/${TOKEN}`), `link:${TOKEN}`)
  })
})

describe('scan session reducer', () => {
  it('adds matched and unmatched rows newest first', () => {
    let rows = sessionReducer([], { type: 'add', result: { code: 'LAP-1', item: laptop, matchedBy: 'folio' } })
    rows = sessionReducer(rows, { type: 'add', result: { code: 'XYZ', item: null, matchedBy: null } })
    assert.deepEqual(rows.map((r) => r.key), ['code:xyz', 'item:i1'])
    assert.deepEqual(sessionCounts(rows), { total: 2, matched: 1, unmatched: 1, reads: 2 })
  })

  it('does not add an item twice when read by another identifier', () => {
    let rows = sessionReducer([], { type: 'add', result: { code: `/app/p/inv/${TOKEN}`, item: laptop, matchedBy: 'link' } })
    rows = sessionReducer(rows, { type: 'add', result: { code: 'sn-1', item: laptop, matchedBy: 'serial' } })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].reads, 2)
    // Any identifier of the matched item is recognized before calling the API.
    assert.equal(findRowByCode(rows, 'at-1')?.key, 'item:i1')
    assert.equal(findRowByCode(rows, `https://x.example.com/app/p/inv/${TOKEN}`)?.key, 'item:i1')
    assert.equal(findRowByCode(rows, 'OTHER'), null)
    rows = sessionReducer(rows, { type: 'touch', key: 'item:i1' })
    assert.equal(rows[0].reads, 3)
  })

  it('removes, refreshes, clears and persists with a broken storage', () => {
    let rows = sessionReducer([], { type: 'add', result: { code: 'LAP-1', item: laptop } })
    rows = sessionReducer(rows, { type: 'refresh', items: { i1: { adminStatus: 'deregistered' } } })
    assert.equal(rows[0].item.adminStatus, 'deregistered')
    const store = new Map()
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
    saveSession('c1', rows, storage)
    assert.equal(loadSession('c1', storage)[0].key, 'item:i1')
    assert.deepEqual(loadSession('c2', storage), [])
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    assert.deepEqual(loadSession('c1', broken), [])
    assert.doesNotThrow(() => saveSession('c1', rows, broken))
    assert.deepEqual(sessionReducer(rows, { type: 'remove', key: 'item:i1' }), [])
    assert.deepEqual(sessionReducer(rows, { type: 'clear' }), [])
  })
})

describe('scan export', () => {
  it('builds a CSV in scan order with escaping and formula neutralization', () => {
    let rows = sessionReducer([], { type: 'add', result: { code: 'LAP-1', item: { ...laptop, name: 'Laptop, 14"' } }, readAt: '2026-10-15T10:00:00Z' })
    rows = sessionReducer(rows, { type: 'add', result: { code: '=HYPERLINK("x")', item: null }, readAt: '2026-10-15T10:01:00Z' })
    const table = toExportTable(rows, { statusLabel: (v) => (v === 'registered' ? 'Alta' : v) })
    assert.equal(table.columns[0], 'Folio')
    assert.equal(table.rows[0][0], 'LAP-1')
    assert.equal(table.rows[0][7], 'Alta')
    assert.equal(table.rows[1][1], 'No encontrado')
    const csv = buildCsv(table)
    assert.ok(csv.startsWith('﻿Folio,Nombre,'))
    assert.ok(csv.includes('"Laptop, 14"""'))
    assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`))
    assert.equal(csv.trim().split('\r\n').length, 3)
  })
})
