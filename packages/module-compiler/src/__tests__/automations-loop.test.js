import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAutomations, serviceStepsOf, toRuntimeSteps, validateSystemAutomation } from '../automations.js'
import { runSteps } from '@runly/module-engine/contracts'

const PERSON = '01a10900-0000-7000-8000-000000000001'
const notify = (title) => ({ service: 'runly.notifications:notifications.send', args: { userIds: { from: 'value', value: [PERSON] }, title: { from: 'template', template: title } } })
const automation = (steps, extra = {}) => ({ key: 'repaso', label: 'Repaso', trigger: { type: 'schedule', every: 'day', at: '08:00' }, steps, ...extra })
const loop = (extra = {}) => ({ type: 'loop', service: 'runly.inventory:items.search', args: { search: { from: 'value', value: 'laptop' } }, when: { field: 'status', op: 'equals', value: 'maintenance' }, do: [notify('{{elemento_name}} sigue en mantenimiento')], ...extra })

test('a loop searches, uses the item fields inside and its count after; reads of one record are steps', () => {
  assert.deepEqual(validateSystemAutomation(automation([loop(), notify('Revisados: {{paso1_count}}')])), [])
  const codes = (steps) => validateSystemAutomation(automation(steps)).map((d) => d.code)
  assert.ok(codes([loop({ do: [notify('{{name}}')] })]).includes('AUTOMATION_FIELD_NOT_FOUND')) // item fields are elemento_*
  assert.ok(codes([notify('{{elemento_name}}')]).includes('AUTOMATION_FIELD_NOT_FOUND')) // only inside the loop
  assert.ok(codes([loop({ service: 'runly.contacts:contacts.create' })]).includes('AUTOMATION_SERVICE_READONLY'))
  assert.ok(codes([loop({ do: [] })]).includes('AUTOMATION_LOOP_INVALID'))
  assert.ok(codes([loop({ do: [{ type: 'delay', amount: 1, unit: 'days' }] })]).includes('AUTOMATION_LOOP_INVALID'))
  assert.ok(codes([{ type: 'branch', when: { field: 'firedAt', op: 'filled' }, yes: 1, no: 0 }, loop(), notify('x')]).includes('AUTOMATION_LOOP_INVALID'))
  // A read of one record feeds the next blocks.
  const read = { service: 'runly.identity:people.read', args: { id: { from: 'value', value: PERSON } } }
  assert.deepEqual(validateSystemAutomation(automation([read, notify('Hola {{paso1_name}}')])), [])
  // A list service alone is not a step.
  assert.ok(codes([{ service: 'runly.inventory:items.search', args: {} }]).includes('AUTOMATION_SERVICE_READONLY'))

  const [normal] = normalizeAutomations([automation([loop()])])
  assert.equal(normal.steps[0].type, 'loop')
  assert.deepEqual(serviceStepsOf(normal).map((step) => step.service), ['runly.inventory:items.search', 'runly.notifications:notifications.send'])
})

test('the runtime repeats the actions per matching item, keeps going when one fails and reports it', async () => {
  const [normal] = normalizeAutomations([automation([loop(), notify('Revisados: {{paso1_count}}')])])
  const runtime = { ...normal, steps: toRuntimeSteps(normal) }
  const calls = []
  const services = {
    call: async (service, args) => {
      calls.push({ service, args })
      if (service.endsWith('items.search')) return { total: 3, items: [{ id: 'a', name: 'A', status: 'maintenance' }, { id: 'b', name: 'B', status: 'available' }, { id: 'c', name: 'C', status: 'maintenance' }] }
      if (args.title === 'C sigue en mantenimiento') throw Object.assign(new Error('caído'), { status: 503 })
      return { sent: 1 }
    },
  }
  const result = await runSteps({ automation: runtime, services, base: 'repaso:d1', data: {} })
  assert.equal(calls[0].args.search, 'laptop')
  assert.deepEqual(calls.slice(1, 3).map((call) => call.args.idempotencyKey), ['repaso:d1:0:a:0', 'repaso:d1:0:c:0'])
  assert.equal(result.steps[0].ok, false)
  assert.equal(result.steps[0].iterations, 2)
  assert.equal(result.steps[0].done, 1)
  assert.equal(result.steps[0].status, 503)
  assert.equal(result.stoppedAt, 0)
  assert.equal(result.scope.paso1_count, 1)
})
