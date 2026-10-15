// inventory-folio.test.js — folio prefix derivation, parsing and allocation
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  codeFromName, normalizeCode, normalizeFolio, folioPrefix, parseFolio, formatFolio, createFolioAllocator,
} from '../inventory-folio.js'

const COMPANY_ID = '01900000-0000-7000-8000-000000000001'

describe('folio helpers', () => {
  it('derives codes without accents or symbols', () => {
    assert.equal(codeFromName('Teléfono'), 'TEL')
    assert.equal(codeFromName('cp7821'), 'CP7')
    assert.equal(codeFromName('  ¡! '), '')
    assert.equal(normalizeCode(' lt-1 '), 'LT1')
    assert.equal(normalizeCode('!!'), null)
  })

  it('builds the prefix from codes, then names, then INV', () => {
    assert.equal(folioPrefix({ type: { name: 'Teléfono' }, brand: { name: 'Cisco' }, model: { name: 'cp7821' } }), 'TEL-CIS-CP7')
    assert.equal(folioPrefix({ type: { name: 'Laptop', code: 'lt' }, brand: null, model: null }), 'LT')
    assert.equal(folioPrefix({}), 'INV')
  })

  it('normalizes, parses and formats folios', () => {
    assert.equal(normalizeFolio('  tel-cis-cp7-158 '), 'TEL-CIS-CP7-158')
    assert.equal(normalizeFolio('   '), null)
    assert.deepEqual(parseFolio('TEL-CIS-CP7-158'), { prefix: 'TEL-CIS-CP7', n: 158 })
    assert.equal(parseFolio('ABC'), null)
    assert.equal(parseFolio('X-0'), null)
    assert.equal(formatFolio('TEL-CIS-CP7', 159), 'TEL-CIS-CP7-159')
  })
})

function fakeDb({ counters = new Map(), taken = new Set() } = {}) {
  return {
    counters,
    $queryRaw: async (strings, ...values) => {
      const prefix = values[1]
      const current = counters.get(prefix) ?? 0
      const value = strings.join('?').includes('GREATEST') ? Math.max(current, values[2]) : current + 1
      counters.set(prefix, value)
      return [{ last_value: value }]
    },
    invItem: { findFirst: async ({ where }) => (taken.has(where.folio) ? { id: 'x' } : null) },
    invCategory: { findFirst: async () => ({ name: 'Teléfono', code: null }) },
    invBrand: { findFirst: async () => ({ name: 'Cisco', code: null }) },
    invModel: { findFirst: async () => ({ name: 'cp7821', code: null }) },
  }
}

describe('folio allocator', () => {
  it('continues after an observed folio', async () => {
    const db = fakeDb()
    const folios = createFolioAllocator()
    await folios.observe(db, COMPANY_ID, 'TEL-CIS-CP7-158')
    const next = await folios.forItem(db, COMPANY_ID, { categoryId: 'c', brandId: 'b', modelId: 'm' })
    assert.equal(next, 'TEL-CIS-CP7-159')
  })

  it('skips a folio already used by an active item', async () => {
    const db = fakeDb({ taken: new Set(['TEL-CIS-CP7-1']) })
    const next = await createFolioAllocator().forItem(db, COMPANY_ID, { categoryId: 'c', brandId: 'b', modelId: 'm' })
    assert.equal(next, 'TEL-CIS-CP7-2')
  })

  it('uses INV and the free-text model when there is no catalog data', async () => {
    const db = fakeDb()
    const folios = createFolioAllocator()
    assert.equal(await folios.forItem(db, COMPANY_ID, {}), 'INV-1')
    assert.equal(await folios.forItem(db, COMPANY_ID, { model: 'XPS 15' }), 'XPS-1')
  })
})
