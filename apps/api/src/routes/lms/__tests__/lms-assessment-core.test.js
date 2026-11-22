import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  activityDraft, activityMaxPoints, assessmentMaxPoints, mergeAssessmentSettings, publishProblems, readAssessmentSettings,
} from '../lms-assessment-core.js'

test('settings: defaults, partial merge, validation and window order', () => {
  assert.deepEqual(readAssessmentSettings(null), {
    timeZone: 'America/Mexico_City', timeLimitMinutes: null, maxSessions: 1, opensAt: null, closesAt: null, passingPoints: null,
    showResultsToCandidate: false, materialAfterSubmit: false, sourceCourseId: null,
  })
  const merged = mergeAssessmentSettings({ timeLimitMinutes: 60 }, { maxSessions: 2, sourceCourseId: 'keep' })
  assert.equal(merged.timeLimitMinutes, 60)
  assert.equal(merged.maxSessions, 2)
  assert.equal(merged.sourceCourseId, 'keep')
  assert.equal(mergeAssessmentSettings({ sourceCourseId: 'x' }, {}).sourceCourseId, null, 'not settable through the API')
  assert.equal(mergeAssessmentSettings({ timeLimitMinutes: '' }, { timeLimitMinutes: 30 }).timeLimitMinutes, null)
  assert.throws(() => mergeAssessmentSettings({ timeLimitMinutes: 0 }, {}), /entre 1 y 600/)
  assert.throws(() => mergeAssessmentSettings({ opensAt: '2026-12-02', closesAt: '2026-12-01' }, {}), /posterior/)
  assert.throws(() => mergeAssessmentSettings('x', {}), /inválida/)
  assert.equal(mergeAssessmentSettings({ timeZone: 'America/Bogota' }, {}).timeZone, 'America/Bogota')
  assert.throws(() => mergeAssessmentSettings({ timeZone: 'Marte/Olympus' }, {}), /Zona horaria/)
})

test('activity draft: presets map onto quiz and assignment, other kinds refused', () => {
  assert.deepEqual(activityDraft({ type: 'files' }), { kind: 'assignment', settings: { allowText: false, allowFiles: true } })
  assert.equal(activityDraft({ type: 'questionnaire' }).kind, 'quiz')
  assert.equal(activityDraft({ type: 'practical', settings: { maxPoints: 50 } }).settings.maxPoints, 50)
  assert.throws(() => activityDraft({ kind: 'video' }), /cuestionario o una entrega/)
  assert.throws(() => activityDraft({ type: 'nope' }), /inválido/)
  assert.throws(() => activityDraft({ type: 'files', kind: 'quiz' }), /no coincide/)
})

test('points: assignment maxPoints, quiz sum, drawn subsets vary, totals over 100', () => {
  assert.equal(activityMaxPoints({ kind: 'assignment', settings: {} }), 100)
  assert.equal(activityMaxPoints({ kind: 'assignment', settings: { maxPoints: 40 } }), 40)
  assert.equal(activityMaxPoints({ kind: 'quiz', settings: {} }, { questionPoints: 100, questionCount: 10 }), 100)
  assert.equal(activityMaxPoints({ kind: 'quiz', settings: { drawCount: 5 } }, { questionPoints: 100, questionCount: 10 }), null)
  assert.equal(assessmentMaxPoints([100, 100]), 200)
  assert.equal(assessmentMaxPoints([100, null]), null)
})

test('publish problems: needs an activity and questions in every quiz', () => {
  assert.equal(publishProblems([]).length, 1)
  assert.deepEqual(publishProblems([{ kind: 'quiz', title: 'A', questionCount: 0 }, { kind: 'assignment', title: 'B' }]), ['«A» no tiene preguntas.'])
  assert.deepEqual(publishProblems([{ kind: 'quiz', title: 'A', questionCount: 3 }]), [])
})
