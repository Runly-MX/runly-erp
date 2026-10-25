import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSidebar, MAX_SECTIONS } from '../chat-sidebar-service.js'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('empty or bad input gives the default state', () => {
  assert.deepEqual(normalizeSidebar(null), { sections: [], assignments: {}, collapsed: {}, order: [], hidden: [], filter: 'all' })
  assert.deepEqual(normalizeSidebar('x'), normalizeSidebar(undefined))
})

test('sections are validated, deduplicated, capped and trimmed', () => {
  const sections = [{ id: id(1), name: '  Clientes  ' }, { id: id(1), name: 'Repetida' }, { id: 'no-uuid', name: 'x' }, { id: id(2), name: '' }, ...Array.from({ length: 30 }, (_, i) => ({ id: id(100 + i), name: `S${i}` }))]
  const out = normalizeSidebar({ sections })
  assert.equal(out.sections[0].name, 'Clientes')
  assert.equal(out.sections.length, MAX_SECTIONS)
  assert.ok(!out.sections.some((s) => s.id === 'no-uuid'))
})

test('assignments keep only valid conversations pointing at existing sections', () => {
  const out = normalizeSidebar({ sections: [{ id: id(1), name: 'A' }], assignments: { [id(10)]: id(1), [id(11)]: id(99), bad: id(1) } })
  assert.deepEqual(out.assignments, { [id(10)]: id(1) })
})

test('automatic keys and filter are whitelisted', () => {
  const out = normalizeSidebar({ order: ['direct', 'hack', 'direct'], hidden: ['support', 'x'], collapsed: { meetings: true, channels: 'si' }, filter: 'everything' })
  assert.deepEqual(out.order, ['direct'])
  assert.deepEqual(out.hidden, ['support'])
  assert.deepEqual(out.collapsed, { meetings: true })
  assert.equal(out.filter, 'all')
})
