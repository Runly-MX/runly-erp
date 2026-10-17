import test from 'node:test'
import assert from 'node:assert/strict'
import { changeLessonKind, isLessonFormDirty, lessonFormToPayload, lessonToForm, validateLessonForm } from './lessonForm.js'

const lesson = { id: 'l1', sectionId: 's1', title: 'Intro', kind: 'text', body: '# Hola', durationSeconds: 600, required: true }

test('lessonToForm and payload round-trip; existing lessons never send their section', () => {
  const form = lessonToForm(lesson)
  assert.equal(form.durationMinutes, '10')
  const payload = lessonFormToPayload(form, { id: 'l1' })
  assert.equal(payload.sectionId, undefined)
  assert.equal(payload.durationSeconds, 600)
  assert.equal(lessonFormToPayload(lessonToForm(null, 's2')).sectionId, 's2')
})

test('validateLessonForm', () => {
  assert.deepEqual(validateLessonForm(lessonToForm(lesson)), {})
  const errors = validateLessonForm({ ...lessonToForm(null, 's1'), kind: 'embed', embedUrl: 'http://x' })
  assert.ok(errors.title && errors.embedUrl)
  assert.ok(validateLessonForm(lessonToForm(null, null)).sectionId)
})

test('isLessonFormDirty ignores trailing spaces, sees real edits', () => {
  const base = lessonToForm(lesson)
  assert.equal(isLessonFormDirty({ ...base, title: 'Intro  ' }, base, { id: 'l1' }), false)
  assert.equal(isLessonFormDirty({ ...base, body: '# Adiós' }, base, { id: 'l1' }), true)
  assert.equal(isLessonFormDirty({ ...base, sectionId: 's9' }, base, { id: 'l1' }), false)
})

test('changeLessonKind drops media and loads defaults', () => {
  const form = { ...lessonToForm(null, 's1'), upload: { fileId: 'f' } }
  const quiz = changeLessonKind(form, 'quiz')
  assert.equal(quiz.upload, null)
  assert.equal(quiz.settings.passingScore, '70')
})

test('video thumbnail: loaded from the lesson, saved as coverFileId, dropped when leaving video', () => {
  const form = lessonToForm({ ...lesson, kind: 'video', fileId: 'f1', coverFileId: 'c1', coverUrl: 'https://x/c1' })
  assert.deepEqual(form.cover, { fileId: 'c1', url: 'https://x/c1' })
  assert.equal(lessonFormToPayload(form, { id: 'l1' }).coverFileId, 'c1')
  assert.equal(isLessonFormDirty({ ...form, cover: null }, form, { id: 'l1' }), true)
  assert.equal(changeLessonKind(form, 'text').cover, null)
  assert.equal(lessonFormToPayload(lessonToForm(lesson), { id: 'l1' }).coverFileId, null)
})

test('validateLessonForm bounds the duration to 0-10000 minutes', () => {
  const form = lessonToForm(lesson)
  assert.ok(validateLessonForm({ ...form, durationMinutes: '10001' }).durationMinutes)
  assert.ok(validateLessonForm({ ...form, durationMinutes: '-1' }).durationMinutes)
  assert.equal(validateLessonForm({ ...form, durationMinutes: '' }).durationMinutes, undefined)
  assert.equal(validateLessonForm({ ...form, durationMinutes: '10000' }).durationMinutes, undefined)
})
