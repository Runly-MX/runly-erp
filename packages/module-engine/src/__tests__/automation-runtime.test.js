import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matches, buildArgs, render } from '../automation-runtime.js'

test('portable automation rules keep condition, interpolation, array and idempotency semantics', () => {
  assert.equal(matches({ field: 'name', op: 'changed' }, { name: 'B' }, { name: 'A' }), true)
  assert.equal(matches({ field: 'name', op: 'changed' }, { name: 'B' }), false)
  assert.equal(matches({ field: 'name', op: 'filled' }, { name: '' }), false)
  assert.equal(matches({ field: 'state', op: 'equals', value: '1' }, { state: 1 }), true)
  assert.equal(render('Hola {{name}} {{missing}}', { name: 'Fixture' }), 'Hola Fixture ')
  const automation = { action: { args: { userIds: { from: 'actor' }, title: { from: 'template', template: '{{name}}' }, empty: { from: 'field', field: 'missing' } } }, runtime: { arrayArgs: ['userIds'], acceptsSource: true } }
  assert.deepEqual(buildArgs(automation, { data: { name: 'Fixture' }, actorId: 'actor', recordId: 'record', idempotencyKey: 'key' }), { userIds: ['actor'], title: 'Fixture', sourceEntityId: 'record', idempotencyKey: 'key' })
})

test('condition lists require every condition; new operators compare text and numbers', () => {
  const data = { name: 'Orden OS-7', total: 120 }
  assert.equal(matches([{ field: 'name', op: 'contains', value: 'os-7' }, { field: 'total', op: 'gt', value: 100 }], data), true)
  assert.equal(matches([{ field: 'name', op: 'contains', value: 'os-7' }, { field: 'total', op: 'lt', value: 100 }], data), false)
  assert.equal(matches({ field: 'name', op: 'not_equals', value: 'X' }, data), true)
  assert.equal(matches({ field: 'missing', op: 'gt', value: 1 }, data), false)
})

test('a run that stops at a failed step says where and with what data, so it can resume there', async () => {
  const { runSteps } = await import('../automation-runtime.js')
  const runtime = { arrayArgs: [], acceptsSource: false }
  const automation = { key: 'a', steps: [
    { service: 's:one', args: {}, outputs: ['id'], runtime },
    { service: 's:two', args: {}, outputs: [], runtime },
    { service: 's:three', args: {}, outputs: [], runtime },
  ] }
  const services = { call: async (service) => { if (service === 's:two') throw Object.assign(new Error('caído'), { status: 503 }); return { id: 'x1' } } }
  const result = await runSteps({ automation, services, base: 'a:e1', data: { name: 'N' } })
  assert.equal(result.stoppedAt, 1)
  assert.deepEqual(result.scope, { name: 'N', paso1_id: 'x1' })
  assert.equal(result.steps[1].status, 503)
  assert.equal(result.steps[2].skipped, true)
  const tolerant = await runSteps({ automation: { ...automation, onError: 'continue' }, services, base: 'a:e1', data: {} })
  assert.equal(tolerant.stoppedAt, null)
})
