import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PARTICIPANT_COLORS, assignColors, groupParticipants, participantColor, selectionsByObject } from './studio-presence.js'

test('participant colour is stable, from the palette and never the local fuchsia', () => {
  const id = '0192f6a0-1111-7000-8000-000000000001'
  assert.equal(participantColor(id), participantColor(id))
  assert.ok(PARTICIPANT_COLORS.includes(participantColor(id)))
  assert.ok(!PARTICIPANT_COLORS.some(color => /^#(d946ef|c026d3|a21caf)$/i.test(color)))
  assert.ok(new Set(Array.from({ length: 40 }, (_, index) => participantColor(`user-${index}`))).size > 5)
})

test('sessions of the same person collapse into one participant', () => {
  const rows = [{ userId: 'a', sessionId: 's1', name: 'Ana', selectedId: 'o1' }, { userId: 'b', sessionId: 's2', name: '' }, { userId: 'a', sessionId: 's3', name: 'Ana', selectedId: 'o2' }]
  const people = groupParticipants(rows)
  assert.equal(people.length, 2)
  assert.equal(people[0].sessions.length, 2)
  assert.equal(people[1].name, 'Colaborador')
})

test('selectionsByObject lists each person once per object', () => {
  const rows = [{ userId: 'a', selectedId: 'o1' }, { userId: 'a', selectedId: 'o1' }, { userId: 'b', selectedId: 'o1' }, { userId: 'c', selectedId: null }]
  const map = selectionsByObject(rows)
  assert.deepEqual(map.get('o1').map(person => person.userId), ['a', 'b'])
  assert.equal(map.size, 1)
})

test('colliding people present together get different colours, the same on every client', () => {
  const ids = Array.from({ length: 300 }, (_, index) => `user-${index}`)
  const pair = ids.flatMap(a => ids.filter(b => a < b && participantColor(a) === participantColor(b)).map(b => [a, b]))[0]
  assert.ok(pair, 'fixture needs a colliding pair')
  const colors = assignColors(pair)
  assert.notEqual(colors.get(pair[0]), colors.get(pair[1]))
  assert.equal(colors.get(pair[0]), participantColor(pair[0]))
  assert.deepEqual([...assignColors([...pair].reverse())], [...colors])
  const seenByA = groupParticipants([{ userId: pair[1], sessionId: 'x' }], pair[0])[0].color
  assert.equal(seenByA, colors.get(pair[1]))
})

test("the local user's other tabs are marked and named apart", () => {
  const [me, other] = groupParticipants([{ userId: 'me', sessionId: 's1', name: 'Yo' }, { userId: 'ana', sessionId: 's2', name: 'Ana' }], 'me')
  assert.equal(me.isSelf, true); assert.equal(me.name, 'Tú (otra pestaña)'); assert.equal(other.isSelf, false)
})
