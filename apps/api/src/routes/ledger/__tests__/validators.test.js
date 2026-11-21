// apps/api/src/routes/ledger/__tests__/validators.test.js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { userSearchQuerySchema } from '../validators.js'

describe('userSearchQuerySchema', () => {
  it('accepts a missing "q" (default member listing)', () => {
    const parsed = userSearchQuerySchema.safeParse({})
    assert.ok(parsed.success)
    assert.equal(parsed.data.q, undefined)
    assert.equal(parsed.data.limit, 10)
  })

  it('still rejects a "q" shorter than 2 characters', () => {
    const parsed = userSearchQuerySchema.safeParse({ q: 'a' })
    assert.equal(parsed.success, false)
  })

  it('pages with a bounded offset', () => {
    assert.equal(userSearchQuerySchema.parse({}).offset, 0)
    assert.equal(userSearchQuerySchema.parse({ offset: '20' }).offset, 20)
    assert.equal(userSearchQuerySchema.safeParse({ offset: '-1' }).success, false)
    assert.equal(userSearchQuerySchema.safeParse({ offset: '5000' }).success, false)
  })

  it('excludes the caller unless includeSelf is sent', () => {
    assert.equal(userSearchQuerySchema.parse({}).includeSelf, false)
    assert.equal(userSearchQuerySchema.parse({ includeSelf: '1' }).includeSelf, true)
  })

  it('accepts a valid "q" as before', () => {
    const parsed = userSearchQuerySchema.safeParse({ q: 'an' })
    assert.ok(parsed.success)
    assert.equal(parsed.data.q, 'an')
  })
})
