import test from 'node:test'
import assert from 'node:assert/strict'
import { createDraftStorage } from './draft-storage.js'
import { blankDocument } from '../../../../../shared/studio/document.js'

test('drafts are scoped by identity/company/design, canonical and expire', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  let now = 1000
  const draft = createDraftStorage(storage, 'company:owner:design', () => now)
  const document = { ...blankDocument(), signedUrl: 'never persisted' }
  assert.equal(draft.write({ name: 'Local', revision: 2, document }), true)
  assert.equal(draft.read().document.signedUrl, undefined)
  assert.equal(createDraftStorage(storage, 'other-company:owner:design').read(), null)
  assert.equal(createDraftStorage(storage, 'company:other-owner:design').read(), null)
  now += 8 * 24 * 60 * 60_000
  assert.equal(draft.read(), null)
  draft.clear(); assert.equal(values.size, 0)
})

test('storage quota/invalid data do not break editing or restore unvalidated JSON', () => {
  const store = createDraftStorage({ getItem: () => '{', setItem: () => { throw Error('quota') } }, 'scope')
  assert.equal(store.read(), null)
  assert.equal(store.write({ document: blankDocument() }), false)
})
