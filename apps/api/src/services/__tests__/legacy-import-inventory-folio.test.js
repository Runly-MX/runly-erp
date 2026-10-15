import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createInventoryHistorical } from '../legacy-import/inventory-historical.js'

const COMPANY_ID = '01900000-0000-7000-8000-000000000001'

function build({ takenFolios = new Set() } = {}) {
  const created = []
  const counters = new Map()
  const anyModel = new Proxy({}, { get: () => async (args) => ({ id: 'row', ...(args?.data ?? {}) }) })
  const tx = new Proxy(
    { invItem: { create: async ({ data }) => { created.push(data); return { id: 'item-1', ...data } } } },
    { get: (target, key) => target[key] ?? anyModel },
  )
  const prisma = {
    invItem: { findFirst: async ({ where }) => (where.folio && takenFolios.has(where.folio) ? { id: 'other' } : null) },
    $queryRaw: async (strings, ...values) => {
      const prefix = values[1]
      const current = counters.get(prefix) ?? 0
      const value = strings.join('?').includes('GREATEST') ? Math.max(current, values[2]) : current + 1
      counters.set(prefix, value)
      return [{ last_value: value }]
    },
  }
  const refs = { find: async () => null, ensure: async (_key, fn) => ({ id: await fn(tx), created: true }) }
  return { created, importer: createInventoryHistorical({ prisma, refs, fileStore: null, defaultSource: 'sinabe' }) }
}

describe('importItem folio', () => {
  it('stores the requested folio normalized', async () => {
    const { created, importer } = build()
    const result = await importer.importItem({ companyId: COMPANY_ID, legacyId: 'a', data: { name: 'Tel', folio: ' tel-cis-cp7-158 ' } })
    assert.equal(created[0].folio, 'TEL-CIS-CP7-158')
    assert.deepEqual(result.warnings, [])
  })

  it('generates a folio when the requested one is taken', async () => {
    const { created, importer } = build({ takenFolios: new Set(['TEL-CIS-CP7-158']) })
    const result = await importer.importItem({ companyId: COMPANY_ID, legacyId: 'b', data: { name: 'Tel', folio: 'TEL-CIS-CP7-158' } })
    assert.equal(created[0].folio, 'INV-1')
    assert.deepEqual(result.warnings, ['FOLIO_DUPLICATE'])
  })

  it('generates a folio when none is requested', async () => {
    const { created, importer } = build()
    await importer.importItem({ companyId: COMPANY_ID, legacyId: 'c', data: { name: 'Tel' } })
    assert.equal(created[0].folio, 'INV-1')
  })
})
