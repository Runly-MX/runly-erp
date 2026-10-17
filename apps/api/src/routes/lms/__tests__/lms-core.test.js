import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LmsError, progressPct, lessonStates, shouldAutoComplete, isOverdue,
  normalizeEmbedUrl, normalizeCourseInput, normalizeLessonInput, orderLessons,
} from '../lms-core.js'

const L = (id, extra = {}) => ({ id, required: true, enabled: true, ...extra })

test('progressPct counts only required enabled lessons', () => {
  const lessons = [L('a'), L('b'), L('c', { required: false }), L('d', { enabled: false })]
  assert.equal(progressPct(lessons, new Set()), 0)
  assert.equal(progressPct(lessons, new Set(['a'])), 50)
  assert.equal(progressPct(lessons, new Set(['a', 'c', 'd'])), 50)
  assert.equal(progressPct(lessons, new Set(['a', 'b'])), 100)
  assert.equal(progressPct([L('x'), L('y'), L('z')], new Set(['x'])), 33)
  assert.equal(progressPct([], new Set()), 0)
})

test('lessonStates: sequential locks until earlier required lessons complete', () => {
  const lessons = [L('a'), L('b', { required: false }), L('c'), L('d')]
  let states = lessonStates(lessons, new Map(), { sequential: true })
  assert.equal(states.get('a'), 'available')
  assert.equal(states.get('b'), 'locked')
  assert.equal(states.get('c'), 'locked')

  const progress = new Map([['a', { status: 'completed' }]])
  states = lessonStates(lessons, progress, { sequential: true })
  assert.equal(states.get('a'), 'completed')
  assert.equal(states.get('b'), 'available')
  // optional lesson b does not block c
  assert.equal(states.get('c'), 'available')
  assert.equal(states.get('d'), 'locked')

  progress.set('c', { status: 'in_progress' })
  states = lessonStates(lessons, progress, { sequential: true })
  assert.equal(states.get('c'), 'in_progress')
  assert.equal(states.get('d'), 'locked')
})

test('lessonStates: non-sequential or unlocked previews never lock', () => {
  const lessons = [L('a'), L('b'), L('c')]
  let states = lessonStates(lessons, new Map(), { sequential: false })
  assert.deepEqual([...states.values()], ['available', 'available', 'available'])
  states = lessonStates(lessons, new Map(), { sequential: true, locked: false })
  assert.deepEqual([...states.values()], ['available', 'available', 'available'])
})

test('shouldAutoComplete at 90% for video/embed only', () => {
  assert.equal(shouldAutoComplete({ kind: 'video', positionSeconds: 89, durationSeconds: 100 }), false)
  assert.equal(shouldAutoComplete({ kind: 'video', positionSeconds: 90, durationSeconds: 100 }), true)
  assert.equal(shouldAutoComplete({ kind: 'embed', positionSeconds: 95, durationSeconds: 100 }), true)
  assert.equal(shouldAutoComplete({ kind: 'embed', positionSeconds: 95, durationSeconds: null }), false)
  assert.equal(shouldAutoComplete({ kind: 'text', positionSeconds: 100, durationSeconds: 100 }), false)
})

test('isOverdue only for active enrollments past due date', () => {
  const now = new Date('2026-10-16T12:00:00Z')
  assert.equal(isOverdue({ status: 'active', dueAt: new Date('2026-10-15T00:00:00Z') }, now), true)
  assert.equal(isOverdue({ status: 'active', dueAt: new Date('2026-10-17T00:00:00Z') }, now), false)
  assert.equal(isOverdue({ status: 'completed', dueAt: new Date('2026-10-15T00:00:00Z') }, now), false)
  assert.equal(isOverdue({ status: 'active', dueAt: null }, now), false)
})

test('normalizeEmbedUrl', () => {
  assert.equal(normalizeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  assert.equal(normalizeEmbedUrl('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  assert.equal(normalizeEmbedUrl('https://youtube.com/shorts/dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  assert.equal(normalizeEmbedUrl('https://vimeo.com/123456789'), 'https://player.vimeo.com/video/123456789')
  assert.equal(normalizeEmbedUrl('https://example.com/player/1'), 'https://example.com/player/1')
  assert.throws(() => normalizeEmbedUrl('http://example.com/v'), LmsError)
  assert.throws(() => normalizeEmbedUrl('javascript:alert(1)'), LmsError)
  assert.throws(() => normalizeEmbedUrl(''), LmsError)
})

test('normalizeCourseInput validates title and level', () => {
  assert.throws(() => normalizeCourseInput({ title: '   ' }, { partial: false }), LmsError)
  assert.throws(() => normalizeCourseInput({ title: 'Curso', level: 'expert' }, { partial: false }), LmsError)
  assert.throws(() => normalizeCourseInput({ title: 'Curso', estimatedMinutes: -1 }, { partial: false }), LmsError)
  const data = normalizeCourseInput({ title: '  Inducción ', level: 'advanced', sequential: true, estimatedMinutes: 30 }, { partial: false })
  assert.equal(data.title, 'Inducción')
  assert.equal(data.level, 'advanced')
  assert.equal(data.sequential, true)
  assert.equal(data.estimatedMinutes, 30)
  assert.deepEqual(normalizeCourseInput({ summary: 'x' }, { partial: true }), { summary: 'x' })
})

test('normalizeLessonInput validates kind and normalizes embed', () => {
  assert.throws(() => normalizeLessonInput({ title: 'A', kind: 'quiz' }, { partial: false }), LmsError)
  const data = normalizeLessonInput({ title: 'A', kind: 'embed', embedUrl: 'https://youtu.be/abcdefghijk', required: false }, { partial: false })
  assert.equal(data.embedUrl, 'https://www.youtube-nocookie.com/embed/abcdefghijk')
  assert.equal(data.required, false)
})

test('orderLessons flattens by section then lesson position, enabled only', () => {
  const sections = [
    { id: 's2', position: 2, lessons: [{ id: 'c', position: 1, enabled: true }] },
    { id: 's1', position: 1, lessons: [{ id: 'b', position: 2, enabled: true }, { id: 'a', position: 1, enabled: true }, { id: 'x', position: 0, enabled: false }] },
  ]
  assert.deepEqual(orderLessons(sections).map((l) => l.id), ['a', 'b', 'c'])
})
