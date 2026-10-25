import test from 'node:test'
import assert from 'node:assert/strict'
import { runSteps } from '@runly/module-engine/contracts'
import { toRuntimeSteps, validateSystemAutomation } from '../automations.js'
import { previewAutomation } from '../automations-preview.js'

const notify = (title) => ({ service: 'runly.notifications:notifications.send', args: { userIds: { from: 'value', value: ['00000000-0000-7000-8000-00000000a001'] }, title: { from: 'template', template: title } } })
const branch = (extra = {}) => ({ type: 'branch', when: { field: 'total', op: 'gt', value: 1000 }, yes: 1, no: 1, ...extra })
const flow = (steps) => ({
  key: 'pedidos', label: 'Pedidos', enabled: true,
  trigger: { type: 'webhook', fields: [{ key: 'total', label: 'Total' }] },
  steps,
})
const codes = (automation) => validateSystemAutomation(automation).map((error) => error.code)

test('a condition with a path for each answer validates and joins after both', () => {
  assert.deepEqual(codes(flow([branch(), notify('Alto'), notify('Bajo'), notify('Fin')])), [])
})

test('conditions need blocks in their paths, something to check, and cannot nest', () => {
  assert.ok(codes(flow([branch({ yes: 0, no: 0 }), notify('x')])).includes('AUTOMATION_BRANCH_INVALID'))
  assert.ok(codes(flow([branch({ yes: 2, no: 2 }), notify('a'), notify('b')])).includes('AUTOMATION_BRANCH_INVALID'))
  assert.ok(codes(flow([branch(), notify('a'), notify('b')])).includes('AUTOMATION_BRANCH_INVALID')) // nothing to join after the paths
  assert.ok(codes(flow([branch({ when: undefined }), notify('a'), notify('b')])).includes('AUTOMATION_CONDITION_INVALID'))
  assert.ok(codes(flow([branch({ yes: 2, no: 0 }), branch(), notify('a'), notify('b')])).includes('AUTOMATION_BRANCH_INVALID'))
  assert.ok(codes(flow([branch({ when: { field: 'nada', op: 'filled' } }), notify('a'), notify('b')])).includes('AUTOMATION_FIELD_NOT_FOUND'))
})

test('up to 12 blocks and 3 conditions', () => {
  assert.deepEqual(codes(flow(Array.from({ length: 12 }, (_, i) => notify(`n${i}`)))), [])
  assert.ok(codes(flow(Array.from({ length: 13 }, (_, i) => notify(`n${i}`)))).includes('AUTOMATION_STEPS_INVALID'))
  const four = [branch({ yes: 1, no: 0 }), notify('a'), branch({ yes: 1, no: 0 }), notify('b'), branch({ yes: 1, no: 0 }), notify('c'), branch({ yes: 1, no: 0 }), notify('d')]
  assert.ok(codes(flow(four)).includes('AUTOMATION_BRANCH_INVALID'))
})

async function run(automation, data, from = 0) {
  const called = []
  const result = await runSteps({ automation: { ...automation, steps: toRuntimeSteps(automation) }, services: { call: async (service, args) => { called.push(args.title); return {} } }, base: 'b', data, from })
  return { called, result }
}

test('only the path that matches runs; the other one is logged as skipped', async () => {
  const automation = flow([branch(), notify('Alto'), notify('Bajo'), notify('Fin')])
  const high = await run(automation, { total: 5000 })
  assert.deepEqual(high.called, ['Alto', 'Fin'])
  assert.equal(high.result.steps[0].path, 'yes')
  assert.deepEqual(high.result.steps.map((step) => Boolean(step.skipped)), [false, false, true, false])
  assert.equal(high.result.ok, true)
  const low = await run(automation, { total: 10 })
  assert.deepEqual(low.called, ['Bajo', 'Fin'])
  assert.equal(low.result.steps[0].path, 'no')
})

test('resuming after a wait keeps skipping the path that was not taken', async () => {
  const automation = flow([branch({ yes: 2, no: 1 }), notify('Alto 1'), notify('Alto 2'), notify('Bajo'), notify('Fin')])
  const resumed = await run(automation, { total: 10 }, 2)
  assert.deepEqual(resumed.called, ['Bajo', 'Fin'])
})

test('preview follows the path the sample data takes', () => {
  const automation = flow([branch(), notify('Alto'), notify('Bajo'), notify('Fin')])
  const preview = previewAutomation(automation, { data: { total: 5000 } })
  assert.deepEqual(preview.steps.map((step) => step.kind), ['branch', 'service', 'service'])
  assert.equal(preview.steps[0].path, 'yes')
  assert.equal(previewAutomation(automation, { data: { total: 1 } }).steps[0].path, 'no')
})
