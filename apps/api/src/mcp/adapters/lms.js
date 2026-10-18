// runly.lms MCP domain: assistants build and manage course content through
// proposals approved in Runly. Grading, certificates, share links and guest
// invites stay in the app.
import { createLmsService } from '../../routes/lms/lms-service.js';
import { createLmsQuizService } from '../../routes/lms/lms-quiz-service.js';
import { normalizeLessonSettings } from '../../routes/lms/lms-eval-core.js';
import { readOptions } from '../../routes/lms/lms-question-input.js';
import { createLmsLookups, lmsCall, lmsDb } from './lms-common.js';
import { createLmsQueries } from './lms-queries.js';
import { createLmsCourseActions } from './lms-course-actions.js';
import { createLmsLessonActions } from './lms-lesson-actions.js';
import { createLmsQuizActions } from './lms-quiz-actions.js';

const COURSE_FIELDS = ['title', 'summary', 'description', 'category', 'level', 'estimatedMinutes', 'sequential', 'selfEnroll', 'certificateTemplateId', 'status', 'shareEnabled'];
const pick = (row, keys) => Object.fromEntries(keys.map(key => [key, row[key] ?? null]));

export function createLmsAdapter({ prisma }) {
  const db = lmsDb(prisma);
  // No signFile: MCP results never carry signed storage URLs. Authoring calls
  // of the quiz service need neither the learner service nor the notifier.
  const svc = createLmsService({ prisma: db }), quiz = createLmsQuizService({ prisma: db, learn: null, notifier: null });
  const find = createLmsLookups(db), deps = { prisma: db, svc, quiz, find };
  const queries = createLmsQueries(deps).map(query => ({ ...query, run: (input, a) => lmsCall(() => query.run(input, a)) }));
  const actions = [...createLmsCourseActions(deps), ...createLmsLessonActions(deps), ...createLmsQuizActions(deps)]
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
      default: return null;
    }
  }

  return { moduleKey: 'runly.lms', label: 'Aprendizaje', queries, actions, revision,
    // Publishing exposes the course to learners (and its share link); archiving
    // hides it from them; deleting a section cannot be undone.
    sensitive: (definition, input) => definition.key === 'lms.section.delete' || (definition.key === 'lms.course.status' && ['published', 'archived'].includes(input?.status)),
    effects: ['Crear y editar cursos, secciones, lecciones y preguntas de Aprendizaje. Publicar hace visible el curso en el catálogo interno y en su enlace compartido si está activo; archivarlo lo oculta a los alumnos; eliminar una sección vacía es definitivo. No califica, no emite certificados ni comparte enlaces.'],
  };
}
