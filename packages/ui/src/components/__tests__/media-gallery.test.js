import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupMedia } from '../MediaGallery.jsx'

const items = [
  { id: 'a', date: '2026-10-01T10:00:00Z', groupId: 'x', groupLabel: 'B item' },
  { id: 'b', date: '2026-10-03T10:00:00Z', groupId: 'y', groupLabel: 'A item' },
  { id: 'c', date: '2026-10-03T08:00:00Z', groupId: 'x', groupLabel: 'B item' },
]

test('grouping by date puts the newest day first and keeps one group per day', () => {
  const groups = groupMedia(items, 'date')
  assert.deepEqual(groups.map((g) => g.id), ['2026-10-03', '2026-10-01'])
  assert.deepEqual(groups[0].items.map((i) => i.id), ['b', 'c'])
})

test('grouping by record sorts by label; none keeps a single unlabeled group', () => {
  assert.deepEqual(groupMedia(items, 'group').map((g) => g.label), ['A item', 'B item'])
  const flat = groupMedia(items, 'none')
  assert.equal(flat.length, 1)
  assert.equal(flat[0].label, null)
})
