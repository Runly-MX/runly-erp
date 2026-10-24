import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canCreateSubpageAtDepth, canEditNote } from '../subpages.js'

test('subpages are allowed until the open note is at level 3', () => {
  assert.equal(canCreateSubpageAtDepth(0), true)
  assert.equal(canCreateSubpageAtDepth(1), true)
  assert.equal(canCreateSubpageAtDepth(2), false)
})

test('canEditNote covers owner, edit share and read share', () => {
  assert.equal(canEditNote({ is_owner: true }, 'u'), true)
  assert.equal(canEditNote({ owner_user_id: 'u' }, 'u'), true)
  assert.equal(canEditNote({ is_owner: false, my_share_permission: 'edit' }, 'u'), true)
  assert.equal(canEditNote({ is_owner: false, my_share_permission: 'read' }, 'u'), false)
  assert.equal(canEditNote({ owner_user_id: 'x', shares: [{ userId: 'u', permission: 'edit' }] }, 'u'), true)
  assert.equal(canEditNote(null, 'u'), false)
})
