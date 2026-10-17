import test from 'node:test'
import assert from 'node:assert/strict'
import {
  KIND_LABELS, LEVEL_LABELS, STATUS_LABELS, dueDateToIso, dueLabel, formatDuration, isoToDateInput,
  moveLesson, moveSection, patchOutline, pickStartLesson, toReorderPayload,
} from './lmsLabels.js'

test('labels are Spanish', () => {
  assert.equal(LEVEL_LABELS.intermediate, 'Intermedio')
  assert.equal(STATUS_LABELS.draft, 'Borrador')
  assert.equal(KIND_LABELS.embed, 'Enlace de video')
})

test('formatDuration', () => {
  assert.equal(formatDuration(3900), '1 h 05 min')
  assert.equal(formatDuration(720), '12 min')
  assert.equal(formatDuration(45), '45 s')
  assert.equal(formatDuration(null), '')
  assert.equal(formatDuration(0), '')
})

test('dueLabel', () => {
  const now = new Date(2026, 9, 16, 12)
  assert.equal(dueLabel({ status: 'active', dueAt: new Date(2026, 9, 20, 23).toISOString() }, now), 'Vence 20 oct')
  assert.equal(dueLabel({ status: 'active', dueAt: new Date(2026, 9, 1).toISOString() }, now), 'Vencido')
  assert.equal(dueLabel({ status: 'active', overdue: true, dueAt: new Date(2026, 11, 1).toISOString() }, now), 'Vencido')
  assert.equal(dueLabel({ status: 'completed', dueAt: new Date(2026, 9, 1).toISOString() }, now), '')
  assert.equal(dueLabel({ status: 'active', dueAt: null }, now), '')
  assert.equal(dueLabel({ status: 'active', dueAt: new Date(2027, 0, 5).toISOString() }, now), 'Vence 5 ene 2027')
})

test('due date round trip uses the local day', () => {
  const iso = dueDateToIso('2026-10-20')
  assert.equal(isoToDateInput(iso), '2026-10-20')
  assert.equal(dueDateToIso(''), null)
})

const outline = [
  { id: 's1', lessons: [{ id: 'a', status: 'completed' }, { id: 'b', status: 'available' }] },
  { id: 's2', lessons: [{ id: 'c', status: 'locked' }] },
]

test('pickStartLesson', () => {
  assert.equal(pickStartLesson(outline, 'a'), 'a')
  assert.equal(pickStartLesson(outline, 'c'), 'b')
  assert.equal(pickStartLesson(outline), 'b')
  assert.equal(pickStartLesson([{ id: 's', lessons: [{ id: 'x', status: 'completed' }] }]), 'x')
  assert.equal(pickStartLesson([]), null)
})

test('moveLesson within and across sections', () => {
  assert.deepEqual(toReorderPayload(moveLesson(outline, 'b', -1)).sections[0].lessonIds, ['b', 'a'])
  const across = toReorderPayload(moveLesson(outline, 'b', 1))
  assert.deepEqual(across.sections.map((s) => s.lessonIds), [['a'], ['b', 'c']])
  const back = toReorderPayload(moveLesson(outline, 'c', -1))
  assert.deepEqual(back.sections.map((s) => s.lessonIds), [['a', 'b', 'c'], []])
  assert.equal(moveLesson(outline, 'a', -1), null)
  assert.equal(moveLesson(outline, 'c', 1), null)
  assert.deepEqual(outline[0].lessons.map((l) => l.id), ['a', 'b'])
})

test('moveSection', () => {
  assert.deepEqual(moveSection(outline, 's2', -1).map((s) => s.id), ['s2', 's1'])
  assert.equal(moveSection(outline, 's1', -1), null)
})

test('patchOutline updates lesson status and enrollment', () => {
  const patched = patchOutline({ enrollment: { progressPct: 0 }, sections: outline }, 'b', { lessonStatus: 'completed', enrollment: { progressPct: 67 } })
  assert.equal(patched.enrollment.progressPct, 67)
  assert.equal(patched.sections[0].lessons[1].status, 'completed')
  assert.equal(outline[0].lessons[1].status, 'available')
})
