import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { backfillFolios } from '../inventory-folio-backfill.js'

const COMPANY_ID = '01900000-0000-7000-8000-000000000001'

function fakePrisma(items, values) {
  const counters = new Map()
  const prisma = {
    items,
    counters,
    invItem: {
      findMany: async ({ where }) => (where.folio === null ? items.filter((i) => !i.folio) : items.filter((i) => i.folio)),
      findFirst: async ({ where }) => items.find((i) => i.enabled && i.folio === where.folio) ?? null,
      update: async ({ where, data }) => { Object.assign(items.find((i) => i.id === where.id), data); return {} },
    },
    invCustomFieldValue: { findMany: async () => values },
    invCategory: { findFirst: async () => ({ name: 'Teléfono', code: null }) },
    invBrand: { findFirst: async () => ({ name: 'Cisco', code: null }) },
    invModel: { findFirst: async () => null },
    $queryRaw: async (strings, ...v) => {
      const prefix = v[1]
      const current = counters.get(prefix) ?? 0
      const value = strings.join('?').includes('GREATEST') ? Math.max(current, v[2]) : current + 1
      counters.set(prefix, value)
      return [{ last_value: value }]
    },
  }
  return prisma
}

const item = (id, extra = {}) => ({ id, enabled: true, folio: null, categoryId: 'c', brandId: 'b', modelId: null, model: 'cp7821', createdAt: new Date(2026, 0, Number(id.slice(1))), ...extra })

describe('backfillFolios', () => {
  it('moves the sinabe folio, handles duplicates and continues the counter', async () => {
    const items = [item('i1'), item('i2'), item('i3'), item('i4')]
    const values = [
      { itemId: 'i1', value: ' tel-cis-cp7-158 ' },
      { itemId: 'i2', value: 'TEL-CIS-CP7-158' }, // duplicate of i1
      { itemId: 'i3', value: '' },
    ]
    const prisma = fakePrisma(items, values)
    const report = await backfillFolios({ prisma, companyId: COMPANY_ID, apply: true })
    assert.equal(items[0].folio, 'TEL-CIS-CP7-158')
    assert.equal(items[1].folio, 'TEL-CIS-CP7-159')
    assert.equal(items[2].folio, 'TEL-CIS-CP7-160')
    assert.equal(items[3].folio, 'TEL-CIS-CP7-161')
    assert.deepEqual({ fromCustomField: report.fromCustomField, duplicates: report.duplicates, generated: report.generated }, { fromCustomField: 1, duplicates: 1, generated: 3 })
  })

  it('writes nothing without apply', async () => {
    const items = [item('i1')]
    const prisma = fakePrisma(items, [{ itemId: 'i1', value: 'TEL-CIS-CP7-5' }])
    const report = await backfillFolios({ prisma, companyId: COMPANY_ID, apply: false })
    assert.equal(items[0].folio, null)
    assert.equal(report.fromCustomField, 1)
  })

  it('is idempotent', async () => {
    const items = [item('i1', { folio: 'INV-1' })]
    const report = await backfillFolios({ prisma: fakePrisma(items, []), companyId: COMPANY_ID, apply: true })
    assert.equal(report.total, 0)
  })
})
