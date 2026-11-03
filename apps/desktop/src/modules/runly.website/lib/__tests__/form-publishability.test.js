import test from 'node:test'
import assert from 'node:assert/strict'
import { describePublishability } from '../formPublishability.js'

test('every C-4 state has copy and blocked states never read as publishable', () => {
  for (const state of ['owner_unresolved', 'owner_ambiguous', 'disabled', 'not_found']) {
    const info = describePublishability({ state })
    assert.notEqual(info.tone, 'success')
    assert.ok(info.title && info.text)
  }
  assert.equal(describePublishability({ state: 'publishable' }).tone, 'success')
  assert.match(describePublishability({ state: 'owner_ambiguous' }).text, /expl[ií]cit/)
})

test('dependency reasons name the missing dependency', () => {
  assert.match(describePublishability({ state: 'dependency_unavailable', reason: { code: 'dependency_unavailable', dependency: 'turnstile' } }).text, /Turnstile/)
  assert.match(describePublishability({ state: 'dependency_unavailable', reason: { dependency: 'assignee' } }).text, /responsable/)
  assert.equal(describePublishability(undefined).title, 'Estado desconocido')
})
