// Shared schemas, lookups and previews of the standalone-evaluation half of the
// runly.lms MCP domain. An evaluation is an lms_course row with kind 'assessment'
// and its activities are lms_lesson rows without a section; business rules stay
// in lms-assessment-service / lms-assessment-core, these schemas only bound the
// shape an assistant may send.
import { z } from 'zod';
import { ACTIVITY_PRESETS, activityDraft, mergeAssessmentSettings } from '../../routes/lms/lms-assessment-core.js';
import { normalizeLessonInput } from '../../routes/lms/lms-core.js';
import { normalizeLessonSettings } from '../../routes/lms/lms-eval-core.js';
import { insist } from '../config.js';
import { clip, quizSettings } from './lms-common.js';

export const assessmentLink = id => `/app/m/runly.lms/assessments/${id}`;
export const activityLink = (assessmentId, id) => `/app/m/runly.lms/assessments/${assessmentId}/activities/${id}`;
export const MAX_ACTIVITIES = 10;
export const MAX_BUILD_QUESTIONS = 100;
export const ACTIVITY_TYPES = Object.keys(ACTIVITY_PRESETS);

// The reviewer-side services take the same user shape as the REST routes.
export const userOf = a => ({ profileId: a.actorProfileId, isAdmin: a.isAdmin === true, permissions: a.permissionSet ?? new Set() });

const isoOrNull = z.string().max(40).nullable();
export const assessmentSettings = z.strictObject({
  timeLimitMinutes: z.number().int().min(1).max(600).nullable().optional().describe('Minutos del cronómetro global de TODA la evaluación (null = sin límite).'),
  maxSessions: z.number().int().min(1).max(20).optional().describe('Intentos por participante (1 = un solo intento).'),
  opensAt: isoOrNull.optional().describe('ISO 8601; antes de esta fecha no hay registro ni inicio.'),
  closesAt: isoOrNull.optional().describe('ISO 8601; posterior a opensAt.'),
  passingPoints: z.number().min(0).max(100000).nullable().optional().describe('Puntos mínimos para aprobar (null = sin mínimo).'),
  showResultsToCandidate: z.boolean().optional(), materialAfterSubmit: z.boolean().optional().describe('Los materiales descargables siguen disponibles después de entregar.'),
  timeZone: z.string().max(64).optional().describe('Zona IANA de las fechas, ej. America/Mexico_City.'),
});

const rubricCriterion = z.strictObject({ id: z.string().max(32).optional(), label: z.string().trim().min(1).max(120), points: z.number().positive().max(1000), description: z.string().max(500).optional() });
export const rubricInput = z.array(rubricCriterion).max(15).describe('Hasta 15 criterios; la actividad vale exactamente la suma de sus puntos.');
export const deliverySettings = z.strictObject({
  allowText: z.boolean().optional(), allowFiles: z.boolean().optional(), maxFiles: z.number().int().min(1).max(10).optional(),
  maxPoints: z.number().int().min(1).max(1000).optional().describe('Puntos de la actividad si no hay rúbrica.'), rubric: rubricInput.optional(),
  acceptedTypes: z.array(z.string().max(30)).max(20).optional().describe('Claves de tipos de archivo aceptados (pdf, xlsx, pptx, docx...).'), maxFileMb: z.number().int().min(1).max(50).optional(),
  passingScore: z.number().int().min(0).max(100).nullable().optional(),
});
const activitySettings = z.union([quizSettings, deliverySettings]);
export const ACTIVITY_GUIDE = [
  `Actividad: { type?, kind?, title, body? (instrucciones markdown), settings? }. type es un atajo: ${ACTIVITY_TYPES.join(' | ')}.`,
  'questionnaire = cuestionario (quiz); written = entrega escrita; files = entrega de archivos; practical = texto y archivos. kind: quiz | assignment (el tipo no cambia después).',
  'quiz: los puntos salen de las preguntas (cada una points 1-1000). assignment: settings.maxPoints (1-1000) o settings.rubric (los puntos son la suma de los criterios); allowText/allowFiles/maxFiles/acceptedTypes/maxFileMb.',
  'El cronómetro y los intentos son de la evaluación completa (settings de la evaluación), no de cada actividad.',
].join('\n');
export const activityFields = {
  type: z.enum(ACTIVITY_TYPES).optional(), kind: z.enum(['quiz', 'assignment']).optional(), title: z.string().trim().min(1).max(200),
  body: z.string().max(200000).nullable().optional().describe('Instrucciones o enunciado en markdown.'), settings: activitySettings.optional(),
};
export const activityCreate = z.strictObject(activityFields);
export const activityPatch = z.strictObject({ title: activityFields.title, body: activityFields.body, settings: activitySettings }).partial().refine(data => Object.keys(data).length, 'Sin cambios');

// ---- validation through the LMS normalizers (same ones the REST API runs) -------
// settings must fit the activity kind (the union above cannot know it).
export function strictSettings(kind, settings, label = 'Actividad') {
  if (settings === undefined) return undefined;
  const parsed = (kind === 'quiz' ? quizSettings : deliverySettings).safeParse(settings);
  insist(parsed.success, 'invalid_request', `${label}: settings no corresponde a una actividad ${kind === 'quiz' ? 'de cuestionario' : 'de entrega'}.`);
  return parsed.data;
}

export function checkActivity(input, label = 'Actividad') {
  const { kind, settings } = activityDraft(input);
  strictSettings(kind, input.settings, label);
  const normalized = normalizeLessonInput({ title: input.title, body: input.body, kind, settings }, { partial: false });
  return { kind, normalized, maxPoints: kind === 'assignment' ? normalizeLessonSettings('assignment', normalized.settings).maxPoints : null };
}
export const checkSettings = (input, current) => mergeAssessmentSettings(input, current);

// ---- previews ----------------------------------------------------------------
export function activityLine(draft, questions = [], points = 0) {
  const settings = draft.normalized.settings ?? {};
  const kind = draft.kind === 'quiz' ? `cuestionario, ${questions.length} preguntas, ${points} pts` : `entrega, ${draft.maxPoints} pts${settings.rubric?.length ? `, rúbrica de ${settings.rubric.length} criterios` : ''}${settings.allowFiles === false ? ', solo texto' : settings.allowText === false ? ', solo archivos' : ''}`;
  return clip(`${draft.normalized.title} (${kind})`, 300);
}

// ---- company-scoped lookups ---------------------------------------------------
export function createAssessmentLookups(prisma) {
  const found = (row, message) => { insist(row, 'not_found', message, 404); return row; };
  const assessment = async (a, id) => found(await prisma.lmsCourse.findFirst({ where: { id, companyId: a.companyId, enabled: true, kind: 'assessment' } }), 'La evaluación no existe.');
  const activity = async (a, id, kind = null) => {
    const row = found(await prisma.lmsLesson.findFirst({ where: { id, companyId: a.companyId, enabled: true, sectionId: null } }), 'La actividad no existe.');
    await assessment(a, row.courseId);
    insist(!kind || row.kind === kind, 'conflict', kind === 'quiz' ? 'La actividad no es un cuestionario.' : 'La actividad no es una entrega.', 409);
    return row;
  };
  return {
    assessment, activity,
    async question(a, id) {
      const row = found(await prisma.lmsQuizQuestion.findFirst({ where: { id, companyId: a.companyId, enabled: true } }), 'La pregunta no existe.');
      await activity(a, row.lessonId, 'quiz');
      return row;
    },
    async resource(a, id) {
      const row = found(await prisma.lmsLessonResource.findFirst({ where: { id, companyId: a.companyId } }), 'El material no existe.');
      return { row, activity: await activity(a, row.lessonId) };
    },
  };
}

