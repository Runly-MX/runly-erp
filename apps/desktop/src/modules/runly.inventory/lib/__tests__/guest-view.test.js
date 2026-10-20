import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parsePortalHash, portalHash } from '../guest-view.js'

describe('guest portal hash routes', () => {
  it('round-trips every view', () => {
    for (const [view, id] of [['list', null], ['new', null], ['detail', 'a/b'], ['edit', 'x1']]) {
      assert.deepEqual(parsePortalHash(portalHash(view, id)), { view, id })
    }
  })
  it('falls back to the list for unknown hashes', () => {
    assert.equal(parsePortalHash('#/otra-cosa').view, 'list')
    assert.equal(parsePortalHash('#/item').view, 'list')
  })
})
