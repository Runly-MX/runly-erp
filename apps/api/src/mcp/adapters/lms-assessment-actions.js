// Authoring writes for standalone evaluations in the runly.lms MCP domain:
// the evaluation, its activities, rubrics and the composite build. Every write
// goes through lms-assessment-service / lms-quiz-service, so the REST rules
// apply unchanged; prepare re-runs the same normalizers for the preview.
import { z } from 'zod';
import { insist } from '../config.js';
import { COURSE_STATUSES } from '../../routes/lms/lms-core.js';
import { publishProblems, readAssessmentSettings } from '../../routes/lms/lms-assessment-core.js';
import { normalizeLessonInput } from '../../routes/lms/lms-core.js';
import { normalizeLessonSettings } from '../../routes/lms/lms-eval-core.js';
import { checkCourse, checkQuestion, clip, fieldsOf, questionList, questionLine } from './lms-common.js';
import {
  MAX_ACTIVITIES, MAX_BUILD_QUESTIONS, activityCreate, activityLine, activityLink, activityPatch, assessmentLink, assessmentSettings, checkActivity, checkSettings,
  rubricInput, strictSettings,
} from './lms-assessment-common.js';

const MANAGE = 'lms.course.manage';
const STATUS_LABEL = { published: 'Publicar evaluación', draft: 'Pasar la evaluación a borrador', archived: 'Archivar evaluación' };
const assessmentFields = { title: z.string().trim().min(1).max(200), summary: z.string().max(500).nullable().optional(), description: z.string().max(50000).nullable().optional().describe('Markdown de la página de la evaluación.'), settings: assessmentSettings.optional() };
const assessmentCreate = z.strictObject(assessmentFields);
const assessmentPatch = z.strictObject(assessmentFields).partial().refine(data => Object.keys(data).length, 'Sin cambios');
const buildActivity = z.strictObject({ ...activityCreate.shape, questions: questionList.optional().describe('Solo cuestionarios (quiz): preguntas de la actividad.') });
const result = row => ({ id: row.id, title: row.title, status: row.status, link: assessmentLink(row.id) });
const without = (data, ...keys) => Object.fromEntries(Object.entries(data).filter(([key]) => !keys.includes(key)));

export function createLmsAssessmentActions({ prisma, assessments, quiz, find }) {
  // A second draft with the same title is almost always a retry or a duplicate request.
  async function noDuplicate(a, title) {
    const rows = await prisma.lmsCourse.findMany({ where: { companyId: a.companyId, enabled: true, kind: 'assessment', status: { not: 'archived' } }, select: { id: true, title: true } });
    const same = rows.find(row => row.title.trim().toLowerCase() === title.trim().toLowerCase());
    insist(!same, 'conflict', `Ya existe una evaluación llamada «${same?.title}». Edítala o usa otro nombre.`, 409);
  }
  const settingsFields = (settings, before = null) => settings === undefined ? [] : fieldsOf(Object.fromEntries(Object.entries(settings).map(([key, value]) => [`settings.${key}`, value])), before && Object.fromEntries(Object.keys(settings).map(key => [`settings.${key}`, before[key]])));

  // Validates one buildable activity and totals its points for the preview.
  function buildDraft(activity, index) {
    const label = `Actividad ${index + 1}`;
    const { questions = [], ...body } = activity;
    const draft = checkActivity(body, label);
    insist(draft.kind === 'quiz' || !questions.length, 'invalid_request', `${label}: solo los cuestionarios llevan preguntas.`);
    insist(draft.kind !== 'quiz' || questions.length, 'invalid_request', `${label}: un cuestionario necesita al menos una pregunta.`);
    const points = questions.reduce((sum, question, n) => sum + (checkQuestion(question, { label: `${label}, pregunta ${n + 1}` }).points ?? 1), 0);
    return { body, questions, draft, points, total: draft.kind === 'quiz' ? points : draft.maxPoints };
  }

  return [
    { key: 'lms.assessment.create', permission: MANAGE, operation: 'create', label: 'Crear evaluación',
      description: 'Crear una evaluación independiente en borrador (no es un curso). settings: timeLimitMinutes (cronómetro global), maxSessions (intentos), ventana, passingPoints. Para crearla con actividades en una sola propuesta usa lms.assessment.build.',
      inputSchema: z.strictObject({ data: assessmentCreate }),
      async prepare(input, a) {
        checkCourse(without(input.data, 'settings'), false);
        const settings = checkSettings(input.data.settings, {});
        await noDuplicate(a, input.data.title);
        return { input, targetId: null, preview: { title: 'Crear evaluación (borrador)', fields: [...fieldsOf(without(input.data, 'settings')), ...fieldsOf(settings)] } };
      },
      execute: async (input, a) => result(await assessments.create(a.companyId, a.actorProfileId, input.data)) },

    { key: 'lms.assessment.update', permission: MANAGE, operation: 'update', label: 'Editar evaluación',
      description: 'Editar título, resumen, descripción y configuración (tiempo global, intentos, fechas, puntos mínimos). Los settings enviados se combinan con los actuales. El estado se cambia con lms.assessment.status.',
      inputSchema: z.strictObject({ assessmentId: z.uuid(), data: assessmentPatch }),
      async prepare(input, a) {
        const before = await find.assessment(a, input.assessmentId);
        checkCourse(without(input.data, 'settings'), true);
        checkSettings(input.data.settings, before.settings);
        if (input.data.title && input.data.title.trim().toLowerCase() !== before.title.trim().toLowerCase()) await noDuplicate(a, input.data.title);
        return { input, targetType: 'assessment', targetId: before.id, preview: { title: `Editar evaluación «${before.title}»`, fields: [...fieldsOf(without(input.data, 'settings'), before), ...settingsFields(input.data.settings, readAssessmentSettings(before.settings))] } };
      },
      execute: async (input, a) => result((await assessments.update(a.companyId, input.assessmentId, input.data)).assessment) },

    { key: 'lms.assessment.status', permission: MANAGE, operation: 'update', label: 'Publicar, despublicar o archivar evaluación',
      description: 'published: habilita el registro y las sesiones (requiere al menos una actividad y que cada cuestionario tenga preguntas); draft: despublicar; archived: archivar. Es una acción sensible: requiere confirmación explícita en Runly.',
      inputSchema: z.strictObject({ assessmentId: z.uuid(), status: z.enum(COURSE_STATUSES) }),
      async prepare(input, a) {
        const before = await find.assessment(a, input.assessmentId);
        insist(before.status !== input.status, 'invalid_request', `La evaluación ya está en estado ${input.status}.`);
        const { assessment, activities } = await assessments.get(a.companyId, before.id);
        if (input.status === 'published') { const problems = publishProblems(activities); insist(!problems.length, 'invalid_request', `No se puede publicar: ${problems.join(' ')}`); }
        const live = input.status === 'published' && before.shareEnabled ? [{ label: 'Enlace público', value: 'Activo: cualquier persona con el enlace podrá registrarse y presentar.' }] : [];
        return { input, targetType: 'assessment', targetId: before.id, preview: { title: `${STATUS_LABEL[input.status]}: «${before.title}»`, fields: [{ label: 'Estado', value: input.status, before: before.status },
          { label: 'Contenido', value: `${assessment.activityCount} actividades, ${assessment.maxPoints ?? 'variable'} puntos, ${assessment.settings.timeLimitMinutes ? `${assessment.settings.timeLimitMinutes} min globales` : 'sin cronómetro'}, ${assessment.settings.maxSessions} intento(s)` }, ...live] } };
      },
      async execute(input, a) {
        const row = input.status === 'archived' ? await assessments.archive(a.companyId, input.assessmentId) : (await assessments.update(a.companyId, input.assessmentId, { status: input.status })).assessment;
        return result(row);
      } },

    { key: 'lms.assessment.build', permission: MANAGE, operation: 'create', label: 'Construir evaluación completa',
      description: `Crear en una sola propuesta una evaluación en borrador con hasta ${MAX_ACTIVITIES} actividades (cuestionarios con sus preguntas y puntos, entregas con rúbrica) y su configuración. La forma más eficiente de armar una evaluación; no publica. Rechaza un título ya usado.`,
      inputSchema: z.strictObject({ data: assessmentCreate, activities: z.array(buildActivity).min(1).max(MAX_ACTIVITIES) }),
      async prepare(input, a) {
        checkCourse(without(input.data, 'settings'), false);
        const settings = checkSettings(input.data.settings, {});
        await noDuplicate(a, input.data.title);
        const drafts = input.activities.map(buildDraft);
        insist(drafts.reduce((sum, item) => sum + item.questions.length, 0) <= MAX_BUILD_QUESTIONS, 'invalid_request', `Una propuesta admite como máximo ${MAX_BUILD_QUESTIONS} preguntas.`);
        const total = drafts.reduce((sum, item) => sum + item.total, 0);
        return { input: { data: input.data, activities: drafts.map(item => ({ ...item.body, ...(item.questions.length ? { questions: item.questions } : {}) })) }, targetId: null,
          preview: { title: `Nueva evaluación «${input.data.title}» (borrador, ${total} puntos)`, fields: [...fieldsOf(without(input.data, 'settings')), ...fieldsOf(settings),
            ...drafts.flatMap((item, index) => [{ label: `Actividad ${index + 1}`, value: activityLine(item.draft, item.questions, item.points) }, ...item.questions.map((question, n) => ({ label: `  Pregunta ${n + 1}`, value: questionLine(question) }))])] } };
      },
      async execute(input, a) {
        const created = await assessments.create(a.companyId, a.actorProfileId, input.data);
        const activities = [];
        for (const { questions = [], ...body } of input.activities) {
          const row = await assessments.createActivity(a.companyId, created.id, body);
          const ids = [];
          for (const question of questions) ids.push((await quiz.createQuestion(a.companyId, row.id, question)).id);
          activities.push({ id: row.id, kind: row.kind, title: row.title, ...(ids.length ? { questionIds: ids } : {}), link: activityLink(created.id, row.id) });
        }
        return { ...result(created), activities };
      } },

    { key: 'lms.assessment.activity.create', permission: MANAGE, operation: 'create', label: 'Crear actividad',
      description: 'Agregar una actividad al final de la evaluación: cuestionario (luego agrega preguntas con lms.assessment.question.create) o entrega (texto y/o archivos, con puntos o rúbrica).',
      inputSchema: z.strictObject({ assessmentId: z.uuid(), data: activityCreate }),
      async prepare(input, a) {
        const assessment = await find.assessment(a, input.assessmentId);
        const draft = checkActivity(input.data);
        return { input, targetId: null, preview: { title: `Nueva actividad en «${assessment.title}»`, fields: [{ label: 'Actividad', value: activityLine(draft) }, ...fieldsOf({ body: draft.normalized.body, settings: draft.normalized.settings })] } };
      },
      async execute(input, a) { const row = await assessments.createActivity(a.companyId, input.assessmentId, input.data); return { id: row.id, kind: row.kind, title: row.title, link: activityLink(input.assessmentId, row.id) }; } },

    { key: 'lms.assessment.activity.update', permission: MANAGE, operation: 'update', label: 'Editar actividad',
      description: 'Editar título, instrucciones o settings de una actividad (se combinan con los actuales). El tipo no cambia. Para la rúbrica usa lms.assessment.rubric.update.',
      inputSchema: z.strictObject({ activityId: z.uuid(), data: activityPatch }),
      async prepare(input, a) {
        const before = await find.activity(a, input.activityId);
        strictSettings(before.kind, input.data.settings);
        const merged = input.data.settings === undefined ? undefined : { ...(before.settings ?? {}), ...input.data.settings };
        const normalized = normalizeLessonInput({ ...without(input.data, 'settings'), ...(merged ? { settings: merged } : {}) }, { partial: true, currentKind: before.kind });
        return { input, targetType: 'activity', targetId: before.id, preview: { title: `Editar actividad «${before.title}»`, fields: fieldsOf(normalized, before) } };
      },
      async execute(input, a) { const row = await assessments.updateActivity(a.companyId, input.activityId, input.data); return { id: row.id, kind: row.kind, title: row.title, maxPoints: row.maxPoints, link: activityLink(row.courseId, row.id) }; } },

    { key: 'lms.assessment.activity.delete', permission: MANAGE, operation: 'update', label: 'Quitar actividad',
      description: 'Quitar una actividad de la evaluación (se desactiva; las sesiones ya iniciadas conservan su copia).',
      inputSchema: z.strictObject({ activityId: z.uuid() }),
      async prepare(input, a) {
        const row = await find.activity(a, input.activityId);
        const count = row.kind === 'quiz' ? await prisma.lmsQuizQuestion.count({ where: { lessonId: row.id, companyId: a.companyId, enabled: true } }) : 0;
        return { input, targetType: 'activity', targetId: row.id, preview: { title: 'Quitar actividad de la evaluación', fields: [{ label: 'Actividad', value: `${row.title} (${row.kind}${count ? `, ${count} preguntas` : ''})` }] } };
      },
      execute: async (input, a) => assessments.deleteActivity(a.companyId, input.activityId) },

    { key: 'lms.assessment.activity.reorder', permission: MANAGE, operation: 'update', label: 'Ordenar actividades',
      description: 'Orden completo de las actividades activas; cada id exactamente una vez.',
      inputSchema: z.strictObject({ assessmentId: z.uuid(), activityIds: z.array(z.uuid()).min(1).max(100) }),
      async prepare(input, a) {
        const assessment = await find.assessment(a, input.assessmentId);
        const rows = await prisma.lmsLesson.findMany({ where: { courseId: assessment.id, companyId: a.companyId, enabled: true, sectionId: null }, select: { id: true, title: true } });
        const titles = new Map(rows.map(row => [row.id, row.title]));
        insist(input.activityIds.length === rows.length && new Set(input.activityIds).size === rows.length && input.activityIds.every(id => titles.has(id)), 'invalid_request', 'Envía todas las actividades activas exactamente una vez.');
        return { input, targetType: 'activities', targetId: assessment.id, preview: { title: `Nuevo orden de actividades de «${assessment.title}»`, fields: input.activityIds.map((id, index) => ({ label: `${index + 1}`, value: clip(titles.get(id), 160) })) } };
      },
      async execute(input, a) { const rows = await assessments.reorderActivities(a.companyId, input.assessmentId, { activityIds: input.activityIds }); return { assessmentId: input.assessmentId, activityIds: rows.map(row => row.id) }; } },

    { key: 'lms.assessment.rubric.update', permission: MANAGE, operation: 'update', label: 'Definir rúbrica',
      description: 'Reemplazar la rúbrica de una actividad de entrega: hasta 15 criterios {label, points, description?}; la actividad pasa a valer exactamente la suma. rubric [] la quita y vuelve a settings.maxPoints.',
      inputSchema: z.strictObject({ activityId: z.uuid(), rubric: rubricInput }),
      async prepare(input, a) {
        const before = await find.activity(a, input.activityId, 'assignment');
        const next = normalizeLessonInput({ settings: { ...(before.settings ?? {}), rubric: input.rubric } }, { partial: true, currentKind: 'assignment' }).settings;
        const old = normalizeLessonSettings('assignment', before.settings);
        return { input, targetType: 'activity', targetId: before.id, preview: { title: `Rúbrica de «${before.title}» (${next.maxPoints} puntos)`, fields: [...next.rubric.map((item, index) => ({ label: `Criterio ${index + 1}`, value: `${item.label}: ${item.points} pts${item.description ? ` — ${item.description}` : ''}` })), { label: 'Puntos de la actividad', value: String(next.maxPoints), before: String(old.maxPoints) }] } };
      },
      async execute(input, a) { const row = await assessments.updateActivity(a.companyId, input.activityId, { settings: { rubric: input.rubric } }); return { id: row.id, title: row.title, maxPoints: row.maxPoints, link: activityLink(row.courseId, row.id) }; } },
  ];
}
