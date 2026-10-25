import test from 'node:test'
import assert from 'node:assert/strict'
import { autoSectionOf, buildSections, isMeeting, matchesFilter, DEFAULT_SIDEBAR } from '../sidebarSections.js'

const conv = (over) => ({ id: over.id, type: 'direct', title: null, unread_count: 0, unread_mention_count: 0, ...over })

test('conversations land in their automatic section', () => {
  assert.equal(autoSectionOf(conv({ id: 'a', type: 'channel', title: 'ventas' })), 'channels')
  assert.equal(autoSectionOf(conv({ id: 'b', type: 'group' })), 'direct')
  assert.equal(autoSectionOf(conv({ id: 'c', type: 'channel', title: 'x', is_pinned: true })), 'starred')
  assert.equal(autoSectionOf(conv({ id: 'd', type: 'external_support' })), 'support')
})

test('meeting channels are tagged or recognised by their generated name, never public ones', () => {
  assert.equal(isMeeting(conv({ id: 'a', type: 'channel', metadata: { origin: 'meeting' } })), true)
  assert.equal(isMeeting(conv({ id: 'b', type: 'channel', title: 'Reunión 26 oct', is_public: false })), true)
  assert.equal(isMeeting(conv({ id: 'c', type: 'channel', title: 'Reunión semanal', is_public: true })), false)
  assert.equal(isMeeting(conv({ id: 'd', type: 'group', title: 'Reunión 26 oct' })), false)
})

test('filters keep unread or mentioned conversations only', () => {
  assert.equal(matchesFilter(conv({ id: 'a', unread_count: 2 }), 'unread'), true)
  assert.equal(matchesFilter(conv({ id: 'a' }), 'unread'), false)
  assert.equal(matchesFilter(conv({ id: 'a', unread_count: 2 }), 'mentions'), false)
  assert.equal(matchesFilter(conv({ id: 'a', unread_mention_count: 1 }), 'mentions'), true)
})

test('sections: MirAI apart, starred first, custom after it, empty automatic hidden, meetings collapsed', () => {
  const state = { ...DEFAULT_SIDEBAR, sections: [{ id: 's1', name: 'Clientes', collapsed: false }], assignments: { c1: 's1' } }
  const list = [
    conv({ id: 'm', type: 'mirai' }), conv({ id: 'c1', type: 'channel', title: 'acme', unread_count: 3 }),
    conv({ id: 'c2', type: 'channel', title: 'general' }), conv({ id: 'p', type: 'group', is_pinned: true }),
    conv({ id: 'r', type: 'channel', title: 'Reunión 3 nov', metadata: { origin: 'meeting' } }),
  ]
  const out = buildSections({ conversations: list, state })
  assert.deepEqual(out.mirai.map((c) => c.id), ['m'])
  assert.deepEqual(out.sections.map((s) => s.key), ['starred', 'custom:s1', 'channels', 'meetings'])
  assert.equal(out.sections.find((s) => s.key === 'custom:s1').unread, 3)
  assert.equal(out.sections.find((s) => s.key === 'meetings').collapsed, true)
})

test('a custom section stays when empty, and hides under a filter with no matches', () => {
  const state = { ...DEFAULT_SIDEBAR, sections: [{ id: 's1', name: 'Vacía', collapsed: false }] }
  assert.equal(buildSections({ conversations: [], state }).sections.length, 1)
  assert.equal(buildSections({ conversations: [conv({ id: 'a', type: 'channel' })], state, filter: 'unread' }).sections.length, 0)
})

test('assignments to a deleted section fall back to the automatic one', () => {
  const state = { ...DEFAULT_SIDEBAR, assignments: { a: 'gone' } }
  assert.deepEqual(buildSections({ conversations: [conv({ id: 'a', type: 'channel' })], state }).sections.map((s) => s.key), ['channels'])
})
