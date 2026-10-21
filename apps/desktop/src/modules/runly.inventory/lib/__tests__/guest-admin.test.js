import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { guestItemActions } from '../guest-admin.js'

describe('guest item actions by role and admin status', () => {
  it('editor can edit and propose baja only on registered items', () => {
    const a = guestItemActions({ canWrite: true, adminStatus: 'registered' })
    assert.deepEqual([a.canEdit, a.canProposeDeregistration, a.locked, a.banner], [true, true, false, null])
  })
  it('pending alta is editable but cannot be deregistered', () => {
    const a = guestItemActions({ canWrite: true, adminStatus: 'registration_pending' })
    assert.deepEqual([a.canEdit, a.canProposeDeregistration], [true, false])
    assert.ok(a.banner)
  })
  it('a proposed baja stays editable but cannot be proposed again', () => {
    const a = guestItemActions({ canWrite: true, adminStatus: 'deregistration_proposed' })
    assert.deepEqual([a.canEdit, a.canProposeDeregistration, a.locked], [true, false, false])
    assert.ok(a.banner)
  })
  it('a deregistered item is locked read-only', () => {
    const a = guestItemActions({ canWrite: true, adminStatus: 'deregistered' })
    assert.deepEqual([a.canEdit, a.canProposeDeregistration, a.locked], [false, false, true])
    assert.ok(a.banner)
  })
  it('viewers get no actions', () => {
    const a = guestItemActions({ canWrite: false, adminStatus: 'registered' })
    assert.deepEqual([a.canEdit, a.canProposeDeregistration], [false, false])
  })
})
