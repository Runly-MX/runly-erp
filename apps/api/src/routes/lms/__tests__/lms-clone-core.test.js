import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonical, contentChecksum, defaultMap, planClone } from '../lms-clone-core.js'

// Same shape as the acceptance case: intro text, 10 open questions worth 100 with uneven points,
// an assignment describing 7 Excel items, and the original workbook as a file lesson.
const POINTS = [15, 10, 10, 10, 10, 10, 10, 10, 5, 10]
function source() {
  const course = { id: 'c1', kind: 'course', title: 'Analista', summary: null, description: 'Instrucciones', settings: {} }
  const sections = [{ id: 's2', position: 2 }, { id: 's1', position: 1 }]
  const lessons = [
    { id: 'task', sectionId: 's2', position: 1, kind: 'assignment', title: 'Ejercicio Excel', body: '7 reactivos', settings: { allowText: true, allowFiles: true, maxFiles: 5, dueDaysAfterEnroll: 7 } },
    { id: 'book', sectionId: 's2', position: 0, kind: 'file', title: 'Base original', fileId: 'f-xlsx', settings: {} },
    { id: 'intro', sectionId: 's1', position: 0, kind: 'text', title: 'Bienvenida', settings: {} },
    { id: 'quiz', sectionId: 's1', position: 1, kind: 'quiz', title: 'Cuestionario', body: null, settings: { showAnswers: 'after_submit', timeLimitMinutes: 30, maxAttempts: 2, layout: 'one' } },
  ]
  const questions = POINTS.map((points, i) => ({ id: `q${i}`, lessonId: 'quiz', position: 9 - i, kind: 'open', prompt: `Pregunta ${10 - i}`, options: [], explanation: null, points }))
  return { course, sections, lessons, questions, resources: [] }
}

test('default plan: quiz and assignment become activities, points and questions verbatim, Excel as material', () => {
  const plan = planClone(source())
  assert.deepEqual(plan.activities.map((a) => [a.from, a.type]), [['quiz', 'questionnaire'], ['task', 'practical']])
  const quiz = plan.activities[0]
  assert.deepEqual(quiz.questions.map((q) => q.prompt), Array.from({ length: 10 }, (_, i) => `Pregunta ${i + 1}`), 'source order by position')
  assert.equal(quiz.questions.reduce((s, q) => s + q.points, 0), 100)
  assert.equal(plan.totalPoints, 200)
  assert.deepEqual(plan.activities[1].resources.map((r) => r.fileId), ['f-xlsx'])
  assert.deepEqual(plan.skipped.map((s) => s.lessonId), ['intro'])
  assert.equal(plan.assessment.settings.timeLimitMinutes, 60)
  assert.equal(plan.assessment.settings.maxSessions, 1)
  assert.equal(plan.assessment.settings.sourceCourseId, 'c1')
})

test('exam adjustments are applied and reported, never silent', () => {
  const plan = planClone(source())
  const quiz = Object.fromEntries(plan.activities[0].adjustments.map((a) => [a.setting, a]))
  assert.equal(quiz.showAnswers.to, 'never')
  assert.equal(quiz.timeLimitMinutes.from, 30)
  assert.equal(quiz.timeLimitMinutes.to, null)
  assert.equal(quiz.maxAttempts.to, null)
  const task = plan.activities[1].settings
  assert.deepEqual(task.acceptedTypes, ['xlsx', 'xls', 'pptx', 'pdf'])
  assert.equal(task.maxFiles, 5, 'source value kept')
  assert.equal(task.maxPoints, 100)
  assert.equal(task.dueDaysAfterEnroll, null)
})

test('map: 7-criterion rubric must add up to the declared points', () => {
  const rubric = Array.from({ length: 7 }, (_, i) => ({ id: `r${i + 1}`, label: `Reactivo ${i + 1}`, points: i < 2 ? 20 : 12 }))
  const map = { activities: [{ from: 'quiz' }, { from: 'task', maxPoints: 100, rubric, material: ['book'] }] }
  const plan = planClone(source(), map)
  assert.equal(plan.activities[1].settings.rubric.length, 7)
  assert.equal(plan.totalPoints, 200)
  assert.throws(() => planClone(source(), { activities: [{ from: 'task', maxPoints: 100, rubric: rubric.slice(1) }] }), /no suma 100/)
  assert.throws(() => planClone(source(), { activities: [{ from: 'intro' }] }), /no puede ser una actividad/)
  assert.throws(() => planClone(source(), { activities: [{ from: 'nope' }] }), /no está en el curso/)
  assert.deepEqual(defaultMap(plan).activities[1].material, ['book'])
})

test('checksum changes with any content change and ignores key order', () => {
  const plan = planClone(source())
  const copy = structuredClone(plan.activities)
  assert.equal(contentChecksum(copy), plan.checksum)
  copy[0].questions[3].points += 1
  assert.notEqual(contentChecksum(copy), plan.checksum)
  assert.equal(canonical({ b: 1, a: [1, { d: 2, c: 3 }] }), canonical({ a: [1, { c: 3, d: 2 }], b: 1 }))
  assert.throws(() => planClone({ ...source(), course: { ...source().course, kind: 'assessment' } }), /debe ser un curso/)
})
