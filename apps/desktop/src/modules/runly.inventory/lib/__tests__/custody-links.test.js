import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildNewCustodyPath, parseNewCustodyParams } from '../custody-links.js'

describe('custody deep links', () => {
  it('round-trips a return with employee and item', () => {
    const path = buildNewCustodyPath({ kind: 'RETURN', employeeId: 'e1', itemIds: ['i1'] })
    const parsed = parseNewCustodyParams(new URL(path, 'http://x').searchParams)
    assert.deepEqual(parsed, { kind: 'RETURN', employeeId: 'e1', itemIds: ['i1'] })
  })
  it('ignores URLs without new=1 and normalizes unknown kinds', () => {
    assert.equal(parseNewCustodyParams(new URLSearchParams('kind=RETURN')), null)
    assert.equal(parseNewCustodyParams(new URLSearchParams('new=1&kind=X')).kind, 'DELIVERY')
  })
})
