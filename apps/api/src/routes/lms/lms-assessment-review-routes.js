// runly.lms evaluations, phase 5: results, candidate records, grading, files,
// session incidents, decisions and the reviewer list. Every handler checks the
// caller's role on that evaluation (lms-assessment-access.js); the route gate
// only requires one of the reviewer permissions of the company.
import { LmsError } from './lms-error.js'
import { isUuid } from './lms-eval-shared.js'
import { createLmsAssessmentAccess, userFrom } from './lms-assessment-access.js'
import { createLmsAssessmentGradingService } from './lms-assessment-grading-service.js'
import { createLmsAssessmentResultsService } from './lms-assessment-results-service.js'
import { createLmsSessionAdminService } from './lms-session-admin-service.js'

const REVIEWER_KEYS = ['lms.course.manage', 'lms.grade', 'lms.assessment.results', 'lms.enrollment.manage', 'lms.assessment.decide']
const companyId = (c) => c.get('companyId')
const body = (c) => c.req.json().catch(() => ({}))

// requireAnyPermission (index.js): the route gate passes with any reviewer
// permission of the active company; the role on the evaluation is checked inside.
export function registerLmsAssessmentReviewRoutes(app, { prisma, requirePermission, requireAnyPermission, run, sessions }) {
  const access = createLmsAssessmentAccess({ prisma })
  const grading = createLmsAssessmentGradingService({ prisma, access, sessions })
  const results = createLmsAssessmentResultsService({ prisma, access })
  const admin = createLmsSessionAdminService({ prisma, access, grading, sessions })
  const reviewer = requireAnyPermission ? requireAnyPermission(REVIEWER_KEYS) : requirePermission('lms.course.manage')
  const id = (c) => c.req.param('id')
  const sid = (c) => c.req.param('sessionId')
  const json = (fallback, fn) => run(fallback, async (c) => c.json({ data: await fn(c) }))

  // Evaluations this person may open results for (the "Resultados" list).
  app.get('/lms/results', reviewer, json('Error al cargar las evaluaciones.', async (c) => {
    const rows = await access.accessible(companyId(c), userFrom(c))
    const pending = rows.length ? await prisma.lmsAssessmentSession.groupBy({ by: ['courseId', 'status'], where: { courseId: { in: rows.map((item) => item.row.id) } }, _count: { _all: true } }) : []
    return rows.map(({ row, role }) => {
      const counts = pending.filter((item) => item.courseId === row.id)
      const count = (statuses) => counts.filter((item) => statuses.includes(item.status)).reduce((sum, item) => sum + item._count._all, 0)
      return { id: row.id, title: row.title, status: row.status, role, sessions: count(['in_progress', 'submitted', 'expired', 'graded', 'voided']), toReview: count(['submitted', 'expired']), graded: count(['graded']), updatedAt: row.updatedAt.toISOString() }
    })
  }))
  app.get('/lms/assessments/:id/results', reviewer, json('Error al cargar los resultados.', (c) => results.results(companyId(c), userFrom(c), id(c))))
  app.get('/lms/assessments/:id/results/export', reviewer, run('Error al exportar los resultados.', async (c) => {
    const file = await results.exportFile(companyId(c), userFrom(c), id(c), c.req.query('format') === 'xlsx' ? 'xlsx' : 'csv')
    c.header('Content-Type', file.type)
    c.header('Content-Disposition', `attachment; filename="${file.name}"`)
    c.header('Cache-Control', 'no-store')
    return c.body(file.content)
  }))

  // ---- the candidate record and grading ------------------------------------------------
  app.get('/lms/review/sessions/:sessionId', reviewer, json('Error al cargar el expediente.', (c) => grading.record(companyId(c), userFrom(c), sid(c))))
  app.put('/lms/review/sessions/:sessionId/attempts/:attemptId', reviewer, json('Error al guardar la calificación.', async (c) => grading.gradeQuiz(companyId(c), userFrom(c), sid(c), c.req.param('attemptId'), await body(c))))
  app.put('/lms/review/sessions/:sessionId/submissions/:submissionId', reviewer, json('Error al guardar la calificación.', async (c) => grading.gradeDelivery(companyId(c), userFrom(c), sid(c), c.req.param('submissionId'), await body(c))))
  app.put('/lms/review/sessions/:sessionId/decision', reviewer, json('Error al guardar la decisión.', async (c) => admin.decide(companyId(c), userFrom(c), sid(c), await body(c))))

  // Delivered files (phase 3), now limited to the reviewers of that evaluation.
  app.get('/lms/review/sessions/:sessionId/files', reviewer, json('Error al cargar las entregas.', async (c) => {
    const session = await grading.findSession(companyId(c), sid(c))
    await access.require(companyId(c), userFrom(c), session.courseId, 'read')
    return sessions.reviewFiles(companyId(c), session.id)
  }))
  app.post('/lms/review/session-files/:versionId/download', reviewer, json('Error al preparar la descarga.', async (c) => {
    const versionId = c.req.param('versionId')
    const version = isUuid(versionId) ? await prisma.lmsSubmissionFile.findFirst({ where: { id: versionId, companyId: companyId(c) }, include: { submission: { select: { sessionId: true, enrollment: { select: { courseId: true } } } } } }) : null
    if (!version) throw new LmsError('El archivo no existe.', 404)
    await access.require(companyId(c), userFrom(c), version.submission.enrollment.courseId, 'read')
    return sessions.reviewDownload(companyId(c), version.id)
  }))

  // ---- incidents (lms.enrollment.manage or managers) -------------------------------------
  app.post('/lms/review/sessions/:sessionId/extend', reviewer, json('Error al extender la sesión.', async (c) => admin.extend(companyId(c), userFrom(c), sid(c), await body(c))))
  app.post('/lms/review/sessions/:sessionId/void', reviewer, json('Error al anular la sesión.', async (c) => admin.voidSession(companyId(c), userFrom(c), sid(c), await body(c))))
  app.post('/lms/review/enrollments/:enrollmentId/extra-session', reviewer, json('Error al autorizar el intento.', async (c) => admin.grantExtraSession(companyId(c), userFrom(c), c.req.param('enrollmentId'), await body(c))))

  // ---- reviewer list (managers) ---------------------------------------------------------
  app.get('/lms/assessments/:id/graders', reviewer, json('Error al cargar los evaluadores.', (c) => admin.listGraders(companyId(c), userFrom(c), id(c))))
  app.put('/lms/assessments/:id/graders', reviewer, json('Error al guardar los evaluadores.', async (c) => admin.setGraders(companyId(c), userFrom(c), id(c), await body(c))))

  return { access, grading, results, admin }
}
