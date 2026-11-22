// Questions and downloadable materials of evaluation activities in the runly.lms
// MCP domain. Questions use the quiz service (same normalizer as REST); materials
// attach files that already live in Runly (imported with runly_files_import_*
// without a destination, or uploaded to Archivos): no content crosses MCP.
import { z } from 'zod';
import { createFilesService } from '../../services/files-service.js';
import { createLmsResourcesService, RESOURCES_PER_LESSON_MAX } from '../../routes/lms/lms-resources-service.js';
import { readOptions } from '../../routes/lms/lms-question-input.js';
import { insist } from '../config.js';
import { MAX_QUESTIONS, QUESTION_GUIDE, checkQuestion, questionLine, questionList, questionPatch } from './lms-common.js';
import { activityLink } from './lms-assessment-common.js';

const MANAGE = 'lms.course.manage';
const stored = row => ({ kind: row.kind, prompt: row.prompt, points: row.points, options: readOptions(row.options).items, config: readOptions(row.options).config });

export function createLmsAssessmentQuestionActions({ prisma, quiz, find }) {
  const resources = createLmsResourcesService({ prisma });
  const activeQuestions = (a, lessonId) => prisma.lmsQuizQuestion.findMany({ where: { lessonId, companyId: a.companyId, enabled: true }, select: { id: true, prompt: true, points: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
  const loadFile = async (a, id) => {
    try { return await createFilesService({ prisma }).getById({ authUserId: a.actorAuthUserId, activeContext: { companyId: a.companyId, profileId: a.actorProfileId, isAdmin: a.isAdmin, permissionSet: a.permissionSet }, id }); }
    catch (error) { insist(!(error.status >= 400 && error.status < 500), 'not_found', 'El archivo no existe o no tienes acceso.', 404); throw error; }
  };

  return [
    { key: 'lms.assessment.question.create', permission: MANAGE, operation: 'create', label: 'Agregar preguntas a la actividad',
      description: `Agregar de 1 a ${MAX_QUESTIONS} preguntas al final de un cuestionario de evaluación (cada pregunta con sus points, que son su ponderación).\n${QUESTION_GUIDE}`,
      inputSchema: z.strictObject({ activityId: z.uuid(), questions: questionList }),
      async prepare(input, a) {
        const lesson = await find.activity(a, input.activityId, 'quiz');
        const rows = await activeQuestions(a, lesson.id);
        const added = input.questions.map((question, index) => checkQuestion(question, { label: `Pregunta ${index + 1}` }).points ?? 1);
        const total = rows.reduce((sum, row) => sum + row.points, 0) + added.reduce((sum, points) => sum + points, 0);
        return { input, targetId: null, preview: { title: `Agregar ${input.questions.length} preguntas a «${lesson.title}» (tiene ${rows.length}; quedará en ${total} puntos)`, fields: input.questions.map((question, index) => ({ label: `Pregunta ${rows.length + index + 1}`, value: questionLine(question) })) } };
      },
      async execute(input, a) {
        const created = [];
        for (const question of input.questions) created.push(await quiz.createQuestion(a.companyId, input.activityId, question));
        const lesson = await find.activity(a, input.activityId, 'quiz');
        return { activityId: lesson.id, questionIds: created.map(question => question.id), link: activityLink(lesson.courseId, lesson.id) };
      } },

    { key: 'lms.assessment.question.update', permission: MANAGE, operation: 'update', label: 'Editar pregunta de evaluación',
      description: 'Editar una pregunta (solo los campos enviados; points cambia su ponderación). Consulta lms_assessment_questions para su forma actual.',
      inputSchema: z.strictObject({ questionId: z.uuid(), data: questionPatch }),
      async prepare(input, a) {
        const existing = await find.question(a, input.questionId);
        checkQuestion(input.data, { existing });
        return { input, targetType: 'question', targetId: existing.id, preview: { title: 'Editar pregunta de evaluación', fields: [{ label: 'Pregunta', value: questionLine({ ...stored(existing), ...input.data }), before: questionLine(stored(existing)) }] } };
      },
      execute: async (input, a) => quiz.updateQuestion(a.companyId, input.questionId, input.data) },

    { key: 'lms.assessment.question.delete', permission: MANAGE, operation: 'update', label: 'Quitar pregunta de evaluación',
      description: 'Quitar una pregunta del cuestionario (las sesiones ya iniciadas la conservan).',
      inputSchema: z.strictObject({ questionId: z.uuid() }),
      async prepare(input, a) {
        const existing = await find.question(a, input.questionId);
        return { input, targetType: 'question', targetId: existing.id, preview: { title: 'Quitar pregunta del cuestionario', fields: [{ label: 'Pregunta', value: questionLine(stored(existing)) }] } };
      },
      execute: async (input, a) => quiz.deleteQuestion(a.companyId, input.questionId) },

    { key: 'lms.assessment.question.reorder', permission: MANAGE, operation: 'update', label: 'Ordenar preguntas de evaluación',
      description: 'Orden completo de las preguntas activas del cuestionario; cada id exactamente una vez.',
      inputSchema: z.strictObject({ activityId: z.uuid(), questionIds: z.array(z.uuid()).min(1).max(500) }),
      async prepare(input, a) {
        const lesson = await find.activity(a, input.activityId, 'quiz');
        const rows = await activeQuestions(a, lesson.id), prompts = new Map(rows.map(row => [row.id, row.prompt]));
        insist(input.questionIds.length === rows.length && new Set(input.questionIds).size === rows.length && input.questionIds.every(id => prompts.has(id)), 'invalid_request', 'Envía todas las preguntas activas del cuestionario exactamente una vez.');
        return { input, targetType: 'questions', targetId: lesson.id, preview: { title: `Nuevo orden de preguntas de «${lesson.title}»`, fields: input.questionIds.map((id, index) => ({ label: `${index + 1}`, value: String(prompts.get(id)).slice(0, 160) })) } };
      },
      async execute(input, a) { const rows = await quiz.reorderQuestions(a.companyId, input.activityId, { questionIds: input.questionIds }); return { activityId: input.activityId, questionIds: rows.map(row => row.id) }; } },

    { key: 'lms.assessment.material.attach', permission: MANAGE, operation: 'update', label: 'Adjuntar material descargable',
      description: `Asociar un archivo que ya está en Runly como material descargable de una actividad (máx. ${RESOURCES_PER_LESSON_MAX}). Para un archivo del chat: runly_files_import_prepare/commit sin destino y usa aquí el id del archivo guardado. No se transfiere contenido por MCP y no se duplica el archivo.`,
      inputSchema: z.strictObject({ activityId: z.uuid(), fileId: z.uuid().describe('ID del archivo en Runly (resultado de runly_files_import_commit o de Archivos).'), title: z.string().max(200).optional() }),
      async prepare(input, a) {
        const lesson = await find.activity(a, input.activityId);
        const asset = await loadFile(a, input.fileId);
        insist(!(await prisma.lmsLessonResource.count({ where: { lessonId: lesson.id, fileId: input.fileId } })), 'conflict', 'Ese archivo ya es un material de la actividad.', 409);
        return { input, targetId: null, preview: { title: `Adjuntar material a «${lesson.title}»`, fields: [{ label: 'Archivo', value: `${asset.originalName ?? input.fileId} (${asset.mimeType ?? 'tipo desconocido'})` }, ...(input.title ? [{ label: 'Título', value: input.title }] : [])] } };
      },
      async execute(input, a) { const row = await resources.addResource(a.companyId, input.activityId, { fileId: input.fileId, title: input.title }); return { id: row.id, activityId: row.lessonId, title: row.title, fileName: row.fileName }; } },

    { key: 'lms.assessment.material.remove', permission: MANAGE, operation: 'update', label: 'Quitar material descargable',
      description: 'Quitar un material de una actividad; el archivo permanece en Archivos. Consulta lms_assessment_activity_detail para los ids.',
      inputSchema: z.strictObject({ resourceId: z.uuid() }),
      async prepare(input, a) {
        const { row, activity } = await find.resource(a, input.resourceId);
        return { input, targetType: 'resource', targetId: row.id, preview: { title: `Quitar material de «${activity.title}»`, fields: [{ label: 'Material', value: row.title ?? row.fileId }] } };
      },
      execute: async (input, a) => resources.deleteResource(a.companyId, input.resourceId) },
  ];
}
