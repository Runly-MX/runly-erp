import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyDrop, containerDndId, lessonDndId, moveLessonAcross, parseDndId, sameCurriculumOrder, sectionDndId, withSectionIds,
} from './curriculumDnd.js'

const outline = [
  { id: 's1', lessons: [{ id: 'a', sectionId: 's1' }, { id: 'b', sectionId: 's1' }] },
  { id: 's2', lessons: [{ id: 'c', sectionId: 's2' }] },
  { id: 's3', lessons: [] },
]
const ids = (sections) => sections.map((s) => `${s.id}:${s.lessons.map((l) => l.id).join('')}`)

test('parseDndId', () => {
  assert.deepEqual(parseDndId(sectionDndId('x')), { type: 'section', id: 'x' })
  assert.deepEqual(parseDndId(lessonDndId('y')), { type: 'lesson', id: 'y' })
  assert.deepEqual(parseDndId(containerDndId('z')), { type: 'container', id: 'z' })
  assert.deepEqual(parseDndId('nope'), { type: null, id: null })
})

test('moveLessonAcross moves a lesson before the hovered lesson or into an empty section', () => {
  const before = moveLessonAcross(outline, 'b', lessonDndId('c'))
  assert.deepEqual(ids(before), ['s1:a', 's2:bc', 's3:'])
  assert.equal(before[1].lessons[0].sectionId, 's2')
  assert.deepEqual(ids(moveLessonAcross(outline, 'a', containerDndId('s3'))), ['s1:b', 's2:c', 's3:a'])
  assert.equal(moveLessonAcross(outline, 'a', lessonDndId('b')), outline)
})

test('applyDrop reorders lessons within a section and sections', () => {
  assert.deepEqual(ids(applyDrop(outline, lessonDndId('a'), lessonDndId('b'))), ['s1:ba', 's2:c', 's3:'])
  assert.deepEqual(ids(applyDrop(outline, sectionDndId('s3'), sectionDndId('s1'))), ['s3:', 's1:ab', 's2:c'])
  assert.equal(applyDrop(outline, lessonDndId('a'), lessonDndId('a')), outline)
})

test('sameCurriculumOrder and withSectionIds', () => {
  assert.equal(sameCurriculumOrder(outline, withSectionIds(outline)), true)
  const moved = withSectionIds([{ id: 's2', lessons: [{ id: 'a', sectionId: 's1' }] }])
  assert.equal(moved[0].lessons[0].sectionId, 's2')
  assert.equal(sameCurriculumOrder(outline, applyDrop(outline, lessonDndId('a'), lessonDndId('b'))), false)
})
