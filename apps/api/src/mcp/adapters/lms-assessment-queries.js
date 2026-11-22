// Read operations for standalone evaluations in the runly.lms MCP domain. Authoring
// reads need lms.course.manage, participants lms.enrollment.manage and results
// and records lms.assessment.results, plus the per-evaluation reviewer rule of
// lms-assessment-access (an evaluation with a reviewer list hides from everyone else).
// Reads never carry signed URLs, and correct answers only appear in authoring reads.
import { z } from 'zod';
import { pageInput } from '../contracts.js';
import { COURSE_STATUSES } from '../../routes/lms/lms-core.js';
import { publishProblems } from '../../routes/lms/lms-assessment-core.js';
import { createLmsAssessmentAccess } from '../../routes/lms/lms-assessment-access.js';
import { createLmsAssessmentGradingService } from '../../routes/lms/lms-assessment-grading-service.js';
import { createLmsAssessmentResultsService } from '../../routes/lms/lms-assessment-results-service.js';
import { createLmsSessionAdminService } from '../../routes/lms/lms-session-admin-service.js';
import { createLmsSessionService } from '../../routes/lms/lms-session-service.js';
import { createLmsResourcesService } from '../../routes/lms/lms-resources-service.js';
import { QUESTION_GUIDE } from './lms-common.js';
import { ACTIVITY_GUIDE, activityLink, assessmentLink, userOf } from './lms-assessment-common.js';

const MANAGE = 'lms.course.manage';
export const ASSESSMENT_GUIDE = [
  'Flujo de una evaluación independiente: lms_assessments (evitar duplicados) -> lms.assessment.build (borrador con actividades, preguntas y rúbricas) o lms.assessment.create + lms.assessment.activity.create -> lms.assessment.material.attach (archivos ya en Runly) -> lms.assessment.share.update (registro público) -> lms.assessment.grader.assign -> lms_assessment_detail (revisar) -> lms.assessment.status published -> lms_assessment_share (enlace público real).',
  'Una evaluación independiente NO es un curso: no uses lms.course.create ni secciones para armarla.',
  ACTIVITY_GUIDE, QUESTION_GUIDE,
  'Calificar, decisiones, invitaciones por correo y administración de sesiones se hacen en la app; por MCP solo se consultan resultados y expedientes.',
];

export function createLmsAssessmentQueries({ prisma, assessments, quiz, find, share, admin }) {
  const resources = createLmsResourcesService({ prisma });
  const access = createLmsAssessmentAccess({ prisma });
  const sessions = createLmsSessionService({ prisma });
  const grading = createLmsAssessmentGradingService({ prisma, access, sessions });
  const results = createLmsAssessmentResultsService({ prisma, access });
  const page = (rows, input) => ({ items: rows.slice((input.page - 1) * input.limit, input.page * input.limit), total: rows.length, page: input.page, limit: input.limit });
  const shareState = async (a, id) => { const s = await share.getShare(a.companyId, id); return { enabled: s.enabled, url: s.url, path: s.path, published: s.published, accessMode: s.settings.accessMode }; };

  return [
    { name: 'lms_assessments', permission: MANAGE, inputSchema: z.strictObject({ ...pageInput, search: z.string().max(200).optional(), status: z.enum(COURSE_STATUSES).optional() }),
      definition: { description: 'Evaluaciones independientes de la empresa (no cursos): estado, actividades, puntos máximos, configuración y participantes. Consúltalo antes de crear una para no duplicar.' },
      async run(input, a) {
        const needle = input.search?.trim().toLowerCase();
        const rows = (await assessments.list(a.companyId, { status: input.status })).filter(row => !needle || row.title.toLowerCase().includes(needle));
        const { items, ...rest } = page(rows, input);
        return { items: items.map(row => ({ ...row, link: assessmentLink(row.id) })), ...rest, guide: ASSESSMENT_GUIDE };
      } },
    { name: 'lms_assessment_detail', permission: MANAGE, inputSchema: z.strictObject({ assessmentId: z.uuid() }),
      definition: { description: 'Una evaluación completa: configuración (tiempo global, intentos, ventana), actividades con puntos y número de preguntas/materiales, enlace público y si ya se puede publicar.' },
      async run(input, a) {
        const { assessment, activities } = await assessments.get(a.companyId, input.assessmentId);
        return { assessment: { ...assessment, link: assessmentLink(assessment.id) }, share: await shareState(a, assessment.id), publishProblems: publishProblems(activities),
          activities: activities.map(row => ({ id: row.id, kind: row.kind, title: row.title, position: row.position, maxPoints: row.maxPoints, questionCount: row.questionCount, resourceCount: row.resourceCount, settings: row.settings, link: activityLink(assessment.id, row.id) })) };
      } },
    { name: 'lms_assessment_activity_detail', permission: MANAGE, inputSchema: z.strictObject({ activityId: z.uuid() }),
      definition: { description: 'Una actividad: instrucciones, configuración, rúbrica, puntos y materiales descargables (nombre y tipo, sin enlaces de descarga).' },
      async run(input, a) {
        const row = await find.activity(a, input.activityId);
        const { activities } = await assessments.get(a.companyId, row.courseId);
        const activity = activities.find(item => item.id === row.id);
        return { activity: { id: row.id, assessmentId: row.courseId, kind: row.kind, title: row.title, body: row.body, position: row.position, maxPoints: activity?.maxPoints ?? null, questionCount: activity?.questionCount ?? 0, settings: activity?.settings ?? row.settings, link: activityLink(row.courseId, row.id) },
          materials: (await resources.listResources(a.companyId, row.id)).map(({ id, title, fileId, fileName, mimeType, sizeBytes }) => ({ id, title, fileId, fileName, mimeType, sizeBytes })) };
      } },
    { name: 'lms_assessment_questions', permission: MANAGE, inputSchema: z.strictObject({ activityId: z.uuid() }),
      definition: { description: 'Preguntas y ponderaciones de un cuestionario de evaluación, con su forma de autoría completa (options con id y correct, config) para editarlas con lms.assessment.question.update.' },
      async run(input, a) {
        const lesson = await find.activity(a, input.activityId, 'quiz');
        const questions = await quiz.listQuestions(a.companyId, lesson.id);
        return { activityId: lesson.id, title: lesson.title, totalPoints: questions.reduce((sum, item) => sum + (item.points ?? 0), 0), questions, format: QUESTION_GUIDE };
      } },
    { name: 'lms_assessment_participants', permission: 'lms.enrollment.manage', inputSchema: z.strictObject({ ...pageInput, assessmentId: z.uuid() }),
      definition: { description: 'Participantes registrados o asignados de una evaluación con el estado de cada sesión (sin respuestas ni archivos).' },
      async run(input, a) {
        await find.assessment(a, input.assessmentId);
        return page(await assessments.listParticipants(a.companyId, input.assessmentId), input);
      } },
    { name: 'lms_assessment_results', permission: 'lms.assessment.results', inputSchema: z.strictObject({ assessmentId: z.uuid() }),
      definition: { description: 'Resultados consolidados de una evaluación: una fila por participante con puntajes por actividad, pendientes de revisión y decisión. Solo si la persona es revisora de esa evaluación.' },
      run: (input, a) => results.results(a.companyId, userOf(a), input.assessmentId) },
    { name: 'lms_assessment_review', permission: 'lms.assessment.results', inputSchema: z.strictObject({ sessionId: z.uuid() }),
      definition: { description: 'Expediente de una sesión de participante (respuestas, entregas, puntos e historial). Solo si la persona es revisora de esa evaluación; no incluye enlaces de descarga de archivos.' },
      run: (input, a) => grading.record(a.companyId, userOf(a), input.sessionId) },
    { name: 'lms_assessment_graders', permission: MANAGE, inputSchema: z.strictObject({ assessmentId: z.uuid() }),
      definition: { description: 'Evaluadores y lectores asignados a una evaluación. Sin lista, cualquier persona con permiso de calificar o ver resultados puede revisarla.' },
      run: async (input, a) => ({ assessmentId: input.assessmentId, members: await admin.listGraders(a.companyId, userOf(a), input.assessmentId) }) },
    { name: 'lms_assessment_share', permission: MANAGE, inputSchema: z.strictObject({ assessmentId: z.uuid() }),
      definition: { description: 'Registro público de una evaluación: si el enlace está activo, la URL real, modo de acceso, formulario de registro y aviso de privacidad.' },
      async run(input, a) { await find.assessment(a, input.assessmentId); return share.getShare(a.companyId, input.assessmentId); } },
  ];
}
