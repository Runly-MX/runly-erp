import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLessonInput } from '../lms-core.js'
import { createLmsSerializers } from '../lms-serialize.js'

const COVER = '0192f0a0-0000-7000-8000-000000000001'

test('normalizeLessonInput accepts coverFileId like fileId', () => {
  assert.equal(normalizeLessonInput({ coverFileId: COVER }, { partial: true }).coverFileId, COVER)
  assert.equal(normalizeLessonInput({ coverFileId: null }, { partial: true }).coverFileId, null)
  assert.equal('coverFileId' in normalizeLessonInput({ title: 'x' }, { partial: true }), false)
  assert.throws(() => normalizeLessonInput({ coverFileId: 'nope' }, { partial: true }), /Identificador inválido/)
})

function serializers(signFile) {
  const prisma = { fileAsset: { findMany: async () => [] } }
  return createLmsSerializers({ prisma, signFile })
}

const row = (extra = {}) => ({ id: 'l1', courseId: 'c1', sectionId: 's1', title: 'Intro', kind: 'video', fileId: null, position: 1, required: true, enabled: true, settings: null, ...extra })

test('authoring lesson serializer signs coverUrl with the card variant', async () => {
  const calls = []
  const ser = serializers(async (fileId, variant) => { calls.push([fileId, variant]); return `https://signed/${fileId}` })
  const lesson = await ser.serializeLesson(row({ coverFileId: COVER }))
  assert.equal(lesson.coverFileId, COVER)
  assert.equal(lesson.coverUrl, `https://signed/${COVER}`)
  assert.deepEqual(calls, [[COVER, 'tilefit']])
  const [section] = await ser.serializeSections([{ id: 's1', courseId: 'c1', title: 'S', position: 1, lessons: [row({ coverFileId: COVER }), row({ id: 'l2' })] }])
  assert.deepEqual(section.lessons.map((l) => l.coverUrl), [`https://signed/${COVER}`, null])
})

test('coverUrl is null without a cover or when signing fails', async () => {
  const ser = serializers(async () => { throw new Error('storage down') })
  assert.equal((await ser.serializeLesson(row())).coverUrl, null)
  assert.equal((await ser.serializeLesson(row({ coverFileId: COVER }))).coverUrl, null)
})
