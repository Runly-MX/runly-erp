import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSystemAutomation, normalizeAutomations } from '@runly/module-compiler'
import { dayText, targetDay } from '../automation-date-sources.js'
import { createSystemAutomationsService } from '../system-automations-service.js'

const PERSON = '01a10900-0000-7000-8000-000000000001'
const definition = (trigger) => ({
  key: 'por_vencer', label: 'Facturas por vencer', enabled: true, trigger,
  steps: [{ service: 'runly.notifications:notifications.send', args: { userIds: { from: 'value', value: [PERSON] }, title: { from: 'template', template: 'Vence {{number}}' }, link: { from: 'template', template: '/app/m/runly.purchases/purchases/invoices/{{id}}' } } }],
})

test('the day a date trigger looks for: offset -3 means records dated three days ahead, in the instance time zone', () => {
  // 03:00 UTC on 1 Nov is still 31 Oct in Mexico City.
  assert.equal(dayText(targetDay('2026-11-01T03:00:00Z', -3, 'America/Mexico_City')), '2026-11-03')
  assert.equal(dayText(targetDay('2026-11-01T15:00:00Z', 2, 'America/Mexico_City')), '2026-10-30')
})

test('date triggers validate their source, offset and time, and expose the source fields', () => {
  assert.deepEqual(validateSystemAutomation(definition({ type: 'date', source: 'purchases.invoice.due', offsetDays: -3, at: '08:00', when: { field: 'total', op: 'gt', value: 1000 } })), [])
  const codes = (trigger) => validateSystemAutomation(definition(trigger)).map((d) => d.code)
  assert.ok(codes({ type: 'date', source: 'nada', offsetDays: 0, at: '08:00' }).includes('AUTOMATION_TRIGGER_INVALID'))
  assert.ok(codes({ type: 'date', source: 'purchases.invoice.due', offsetDays: 90, at: '08:00' }).includes('AUTOMATION_TRIGGER_INVALID'))
  assert.ok(codes({ type: 'date', source: 'purchases.invoice.due', offsetDays: 0, at: '8am' }).includes('AUTOMATION_TRIGGER_INVALID'))
  assert.ok(codes({ type: 'date', source: 'projects.task.due', offsetDays: 0, at: '08:00' }).includes('AUTOMATION_FIELD_NOT_FOUND')) // tasks have no number
  const [normal] = normalizeAutomations([definition({ type: 'date', source: 'purchases.invoice.due', offsetDays: -3, at: '08:00' })])
  assert.deepEqual(normal.trigger, { type: 'date', source: 'purchases.invoice.due', offsetDays: -3, at: '08:00' })
})

test('a date trigger runs once per due record that matches, as a daily schedule', async () => {
  const row = { id: 's1', companyId: 'c1', key: 'por_vencer', label: 'Facturas por vencer', enabled: true, createdById: null }
  const [normal] = normalizeAutomations([definition({ type: 'date', source: 'purchases.invoice.due', offsetDays: -3, at: '08:00', when: { field: 'total', op: 'gt', value: 1000 } })])
  const { key: _key, label: _label, enabled: _enabled, ...stored } = normal
  row.definition = stored
  const asked = []
  const runs = []
  const prisma = {
    systemAutomation: { findUnique: async () => row, findMany: async () => [row] },
    purchaseInvoice: {
      findMany: async ({ where }) => {
        asked.push(where)
        return [
          { id: 'i1', number: 'F-1', supplierId: null, status: 'PENDING', total: 5000, paidAmount: 1000, currency: 'MXN' },
          { id: 'i2', number: 'F-2', supplierId: null, status: 'PENDING', total: 300, paidAmount: 0, currency: 'MXN' },
        ]
      },
    },
    automationRun: { create: async ({ data }) => { const run = { id: `r${runs.length + 1}`, durationMs: 0, ...data }; runs.push(run); return run }, findFirst: async ({ where }) => runs.find((run) => run.id === where.id), update: async ({ where, data }) => Object.assign(runs.find((run) => run.id === where.id), data) },
  }
  const calls = []
  const moduleServices = { forSystem: () => ({ call: async (service, args) => { calls.push(args); return { sent: 1 } } }) }
  const svc = createSystemAutomationsService({ prisma, moduleServices })
  assert.deepEqual(await svc.scheduleOf({ companyId: 'c1', key: 'por_vencer' }), { key: 'por_vencer', every: 'day', at: '08:00' })
  assert.deepEqual(await svc.runSchedule({ companyId: 'c1', key: 'por_vencer', occurrence: '2026-11-01T14:00:00Z', timeZone: 'America/Mexico_City' }), { ran: 1 })
  assert.equal(asked[0].dueDate.toISOString(), '2026-11-04T00:00:00.000Z')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].title, 'Vence F-1')
  assert.equal(calls[0].link, '/app/m/runly.purchases/purchases/invoices/i1')
  assert.equal(calls[0].idempotencyKey, 'por_vencer:i1:2026-11-04')
  assert.equal(runs.at(-1).status, 'success')
})
