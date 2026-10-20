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
  it('proposed and deregistered items are locked read-only', () => {
    for (const adminStatus of ['deregistration_proposed', 'deregistered']) {
      const a = guestItemActions({ canWrite: true, adminStatus })
      assert.deepEqual([a.canEdit, a.canProposeDeregistration, a.locked], [false, false, true])
      assert.ok(a.banner)
    }
  })
  it('viewers get no actions', () => {
    const a = guestItemActions({ canWrite: false, adminStatus: 'registered' })
    assert.deepEqual([a.canEdit, a.canProposeDeregistration], [false, false])
  })
})
