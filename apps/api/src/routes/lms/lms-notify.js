// runly.lms evaluation notifications. Failures are logged and never fail the request.
const LEARN_LINK = (courseId) => `/app/m/runly.lms/learn/${courseId}`
const REVIEW_LINK = '/app/m/runly.lms/review'

export function createLmsNotifier({ notificationService = null } = {}) {
  async function send({ companyId, actorId, recipientId, eventType, title, body, link, sourceType, sourceId }) {
    if (!notificationService?.publish || !recipientId || recipientId === actorId) return
    try {
      await notificationService.publish({
        companyId,
        actorId,
        input: {
          eventType,
          title,
          body: body?.slice(0, 1000),
          link,
          recipients: { userIds: [recipientId] },
          channels: ['in_app', 'web_push'],
          priority: 'medium',
          sourceType,
          sourceId,
          dedupeKey: `${eventType}:${sourceId}:${recipientId}:${Date.now()}`,
        },
      })
    } catch (error) {
      console.error('[runly.lms] notification failed', { eventType, error: error?.message })
    }
  }

  // To the course creator: a submission or an attempt needing review arrived.
  function received({ companyId, actorId, course, lesson, learnerName, type, sourceId }) {
    const what = type === 'attempt' ? 'un examen con respuestas abiertas' : 'una tarea'
    return send({
      companyId,
      actorId,
      recipientId: course.createdById,
      eventType: 'lms.submission.received',
      title: 'Nueva entrega por revisar',
      body: `${learnerName} envió ${what} en «${lesson.title}» (${course.title}).`,
      link: REVIEW_LINK,
      sourceType: type === 'attempt' ? 'lms_quiz_attempt' : 'lms_submission',
      sourceId,
    })
  }

  // To the learner: an assignment was approved/returned or an attempt was graded.
  function graded({ companyId, actorId, recipientId, course, lesson, type, sourceId, detail }) {
    return send({
      companyId,
      actorId,
      recipientId,
      eventType: 'lms.submission.graded',
      title: 'Actividad calificada',
      body: `«${lesson.title}» (${course.title}): ${detail}`,
      link: LEARN_LINK(course.id),
      sourceType: type === 'attempt' ? 'lms_quiz_attempt' : 'lms_submission',
      sourceId,
    })
  }

  return { received, graded }
}
