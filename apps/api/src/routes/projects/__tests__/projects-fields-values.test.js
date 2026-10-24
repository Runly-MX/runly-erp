import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeFieldValue, FieldServiceError } from '../projects-fields-service.js'
import { createProjectsService } from '../projects-service.js'

describe('typed task field values', () => {
  const f = (kind, extra = {}) => ({ name: 'Campo', kind, ...extra })

  it('accepts and normalizes valid values', () => {
    assert.equal(normalizeFieldValue(f('NUMBER'), ' 12.50 '), '12.5')
    assert.equal(normalizeFieldValue(f('DATE'), '2026-10-24'), '2026-10-24')
    assert.equal(normalizeFieldValue(f('SELECT', { options: ['A', 'B'] }), 'B'), 'B')
    assert.equal(normalizeFieldValue(f('SELECT', { options: [{ value: 'x', label: 'X' }] }), 'x'), 'x')
    assert.equal(normalizeFieldValue(f('CHECKBOX'), 'true'), 'true')
    assert.equal(normalizeFieldValue(f('TEXT'), ' hola '), 'hola')
  })

  it('rejects invalid values with 400', () => {
    for (const [field, value] of [
      [f('NUMBER'), 'abc'],
      [f('DATE'), 'manana'],
      [f('SELECT', { options: ['A'] }), 'Z'],
      [f('CHECKBOX'), 'si'],
      [f('USER'), 'not-a-uuid'],
    ]) {
      assert.throws(() => normalizeFieldValue(field, value), (e) => e instanceof FieldServiceError && e.status === 400)
    }
  })
})

describe('personal project', () => {
  it('returns the existing one and creates it once otherwise', async () => {
    let created = 0
    const prisma = {
      project: { findFirst: async () => null },
      $transaction: async (fn) => fn({
        project: { create: async ({ data }) => { created++; return { id: 'p-1', ...data } } },
        taskStatus: { createMany: async () => {} },
        projectMember: { create: async () => {} },
      }),
    }
    const project = await createProjectsService({ prisma }).getOrCreatePersonalProject('co-1', 'u-1')
    assert.equal(project.kind, 'PERSONAL')
    assert.equal(created, 1)

    const found = { id: 'p-9', kind: 'PERSONAL' }
    const again = await createProjectsService({ prisma: { project: { findFirst: async () => found } } }).getOrCreatePersonalProject('co-1', 'u-1')
    assert.equal(again, found)
  })
})
