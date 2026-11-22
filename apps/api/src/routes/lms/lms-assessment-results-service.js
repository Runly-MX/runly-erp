// Results of an evaluation (spec 2026-11-21 section 9, phase 5): one row per
// participant (latest session first, plus registered people who never started)
// with per-activity scores on the frozen basis, totals, pending review and the
// decision, and the CSV/XLSX export of the same rows. Loaded in batches: a few
// queries for the whole evaluation, never one set per session.
import ExcelJS from 'exceljs'
import { loadAttemptQuestions } from './lms-eval-shared.js'
import { normalizeAssessmentShareSettings } from './lms-assessment-share-core.js'
import { readGuestProfile } from './lms-intake-core.js'
import { learnerKind } from './lms-share-core.js'
import { DECISION_LABELS, attemptRow, sessionTotals, snapshotItem, submissionRow } from './lms-grading-core.js'
import { sessionShape } from './lms-assessment-grading-service.js'

const STATUS_LABELS = {
  not_started: 'Sin iniciar', in_progress: 'En curso', submitted: 'Por revisar', expired: 'Por revisar (tiempo agotado)', graded: 'Calificada', voided: 'Anulada',
}

export function createLmsAssessmentResultsService({ prisma, access, clock = () => new Date() }) {
  async function results(companyId, user, assessmentId) {
    const { assessment, role } = await access.require(companyId, user, assessmentId, 'read')
    const [enrollments, sessions] = await Promise.all([
      prisma.lmsEnrollment.findMany({ where: { courseId: assessment.id, status: { not: 'dropped' } }, include: { learner: true }, orderBy: { createdAt: 'asc' } }),
      prisma.lmsAssessmentSession.findMany({ where: { courseId: assessment.id }, orderBy: [{ number: 'desc' }] }),
    ])
    const ids = sessions.map((row) => row.id)
    const [attempts, submissions] = ids.length ? await Promise.all([
      prisma.lmsQuizAttempt.findMany({ where: { sessionId: { in: ids } } }),
      prisma.lmsSubmission.findMany({ where: { sessionId: { in: ids } } }),
    ]) : [[], []]
    const questionsById = await loadAttemptQuestions(prisma, attempts)
    const bySession = (list) => list.reduce((map, row) => map.set(row.sessionId, [...(map.get(row.sessionId) ?? []), row]), new Map())
    const attemptsOf = bySession(attempts), submissionsOf = bySession(submissions)
    const fields = normalizeAssessmentShareSettings(assessment.shareSettings).intakeFields
    const now = clock()

    const rows = []
    for (const enrollment of enrollments) {
      const own = sessions.filter((row) => row.enrollmentId === enrollment.id)
      const learner = {
        name: enrollment.learner.displayName, email: enrollment.learner.email, kind: learnerKind(enrollment.learner),
        answers: readGuestProfile(enrollment.learner.guestProfile),
      }
      if (!own.length) {
        rows.push({ enrollmentId: enrollment.id, sessionId: null, learner, status: 'not_started', statusLabel: STATUS_LABELS.not_started, sessionsUsed: 0, activities: [], scorePoints: null, maxPoints: null, complete: false, pendingCount: 0 })
        continue
      }
      // The latest session is the result; earlier ones stay in the record history.
      const session = own[0]
      const scoreRows = [
        ...(attemptsOf.get(session.id) ?? []).map((attempt) => attemptRow(snapshotItem(session, attempt.lessonId), (attempt.questionIds ?? []).map((id) => questionsById.get(id)).filter(Boolean), attempt)),
        ...(submissionsOf.get(session.id) ?? []).map(submissionRow),
      ]
      const totals = sessionTotals(session, scoreRows)
      const shape = sessionShape(session, now)
      const reviewable = ['submitted', 'expired', 'graded'].includes(session.status)
      rows.push({
        enrollmentId: enrollment.id, sessionId: session.id, learner, status: session.status, statusLabel: STATUS_LABELS[session.status] ?? session.status,
        sessionsUsed: own.length, session: shape,
        activities: totals.activities.map((item) => ({ lessonId: item.lessonId, title: item.title, kind: item.kind, score: reviewable ? item.score : null, maxPoints: item.maxPoints, pending: reviewable && item.pending })),
        scorePoints: reviewable ? totals.scorePoints : null, maxPoints: totals.maxPoints, complete: reviewable && totals.complete, pendingCount: reviewable ? totals.pendingCount : 0,
      })
    }
    const columns = sessions[0]?.snapshot?.activities?.map((item) => ({ lessonId: item.lessonId, title: item.title, kind: item.kind, maxPoints: Number(item.maxPoints) || 0 })) ?? []
    return {
      // sourceCourseId: set by the clone script; the course keeps its own enrollments and results.
      assessment: { id: assessment.id, title: assessment.title, status: assessment.status, sourceCourseId: assessment.settings?.sourceCourseId ?? null },
      role,
      fields: fields.map((field) => ({ key: field.key, label: field.label })),
      columns,
      rows,
      summary: {
        participants: rows.length,
        started: rows.filter((row) => row.sessionId).length,
        pendingReview: rows.filter((row) => row.pendingCount > 0).length,
        graded: rows.filter((row) => row.status === 'graded').length,
      },
    }
  }

  // Same rows as the panel. Decision is its own column, never derived from points.
  async function exportFile(companyId, user, assessmentId, format = 'csv') {
    const data = await results(companyId, user, assessmentId)
    const headers = [
      'Participante', 'Correo', ...data.fields.filter((field) => field.key !== 'correo').map((field) => field.label), 'Estado', 'Folio', 'Inicio', 'Entrega', 'Minutos usados',
      ...data.columns.map((column) => `${column.title} (máx. ${column.maxPoints})`), 'Total', 'Máximo', 'Pendientes de revisión', 'Decisión', 'Nota de la decisión',
    ]
    const table = data.rows.map((row) => [
      row.learner.name, row.learner.email ?? '', ...data.fields.filter((field) => field.key !== 'correo').map((field) => row.learner.answers[field.key] ?? ''),
      row.statusLabel, row.session?.folio ?? '', row.session?.startedAt ? new Date(row.session.startedAt) : '', row.session?.submittedAt ? new Date(row.session.submittedAt) : '',
      row.session?.usedMinutes ?? '',
      ...data.columns.map((column) => row.activities.find((item) => item.lessonId === column.lessonId)?.score ?? ''),
      row.scorePoints ?? '', row.maxPoints ?? '', row.pendingCount || '', row.session ? DECISION_LABELS[row.session.decision] : '', row.session?.decisionNote ?? '',
    ])
    return buildFile({ headers, table, format, title: data.assessment.title })
  }

  return { results, exportFile }
}

// Cells that start like a formula are neutralised (names and answers come from people).
const safeText = (value) => (typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value)
function csvCell(value) {
  const text = value instanceof Date ? value.toISOString() : value === null || value === undefined ? '' : String(safeText(value))
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export async function buildFile({ headers, table, format, title = 'Resultados' }) {
  const slug = String(title).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'evaluacion'
  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Resultados')
    sheet.addRow(headers).font = { bold: true }
    for (const line of table) sheet.addRow(line.map(safeText))
    headers.forEach((header, index) => { sheet.getColumn(index + 1).width = Math.min(40, Math.max(12, String(header).length + 2)) })
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    return { content: Buffer.from(await workbook.xlsx.writeBuffer()), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: `resultados-${slug}.xlsx` }
  }
  const text = [headers, ...table].map((line) => line.map(csvCell).join(',')).join('\r\n')
  return { content: Buffer.from(`﻿${text}`, 'utf8'), type: 'text/csv; charset=utf-8', name: `resultados-${slug}.csv` }
}
