// Lesson writes of the runly.lms MCP domain, including the bulk "section with
// lessons and questions" proposal. Writes go through lms-service and the quiz
// service, so their validation rules apply unchanged.
import { z } from 'zod';
import { insist } from '../config.js';
import { checkLessonCreate, checkLessonPatch, courseLink, fieldsOf, lessonCreate, lessonLine, lessonLink, lessonPatch, questionLine } from './lms-common.js';

const MANAGE = 'lms.course.manage';
const MAX_LESSONS = 20;
const MAX_BUILD_QUESTIONS = 200;
const lessonResult = (lesson, questions = []) => ({ id: lesson.id, kind: lesson.kind, title: lesson.title, sectionId: lesson.sectionId, ...(questions.length ? { questionIds: questions.map(q => q.id) } : {}), link: lessonLink(lesson.courseId, lesson.id) });

export function createLmsLessonActions({ svc, quiz, find }) {
  // Creates one lesson and its questions (validated in prepare).
  async function createLesson(a, sectionId, lesson) {
    const { questions = [], ...body } = lesson;
    const row = await svc.createLesson(a.companyId, sectionId, body);
    const created = [];
    for (const question of questions) created.push(await quiz.createQuestion(a.companyId, row.id, question));
    return lessonResult(row, created);
  }
  const lessonInput = ({ body, questions }) => ({ ...body, ...(questions.length ? { questions } : {}) });

  return [
    { key: 'lms.section.build', permission: MANAGE, operation: 'create', label: 'Crear sección con lecciones',
      description: `Crear en una sola propuesta una sección al final del curso con hasta ${MAX_LESSONS} lecciones (text, embed, quiz con sus preguntas, assignment). La forma más eficiente de armar un curso: una propuesta por sección.`,
      inputSchema: z.strictObject({ courseId: z.uuid(), title: z.string().trim().min(1).max(200), free: z.boolean().optional(), lessons: z.array(lessonCreate).min(1).max(MAX_LESSONS) }),
      async prepare(input, a) {
        const course = await find.course(a, input.courseId);
        const lessons = input.lessons.map((lesson, index) => checkLessonCreate(lesson, `Lección ${index + 1}`));
        insist(lessons.reduce((sum, lesson) => sum + lesson.questions.length, 0) <= MAX_BUILD_QUESTIONS, 'invalid_request', `Una propuesta admite como máximo ${MAX_BUILD_QUESTIONS} preguntas.`);
        return { input: { courseId: course.id, title: input.title, free: input.free === true, lessons: lessons.map(lessonInput) }, targetId: null,
          preview: { title: `Nueva sección «${input.title}» en «${course.title}»${input.free ? ' (gratis)' : ''}`, fields: lessons.map((lesson, index) => ({ label: `Lección ${index + 1}`, value: lessonLine(lesson.normalized, lesson.questions) })) } };
      },
      async execute(input, a) {
        const section = await svc.createSection(a.companyId, input.courseId, { title: input.title, free: input.free });
        const lessons = [];
        for (const lesson of input.lessons) lessons.push(await createLesson(a, section.id, lesson));
        return { sectionId: section.id, title: section.title, lessons, link: courseLink(input.courseId) };
      } },

    { key: 'lms.lesson.create', permission: MANAGE, operation: 'create', label: 'Crear lección',
      description: 'Agregar una lección al final de una sección: text, embed, quiz (con questions opcionales) o assignment. Video subido y archivos se agregan en la app; usa embed con YouTube o Vimeo como alternativa.',
      inputSchema: z.strictObject({ sectionId: z.uuid(), data: lessonCreate }),
      async prepare(input, a) {
        const section = await find.section(a, input.sectionId);
        const lesson = checkLessonCreate(input.data);
        return { input: { sectionId: section.id, data: lessonInput(lesson) }, targetId: null,
          preview: { title: `Nueva lección en la sección «${section.title}»`, fields: [{ label: 'Lección', value: lessonLine(lesson.normalized, lesson.questions) }, ...fieldsOf({ body: lesson.normalized.body, settings: lesson.normalized.settings }), ...lesson.questions.map((question, index) => ({ label: `Pregunta ${index + 1}`, value: questionLine(question) }))] } };
      },
      execute: (input, a) => createLesson(a, input.sectionId, input.data) },

    { key: 'lms.lesson.update', permission: MANAGE, operation: 'update', label: 'Editar lección',
      description: 'Editar título, contenido markdown, enlace embebido, duración, required, preview o settings (se combinan con los actuales). sectionId mueve la lección al final de otra sección del mismo curso.',
      inputSchema: z.strictObject({ lessonId: z.uuid(), data: lessonPatch }),
      async prepare(input, a) {
        const before = await find.lesson(a, input.lessonId);
        if (input.data.sectionId && input.data.sectionId !== before.sectionId) {
          const target = await find.section(a, input.data.sectionId);
          insist(target.courseId === before.courseId, 'invalid_request', 'La sección pertenece a otro curso.');
        }
        const { body, normalized } = checkLessonPatch(before, input.data);
        return { input: { lessonId: before.id, data: body }, targetType: 'lesson', targetId: before.id,
          preview: { title: `Editar lección «${before.title}»`, fields: fieldsOf(normalized, before) } };
      },
      execute: async (input, a) => lessonResult(await svc.updateLesson(a.companyId, input.lessonId, input.data)) },

    { key: 'lms.lesson.disable', permission: MANAGE, operation: 'update', label: 'Desactivar lección',
      description: 'Quitar una lección del curso (se desactiva; el historial de los alumnos se conserva).',
      inputSchema: z.strictObject({ lessonId: z.uuid() }),
      async prepare(input, a) {
        const lesson = await find.lesson(a, input.lessonId);
        return { input, targetType: 'lesson', targetId: lesson.id, preview: { title: 'Desactivar lección', fields: [{ label: 'Lección', value: lessonLine(lesson) }] } };
      },
      async execute(input, a) {
        const lesson = await find.lesson(a, input.lessonId);
        await svc.deleteLesson(a.companyId, lesson.id);
        return { id: lesson.id, disabled: true, link: courseLink(lesson.courseId) };
      } },
  ];
}
