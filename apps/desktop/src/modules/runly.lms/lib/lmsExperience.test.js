import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  coursePagePath, courseCta, formatClock, initialOpenSections, kindTone, KIND_TONES, moveItem, playerPath, readTheater,
  resourceName, sectionSeconds, writeTheater,
} from './lmsExperience.js'

function memoryStorage() {
  const map = new Map()
  return { getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)) }
}

test('paths', () => {
  assert.equal(coursePagePath('c1'), '/app/m/runly.lms/course/c1')
  assert.equal(playerPath('c1'), '/app/m/runly.lms/learn/c1')
  assert.equal(playerPath('c1', 'l 1'), '/app/m/runly.lms/learn/c1?lesson=l%201')
})

test('formatClock', () => {
  assert.equal(formatClock(0), '')
  assert.equal(formatClock(null), '')
  assert.equal(formatClock(65), '1:05')
  assert.equal(formatClock(3723), '1:02:03')
})

test('kindTone falls back for unknown kinds', () => {
  assert.equal(kindTone('quiz'), KIND_TONES.quiz)
  assert.equal(kindTone('zzz'), KIND_TONES.file)
})

test('sectionSeconds ignores unknown durations', () => {
  assert.equal(sectionSeconds({ lessons: [{ durationSeconds: 60 }, { durationSeconds: null }, { durationSeconds: -3 }, { durationSeconds: 29.6 }] }), 90)
  assert.equal(sectionSeconds(null), 0)
})

test('theater memory survives broken storage', () => {
  const storage = memoryStorage()
  assert.equal(readTheater(storage), false)
  writeTheater(true, storage)
  assert.equal(readTheater(storage), true)
  writeTheater(false, storage)
  assert.equal(readTheater(storage), false)
  const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.equal(readTheater(broken), false)
  assert.doesNotThrow(() => writeTheater(true, broken))
  assert.equal(readTheater(undefined), false)
})

test('courseCta covers every enrollment state', () => {
  assert.equal(courseCta({ canEnroll: true }).label, 'Inscribirme')
  assert.equal(courseCta({ enrollment: { status: 'dropped' }, canEnroll: true }).label, 'Volver a inscribirme')
  assert.equal(courseCta({ enrollment: { status: 'active', progressPct: 0 } }).action, 'start')
  assert.equal(courseCta({ enrollment: { status: 'active', progressPct: 40 } }).label, 'Continuar')
  const done = courseCta({ enrollment: { status: 'completed' }, certificate: { id: 'x' } })
  assert.equal(done.action, 'certificate')
  assert.equal(done.secondary.action, 'review')
  assert.equal(courseCta({ enrollment: { status: 'completed' } }).action, 'review')
  assert.equal(courseCta({ canManage: true }).action, 'preview')
  assert.equal(courseCta({}).action, 'none')
})

test('resourceName, moveItem and initialOpenSections', () => {
  assert.equal(resourceName({ title: ' Guía ', fileName: 'a.pdf' }), 'Guía')
  assert.equal(resourceName({ title: '', fileName: 'a.pdf' }), 'a.pdf')
  assert.equal(resourceName(null), 'Archivo')
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a'])
  assert.deepEqual(moveItem(['a', 'b'], 0, 5), ['a', 'b'])
  const sections = [{ id: 's1', lessons: [{ id: 'l1' }] }, { id: 's2', lessons: [{ id: 'l2' }] }]
  assert.deepEqual(initialOpenSections(sections, 'l2'), ['s2'])
  assert.deepEqual(initialOpenSections(sections), ['s1'])
  assert.deepEqual(initialOpenSections([]), [])
})
