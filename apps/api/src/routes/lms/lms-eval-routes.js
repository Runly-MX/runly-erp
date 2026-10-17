// runly.lms evaluation routes (quizzes, assignments, grading), registered from createLmsRouter.
import { createLmsQuizService } from './lms-quiz-service.js'
import { createLmsAssignmentService } from './lms-assignment-service.js'
import { createLmsReviewService } from './lms-review-service.js'
import { createLmsNotifier } from './lms-notify.js'

const companyId = (c) => c.get('companyId')
const actorId = (c) => c.get('userContext')?.profile?.id ?? null
const body = (c) => c.req.json().catch(() => ({}))
const canManage = (c) => {
  const ctx = c.get('userContext')
  return Boolean(ctx?.isAdmin || ctx?.permissionSet?.has?.('lms.course.manage'))
}

// services: optional { quiz, assignment, review } overrides (tests).
export function registerLmsEvalRoutes(app, { prisma, requirePermission, signFile = null, notificationService = null, run, learn, media, services = null }) {
  const notifier = createLmsNotifier({ notificationService })
  const quiz = services?.quiz ?? createLmsQuizService({ prisma, learn, notifier, signFile })
  const assignment = services?.assignment ?? createLmsAssignmentService({ prisma, learn, media, notifier, signFile })
  const review = services?.review ?? createLmsReviewService({ prisma, notifier, signFile })
  const access = requirePermission('lms.access')
  const courses = requirePermission('lms.course.manage')
  const grade = requirePermission('lms.grade')
  const id = (c) => c.req.param('id')

  // ---- question authoring -------------------------------------------------
  app.get('/lms/lessons/:id/questions', courses, run('Error al cargar las preguntas.', async (c) => c.json({ data: await quiz.listQuestions(companyId(c), id(c)) })))
  app.post('/lms/lessons/:id/questions', courses, run('Error al crear la pregunta.', async (c) => c.json({ data: await quiz.createQuestion(companyId(c), id(c), await body(c)) }, 201)))
  app.post('/lms/lessons/:id/questions/reorder', courses, run('Error al ordenar las preguntas.', async (c) => c.json({ data: await quiz.reorderQuestions(companyId(c), id(c), await body(c)) })))
  app.patch('/lms/questions/:id', courses, run('Error al guardar la pregunta.', async (c) => c.json({ data: await quiz.updateQuestion(companyId(c), id(c), await body(c)) })))
  app.delete('/lms/questions/:id', courses, run('Error al eliminar la pregunta.', async (c) => c.json({ data: await quiz.deleteQuestion(companyId(c), id(c)) })))

  // ---- learner quizzes ----------------------------------------------------
  app.get('/lms/learn/lessons/:id/quiz', access, run('Error al cargar el examen.', async (c) => c.json({ data: await quiz.getQuizSummary(companyId(c), actorId(c), id(c), { canManage: canManage(c) }) })))
  app.post('/lms/learn/lessons/:id/attempts', access, run('Error al iniciar el intento.', async (c) => {
    const { attempt, resumed } = await quiz.startAttempt(companyId(c), actorId(c), id(c))
    return c.json({ data: attempt }, resumed ? 200 : 201)
  }))
  app.get('/lms/learn/attempts/:id', access, run('Error al cargar el intento.', async (c) => c.json({ data: await quiz.getAttempt(companyId(c), actorId(c), id(c)) })))
  app.put('/lms/learn/attempts/:id/answers', access, run('Error al guardar las respuestas.', async (c) => c.json({ data: await quiz.saveAnswers(companyId(c), actorId(c), id(c), await body(c)) })))
  app.post('/lms/learn/attempts/:id/submit', access, run('Error al enviar el examen.', async (c) => c.json({ data: await quiz.submitAttempt(companyId(c), actorId(c), id(c), await body(c)) })))

  // ---- learner assignments ------------------------------------------------
  app.get('/lms/learn/lessons/:id/submissions', access, run('Error al cargar tus entregas.', async (c) => c.json({ data: await assignment.listSubmissions(companyId(c), actorId(c), id(c), { canManage: canManage(c) }) })))
  app.post('/lms/learn/lessons/:id/submissions', access, run('Error al enviar la tarea.', async (c) => c.json({ data: await assignment.submit(companyId(c), actorId(c), id(c), await body(c)) }, 201)))
  app.post('/lms/learn/uploads/presign', access, run('Error al preparar la subida.', async (c) => c.json({ data: await assignment.presignUpload(companyId(c), actorId(c), await body(c)) })))
  app.post('/lms/learn/uploads/:fileId/confirm', access, run('Error al confirmar la subida.', async (c) => c.json({ data: await assignment.confirmUpload(companyId(c), actorId(c), c.req.param('fileId')) })))

  // ---- grading ------------------------------------------------------------
  app.get('/lms/review', grade, run('Error al cargar las entregas por revisar.', async (c) => c.json({ data: await review.queue(companyId(c), c.req.query()) })))
  app.get('/lms/review/attempts/:id', grade, run('Error al cargar el intento.', async (c) => c.json({ data: await review.getAttempt(companyId(c), id(c)) })))
  app.post('/lms/review/attempts/:id/grade', grade, run('Error al calificar el intento.', async (c) => c.json({ data: await review.gradeAttempt(companyId(c), actorId(c), id(c), await body(c)) })))
  app.get('/lms/review/submissions/:id', grade, run('Error al cargar la entrega.', async (c) => c.json({ data: await review.getSubmission(companyId(c), id(c)) })))
  app.post('/lms/review/submissions/:id/grade', grade, run('Error al calificar la entrega.', async (c) => c.json({ data: await review.gradeSubmission(companyId(c), actorId(c), id(c), await body(c)) })))
  app.post('/lms/enrollments/:id/lessons/:lessonId/extra-attempt', grade, run('Error al otorgar el intento.', async (c) => c.json({ data: await review.grantExtraAttempt(companyId(c), id(c), c.req.param('lessonId')) })))
}
