// Quiz question writes of the runly.lms MCP domain. Validation runs the same
// normalizer as the REST API (normalizeQuestionInput) during prepare, and the
// quiz service applies it again on commit.
import { z } from 'zod';
import { readOptions } from '../../routes/lms/lms-question-input.js';
import { insist } from '../config.js';
import { MAX_QUESTIONS, checkQuestion, lessonLink, questionLine, questionList, questionPatch, QUESTION_GUIDE } from './lms-common.js';

const MANAGE = 'lms.course.manage';
const stored = row => ({ kind: row.kind, prompt: row.prompt, points: row.points, options: readOptions(row.options).items, config: readOptions(row.options).config });

export function createLmsQuizActions({ prisma, quiz, find }) {
  const activeQuestions = (a, lessonId) => prisma.lmsQuizQuestion.findMany({ where: { lessonId, companyId: a.companyId, enabled: true }, select: { id: true, prompt: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });

  return [
    { key: 'lms.question.create', permission: MANAGE, operation: 'create', label: 'Agregar preguntas al examen',
      description: `Agregar de 1 a ${MAX_QUESTIONS} preguntas al final de un examen (lección quiz).\n${QUESTION_GUIDE}`,
      inputSchema: z.strictObject({ lessonId: z.uuid(), questions: questionList }),
      async prepare(input, a) {
        const lesson = await find.quiz(a, input.lessonId);
        const current = await prisma.lmsQuizQuestion.count({ where: { lessonId: lesson.id, companyId: a.companyId, enabled: true } });
        input.questions.forEach((question, index) => checkQuestion(question, { label: `Pregunta ${index + 1}` }));
        return { input, targetId: null, preview: { title: `Agregar ${input.questions.length} preguntas a «${lesson.title}» (tiene ${current})`, fields: input.questions.map((question, index) => ({ label: `Pregunta ${current + index + 1}`, value: questionLine(question) })) } };
      },
      async execute(input, a) {
        const created = [];
        for (const question of input.questions) created.push(await quiz.createQuestion(a.companyId, input.lessonId, question));
        const lesson = await find.quiz(a, input.lessonId);
        return { lessonId: input.lessonId, questionIds: created.map(question => question.id), link: lessonLink(lesson.courseId, lesson.id) };
      } },

    { key: 'lms.question.update', permission: MANAGE, operation: 'update', label: 'Editar pregunta',
      description: 'Editar una pregunta; solo se cambian los campos enviados (forma por tipo en lms.question.create). Consulta lms_quiz_questions para conocer su forma actual.',
      inputSchema: z.strictObject({ questionId: z.uuid(), data: questionPatch }),
      async prepare(input, a) {
        const existing = await find.question(a, input.questionId);
        checkQuestion(input.data, { existing });
        const after = { ...stored(existing), ...input.data };
        return { input, targetType: 'question', targetId: existing.id, preview: { title: 'Editar pregunta', fields: [{ label: 'Pregunta', value: questionLine(after), before: questionLine(stored(existing)) }] } };
      },
      execute: async (input, a) => quiz.updateQuestion(a.companyId, input.questionId, input.data) },

    { key: 'lms.question.delete', permission: MANAGE, operation: 'update', label: 'Quitar pregunta',
      description: 'Quitar una pregunta del examen (los intentos anteriores la conservan).',
      inputSchema: z.strictObject({ questionId: z.uuid() }),
      async prepare(input, a) {
        const existing = await find.question(a, input.questionId);
        return { input, targetType: 'question', targetId: existing.id, preview: { title: 'Quitar pregunta del examen', fields: [{ label: 'Pregunta', value: questionLine(stored(existing)) }] } };
      },
      execute: async (input, a) => quiz.deleteQuestion(a.companyId, input.questionId) },

    { key: 'lms.question.reorder', permission: MANAGE, operation: 'update', label: 'Ordenar preguntas',
      description: 'Orden completo de las preguntas activas del examen; cada id exactamente una vez.',
      inputSchema: z.strictObject({ lessonId: z.uuid(), questionIds: z.array(z.uuid()).min(1).max(500) }),
      async prepare(input, a) {
        const lesson = await find.quiz(a, input.lessonId);
        const rows = await activeQuestions(a, lesson.id), prompts = new Map(rows.map(row => [row.id, row.prompt]));
        insist(input.questionIds.length === rows.length && new Set(input.questionIds).size === rows.length && input.questionIds.every(id => prompts.has(id)), 'invalid_request', 'Envía todas las preguntas activas del examen exactamente una vez.');
        return { input, targetType: 'questions', targetId: lesson.id, preview: { title: `Nuevo orden de preguntas de «${lesson.title}»`, fields: input.questionIds.map((id, index) => ({ label: `${index + 1}`, value: String(prompts.get(id)).slice(0, 160) })) } };
      },
      async execute(input, a) {
        const questions = await quiz.reorderQuestions(a.companyId, input.lessonId, { questionIds: input.questionIds });
        return { lessonId: input.lessonId, questionIds: questions.map(question => question.id) };
      } },
  ];
}
