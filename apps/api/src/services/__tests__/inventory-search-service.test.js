import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildInventorySearchQuery, createInventorySearch } from '../inventory-search-service.js'
import { buildInventoryWhere } from '../inventory-query.js'

const CO = '01900000-0000-7000-8000-000000000001'

describe('inventory search', () => {
  it('builds a parameterised query with all sources per token', () => {
    const q = buildInventorySearchQuery(CO, ['dell', 'juan'])
    assert.ok(q.values.includes('%dell%') && q.values.includes('%juan%') && q.values.includes(CO))
    for (const table of ['inv_assignment', 'entity_comment', 'entity_relation', 'inv_custody', 'inv_item_file', 'inv_custom_field_value', 'inv_item_admin_event', 'inv_deregistration_act', 'inv_change_proposal']) {
      assert.ok(q.sql.includes(table), table)
    }
    assert.ok(!q.sql.includes('license_key'))
    assert.ok(!q.sql.includes('dell') && !q.sql.includes('juan'))
  })
  it('searchItemIds maps rows and skips empty terms', async () => {
    let calls = 0
    const prisma = { $queryRaw: async () => { calls++; return [{ id: 'a' }, { id: 'b' }] } }
    const s = createInventorySearch({ prisma })
    assert.deepEqual(await s.searchItemIds(CO, 'dell juan'), ['a', 'b'])
    assert.deepEqual(await s.searchItemIds(CO, '  '), [])
    assert.equal(calls, 1)
  })
  it('buildInventoryWhere uses searchIds instead of contains', () => {
    const where = buildInventoryWhere(CO, { search: 'x', searchIds: ['a'], status: 'available' })
    assert.deepEqual(where.id, { in: ['a'] })
    assert.equal(where.OR, undefined)
    assert.equal(where.status, 'available')
  })
})
