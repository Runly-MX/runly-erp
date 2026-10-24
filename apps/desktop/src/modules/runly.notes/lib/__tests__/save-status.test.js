import test from 'node:test'
import assert from 'node:assert/strict'
import { setSaveStatus, getSaveStatus, subscribeSaveStatus } from '../saveStatus.js'

test('defaults to saved and notifies subscribers on change only', () => {
  assert.equal(getSaveStatus('n1'), 'saved')
  const seen = []
  const off = subscribeSaveStatus('n1', () => seen.push(getSaveStatus('n1')))
  setSaveStatus('n1', 'saving')
  setSaveStatus('n1', 'saving')
  setSaveStatus('n1', 'saved')
  off()
  setSaveStatus('n1', 'error')
  assert.deepEqual(seen, ['saving', 'saved'])
  assert.equal(getSaveStatus('n1'), 'error')
})

test('statuses are per note', () => {
  setSaveStatus('a', 'saving')
  assert.equal(getSaveStatus('b'), 'saved')
})
