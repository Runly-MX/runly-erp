// runly.lms MCP domain: assistants build and manage course content through
// proposals approved in Runly, and upload certificate templates from a file.
// Standalone evaluations (kind 'assessment') are authored and reviewed here too.
// Grading, issuing certificates, course share links and guest invites stay in the app.
import { createLmsService } from '../../routes/lms/lms-service.js';
import { createLmsQuizService } from '../../routes/lms/lms-quiz-service.js';
import { normalizeLessonSettings } from '../../routes/lms/lms-eval-core.js';
import { readOptions } from '../../routes/lms/lms-question-input.js';
import { createLmsLookups, lmsCall, lmsDb } from './lms-common.js';
import { createLmsQueries } from './lms-queries.js';
import { createLmsCourseActions } from './lms-course-actions.js';
import { createLmsLessonActions } from './lms-lesson-actions.js';
import { createLmsQuizActions } from './lms-quiz-actions.js';
import { createLmsCertActions } from './lms-cert-actions.js';
import { createLmsAssessmentService } from '../../routes/lms/lms-assessment-service.js';
import { createLmsShareService } from '../../routes/lms/lms-share-service.js';
import { createLmsAssessmentAccess } from '../../routes/lms/lms-assessment-access.js';
import { createLmsAssessmentGradingService } from '../../routes/lms/lms-assessment-grading-service.js';
import { createLmsSessionAdminService } from '../../routes/lms/lms-session-admin-service.js';
import { createLmsSessionService } from '../../routes/lms/lms-session-service.js';
import { evaluationPath, normalizeAssessmentShareInput, normalizeAssessmentShareSettings } from '../../routes/lms/lms-assessment-share-core.js';
import { createAssessmentLookups } from './lms-assessment-common.js';
import { createLmsAssessmentQueries } from './lms-assessment-queries.js';
import { createLmsAssessmentActions } from './lms-assessment-actions.js';
import { createLmsAssessmentQuestionActions } from './lms-assessment-question-actions.js';
import { createLmsAssessmentAccessActions } from './lms-assessment-access-actions.js';
import { createAssessmentRevision } from './lms-assessment-revision.js';

// Evaluation operations that expose the public link, change who can review,
// publish/archive or remove activities need the explicit confirmation of the approval.
const SENSITIVE_ASSESSMENT = new Set(['lms.assessment.share.rotate', 'lms.assessment.grader.remove', 'lms.assessment.activity.delete']);

const COURSE_FIELDS = ['title', 'summary', 'description', 'category', 'level', 'estimatedMinutes', 'sequential', 'selfEnroll', 'certificateTemplateId', 'status', 'shareEnabled'];
const pick = (row, keys) => Object.fromEntries(keys.map(key => [key, row[key] ?? null]));

export function createLmsAdapter({ prisma, supabaseAdmin = null }) {
  const db = lmsDb(prisma);
  // No signFile: MCP results never carry signed storage URLs. Authoring calls
  // of the quiz service need neither the learner service nor the notifier.
  const svc = createLmsService({ prisma: db }), quiz = createLmsQuizService({ prisma: db, learn: null, notifier: null });
  const find = createLmsLookups(db), deps = { prisma: db, svc, quiz, find };
  // Standalone evaluations: the same services the REST routes use. Sessions get no
  // media or notifier: nothing here signs files or notifies people.
  const findA = createAssessmentLookups(db);
  const assessments = createLmsAssessmentService({ prisma: db });
  const share = createLmsShareService({ prisma: db, kind: 'assessment', readSettings: normalizeAssessmentShareSettings, readInput: normalizeAssessmentShareInput, pathFor: evaluationPath });
  const sessions = createLmsSessionService({ prisma: db }), access = createLmsAssessmentAccess({ prisma: db });
  const admin = createLmsSessionAdminService({ prisma: db, access, grading: createLmsAssessmentGradingService({ prisma: db, access, sessions }), sessions });
  const adeps = { prisma: db, assessments, quiz, find: findA, share, admin };
  const assessmentRevision = createAssessmentRevision(adeps);
  const queries = [...createLmsQueries(deps), ...createLmsAssessmentQueries(adeps)].map(query => ({ ...query, run: (input, a) => lmsCall(() => query.run(input, a)) }));
  const actions = [...createLmsCourseActions(deps), ...createLmsLessonActions(deps), ...createLmsQuizActions(deps), ...createLmsCertActions({ prisma: db, supabaseAdmin }),
    ...createLmsAssessmentActions(adeps), ...createLmsAssessmentQuestionActions(adeps), ...createLmsAssessmentAccessActions(adeps)]
    .map(action => ({ ...action, prepare: (input, a) => lmsCall(() => action.prepare(input, a)), execute: (input, a) => lmsCall(() => action.execute(input, a)) }));

  // What the person reviewed: editable fields of the target, never timestamps,
  // so unrelated proposals of the same course do not turn each other stale.
  async function revision(_definition, prepared, a) {
    const id = prepared.targetId, companyId = a.companyId;
    if (!id) return null;
    switch (prepared.targetType) {
      case 'course': return pick(await find.course(a, id), COURSE_FIELDS);
      case 'section': { const row = await find.section(a, id); return { title: row.title, free: row.free, courseId: row.courseId }; }
      case 'lesson': { const row = await find.lesson(a, id); return { ...pick(row, ['title', 'kind', 'body', 'embedUrl', 'durationSeconds', 'required', 'preview', 'sectionId', 'fileId']), settings: normalizeLessonSettings(row.kind, row.settings) }; }
      case 'question': { const row = await find.question(a, id); return { kind: row.kind, prompt: row.prompt, points: row.points, explanation: row.explanation, options: readOptions(row.options) }; }
      case 'questions': return (await db.lmsQuizQuestion.findMany({ where: { lessonId: id, companyId, enabled: true }, select: { id: true }, orderBy: { id: 'asc' } })).map(row => row.id);
      case 'structure': {
        const [sections, lessons] = await Promise.all([
          db.lmsSection.findMany({ where: { courseId: id, companyId }, select: { id: true }, orderBy: { id: 'asc' } }),
          db.lmsLesson.findMany({ where: { courseId: id, companyId, enabled: true }, select: { id: true }, orderBy: { id: 'asc' } }),
        ]);
        return { sections: sections.map(row => row.id), lessons: lessons.map(row => row.id) };
      }
      default: return (await assessmentRevision(prepared, a)) ?? null;
    }
  }

  return { moduleKey: 'runly.lms', label: 'Aprendizaje', queries, actions, revision,
    // Publishing exposes the course to learners (and its share link); archiving
    // hides it from them; deleting a section cannot be undone.
    sensitive: (definition, input) => definition.key === 'lms.section.delete' || SENSITIVE_ASSESSMENT.has(definition.key)
      || (['lms.course.status', 'lms.assessment.status'].includes(definition.key) && ['published', 'archived'].includes(input?.status))
      || (definition.key === 'lms.assessment.share.update' && input?.enabled === true),
    effects: ['Crear y editar cursos, secciones, lecciones y preguntas de Aprendizaje. Publicar hace visible el curso en el catálogo interno y en su enlace compartido si está activo; archivarlo lo oculta a los alumnos; eliminar una sección vacía es definitivo. Crear una plantilla de certificado guarda una copia del archivo (con las etiquetas sugeridas si no tenía) en Aprendizaje. No califica, no emite certificados ni comparte enlaces. Evaluaciones independientes: crear y editar evaluaciones en borrador con sus actividades, preguntas, puntos, rúbricas y materiales descargables; configurar el registro público (activarlo expone la evaluación publicada a cualquiera con el enlace), regenerar el enlace (el anterior deja de funcionar) y asignar o quitar evaluadores (limita quién revisa). Publicar habilita registros y sesiones; archivar las cierra. No califica ni envía invitaciones.'],
  };
}
