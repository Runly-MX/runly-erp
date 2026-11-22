// Scores of one evaluation session, recomputed from stored values on the frozen
// basis of its snapshot (phase 5). Used when a session closes and on every
// grade, inside the same transaction as the grade.
import { loadAttemptQuestions } from './lms-eval-shared.js'
import { attemptRow, sessionTotals, snapshotItem, submissionRow } from './lms-grading-core.js'

export async function loadSessionScores(db, session) {
  const [attempts, submissions] = await Promise.all([
    db.lmsQuizAttempt.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: 'asc' } }),
    db.lmsSubmission.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: 'asc' } }),
  ])
  const questionsById = await loadAttemptQuestions(db, attempts)
  const rows = [
    ...attempts.map((attempt) => attemptRow(snapshotItem(session, attempt.lessonId), (attempt.questionIds ?? []).map((id) => questionsById.get(id)).filter(Boolean), attempt)),
    ...submissions.map(submissionRow),
  ]
  return { attempts, submissions, questionsById, rows, totals: sessionTotals(session, rows) }
}

// Closed session -> graded once nothing waits for a person; a graded session
// keeps its status and gets the recomputed total (regrades). Running and voided
// sessions are left alone. Returns the totals.
export async function applySessionTotals(db, session, now) {
  const { totals } = await loadSessionScores(db, session)
  if (['submitted', 'expired'].includes(session.status) && totals.complete) {
    await db.lmsAssessmentSession.updateMany({ where: { id: session.id, status: session.status }, data: { status: 'graded', gradedAt: now, scorePoints: totals.scorePoints } })
  } else if (session.status === 'graded') {
    await db.lmsAssessmentSession.update({ where: { id: session.id }, data: { scorePoints: totals.complete ? totals.scorePoints : null } })
  }
  return totals
}
