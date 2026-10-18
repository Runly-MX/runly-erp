// Shared schemas, validation and lookups of the runly.lms MCP domain. Business
// rules stay in the LMS normalizers (lms-core, lms-eval-core): these schemas
// only bound the shape an assistant may send, and every proposal re-runs the
// same normalizers the REST API uses.
import { z } from 'zod';
import { LmsError } from '../../routes/lms/lms-error.js';
import { normalizeCourseInput, normalizeLessonInput } from '../../routes/lms/lms-core.js';
import { QUESTION_KINDS, normalizeQuestionInput, normalizeLessonSettings } from '../../routes/lms/lms-eval-core.js';
import { McpError, insist } from '../config.js';

export const courseLink = id => `/app/m/runly.lms/courses/${id}`;
export const lessonLink = (courseId, id) => `/app/m/runly.lms/courses/${courseId}/lessons/${id}`;
export const MCP_LESSON_KINDS = ['text', 'embed', 'quiz', 'assignment'];
export const MAX_QUESTIONS = 50;

// LmsError (400/404/409) becomes the MCP error vocabulary, with the same message.
const codeFor = status => status === 404 ? 'not_found' : status === 409 ? 'conflict' : status === 403 ? 'permission_denied' : 'invalid_request';
export async function lmsCall(fn) {
  try { return await fn(); }
  catch (error) {
    if (error instanceof LmsError) throw new McpError(codeFor(error.status), error.message, error.status);
    throw error;
  }
}
function lmsSync(fn, label) {
  try { return fn(); }
  catch (error) {
    if (error instanceof LmsError) throw new McpError(codeFor(error.status), label ? `${label}: ${error.message}` : error.message, error.status);
    throw error;
  }
}

// Commits run inside the MCP transaction, whose client turns $transaction(fn)
// into fn(tx) but cannot take the array form LMS reorders use. Arrays run in
// order on that same client, so they stay atomic within the commit.
export function lmsDb(prisma) {
  return new Proxy(prisma, { get(target, key) {
    if (key !== '$transaction') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
    return async (arg, options) => {
      if (!Array.isArray(arg)) return target.$transaction(arg, options);
      const out = [];
      for (const query of arg) out.push(await query);
      return out;
    };
  } });
}

// ---- schemas ----------------------------------------------------------------
const nullableInt = (min, max) => z.number().int().min(min).max(max).nullable();
export const quizSettings = z.strictObject({
  layout: z.enum(['all', 'one']).optional(), passingScore: z.number().int().min(0).max(100).optional(), maxAttempts: nullableInt(1, 100).optional(),
  timeLimitMinutes: nullableInt(1, 600).optional(), drawCount: nullableInt(1, 500).optional(), shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(), showAnswers: z.enum(['never', 'after_submit', 'after_pass']).optional(),
});
export const assignmentSettings = z.strictObject({
  allowText: z.boolean().optional(), allowFiles: z.boolean().optional(), maxFiles: z.number().int().min(1).max(10).optional(),
  dueDaysAfterEnroll: nullableInt(1, 3650).optional(), passingScore: nullableInt(0, 100).optional(),
});
const lessonSettings = z.union([quizSettings, assignmentSettings]).describe([
  'Solo quiz o assignment; al editar se combina con la configuración actual.',
  'quiz: layout all (todo en una página) | one (una pregunta por pantalla); passingScore % para aprobar (70); maxAttempts (null = ilimitados); timeLimitMinutes (null = sin límite); drawCount preguntas aleatorias por intento (null = todas); shuffleQuestions; shuffleOptions (true); showAnswers never | after_submit (por defecto) | after_pass.',
  'assignment: allowText (true) y allowFiles (true), al menos uno; maxFiles 1-10 (5); dueDaysAfterEnroll días para entregar a tiempo (null = sin fecha); passingScore calificación mínima (null = sin calificación).',
].join(' '));

export const QUESTION_GUIDE = [
  'Pregunta: { kind, prompt (markdown), points? (1-1000, 1), explanation?, options?, config? }. Por tipo:',
  'single: options [{text, correct}] 2-20 con exactamente una correcta. Ej: {"kind":"single","prompt":"¿Capital de Francia?","options":[{"text":"París","correct":true},{"text":"Roma"}]}',
  'multiple: options [{text, correct}] 2-20, al menos una correcta; config.partialCredit opcional.',
  'true_false: marca solo la correcta. Ej: {"kind":"true_false","prompt":"El agua hierve a 100 °C","options":[{"id":"true","correct":true}]}',
  'open: sin options; se califica a mano.',
  'short: options = respuestas aceptadas [{text}] 1-20; config.exactMatch opcional (por defecto ignora mayúsculas, acentos y espacios). Ej: {"kind":"short","prompt":"Símbolo del sodio","options":[{"text":"Na"}]}',
  'numeric: sin options; config {answer, tolerance>=0}. Ej: {"kind":"numeric","prompt":"7/2 =","config":{"answer":3.5,"tolerance":0}}',
  'ordering: options [{text}] 2-20 en el orden correcto; config.partialCredit opcional.',
  'matching: options [{text, match}] 2-20 (izquierda y su pareja; las parejas deben ser distintas); config.partialCredit opcional. Ej: {"kind":"matching","prompt":"Relaciona","options":[{"text":"México","match":"CDMX"},{"text":"Perú","match":"Lima"}]}',
  'fill_blank: las respuestas van en el prompt como [[a|b]] (máx. 30 espacios); config {allOrNothing, exactMatch} opcionales. Ej: {"kind":"fill_blank","prompt":"La capital de España es [[Madrid]]."}',
  'Al editar, options reemplaza la lista completa; envía el id actual de cada opción para conservarlo.',
].join('\n');
const questionOption = z.strictObject({
  id: z.string().max(40).optional().describe('Al editar: id de la opción existente. true_false: "true" o "false".'),
  text: z.string().max(1000).optional(),
  correct: z.boolean().optional(),
  match: z.string().max(500).optional().describe('Solo matching: elemento de la derecha.'),
});
const questionConfig = z.strictObject({
  partialCredit: z.boolean().optional(), exactMatch: z.boolean().optional(), allOrNothing: z.boolean().optional(),
  answer: z.union([z.number().finite(), z.string().max(40)]).optional(), tolerance: z.number().finite().min(0).optional(),
});
const questionFields = {
  kind: z.enum(QUESTION_KINDS), prompt: z.string().trim().min(1).max(10000), points: z.number().int().min(1).max(1000).optional(),
  explanation: z.string().max(10000).nullable().optional(), options: z.array(questionOption).max(20).optional(), config: questionConfig.optional(),
};
const QUESTION_HINT = 'Pregunta; forma por tipo en la descripción de lms.question.create.';
export const questionInput = z.strictObject(questionFields).describe(QUESTION_HINT);
export const questionPatch = z.strictObject(questionFields).partial().refine(data => Object.keys(data).length, 'Sin cambios').describe(QUESTION_HINT);
export const questionList = z.array(questionInput).min(1).max(MAX_QUESTIONS);

const courseFields = {
  title: z.string().trim().min(1).max(200), summary: z.string().max(500).nullable().optional(), description: z.string().max(50000).nullable().optional().describe('Markdown de la página del curso.'),
  category: z.string().max(100).nullable().optional(), level: z.enum(['basic', 'intermediate', 'advanced']).optional(),
  estimatedMinutes: z.number().int().min(0).max(100000).nullable().optional(), sequential: z.boolean().optional().describe('Desbloquear lecciones en orden.'),
  selfEnroll: z.boolean().optional().describe('Cualquier persona con acceso puede inscribirse desde el catálogo.'), certificateTemplateId: z.uuid().nullable().optional().describe('ID de lms_certificate_templates; null quita el certificado.'),
};
export const courseCreate = z.strictObject(courseFields);
export const coursePatch = z.strictObject(courseFields).partial().refine(data => Object.keys(data).length, 'Sin cambios');

const lessonFields = {
  title: z.string().trim().min(1).max(200),
  kind: z.enum(MCP_LESSON_KINDS).describe('text: lectura markdown; embed: video YouTube/Vimeo u otra URL https; quiz: examen; assignment: tarea. Video subido y archivos solo en la app.'),
  body: z.string().max(200000).nullable().optional().describe('Markdown: contenido de text o instrucciones de embed/quiz/assignment.'),
  embedUrl: z.string().max(2000).nullable().optional().describe('Requerido en embed: URL https (YouTube y Vimeo se convierten al reproductor).'),
  durationSeconds: z.number().int().min(0).max(604800).nullable().optional(),
  required: z.boolean().optional().describe('Cuenta para el avance y el certificado (true por defecto).'),
  preview: z.boolean().optional().describe('Vista previa pública cuando el enlace compartido muestra solo vistas previas.'),
  settings: lessonSettings.optional(),
};
export const lessonCreate = z.strictObject({ ...lessonFields, questions: questionList.optional().describe('Solo quiz: preguntas iniciales.') });
export const lessonPatch = z.strictObject({ ...lessonFields, sectionId: z.uuid().describe('Mover al final de otra sección del mismo curso.') }).partial().refine(data => Object.keys(data).length, 'Sin cambios');

// ---- validation through the LMS normalizers --------------------------------
function settingsFor(kind, settings, label) {
  if (settings === undefined) return undefined;
  const schema = kind === 'quiz' ? quizSettings : kind === 'assignment' ? assignmentSettings : null;
  insist(schema, 'invalid_request', `${label}: settings solo aplica a lecciones quiz o assignment.`);
  const parsed = schema.safeParse(settings);
  insist(parsed.success, 'invalid_request', `${label}: settings no corresponde a una lección ${kind}.`);
  return parsed.data;
}

export const checkCourse = (data, partial) => lmsSync(() => normalizeCourseInput(data, { partial }), 'Curso');

// Body for createLesson; questions are validated and returned apart.
export function checkLessonCreate(lesson, label = 'Lección') {
  const { questions, ...body } = lesson;
  body.settings = settingsFor(body.kind, body.settings, label);
  if (body.settings === undefined) delete body.settings;
  insist(!questions || body.kind === 'quiz', 'invalid_request', `${label}: solo las lecciones quiz llevan preguntas.`);
  const normalized = lmsSync(() => normalizeLessonInput(body, { partial: false }), label);
  (questions ?? []).forEach((question, index) => checkQuestion(question, { label: `${label}, pregunta ${index + 1}` }));
  return { body, normalized, questions: questions ?? [] };
}

// Patch for updateLesson. Settings merge with the stored ones (the API replaces them).
export function checkLessonPatch(current, patch) {
  const body = { ...patch };
  const kind = body.kind ?? current.kind;
  if (body.settings !== undefined) {
    const base = body.kind && body.kind !== current.kind ? {} : normalizeLessonSettings(current.kind, current.settings);
    body.settings = { ...base, ...settingsFor(kind, body.settings, 'Lección') };
  }
  const normalized = lmsSync(() => normalizeLessonInput(body, { partial: true, currentKind: current.kind }), 'Lección');
  const embedUrl = normalized.embedUrl !== undefined ? normalized.embedUrl : current.embedUrl;
  insist(kind !== 'embed' || embedUrl, 'invalid_request', 'Lección: escribe el enlace del video (embedUrl).');
  return { body, normalized };
}

// Deterministic option ids: validation only. The service assigns the real ids.
export function checkQuestion(body, { existing = null, label = 'Pregunta' } = {}) {
  let n = 0;
  return lmsSync(() => normalizeQuestionInput(body, { partial: Boolean(existing), existing, makeId: () => `v${++n}` }), label);
}

// ---- previews ----------------------------------------------------------------
export const show = value => value === undefined || value === null || value === '' ? '—' : typeof value === 'string' ? value : JSON.stringify(value);
export const clip = (value, max = 160) => { const text = show(value); return text.length > max ? `${text.slice(0, max - 1)}…` : text; };
export function fieldsOf(data, before = null, max = 400) {
  return Object.entries(data).map(([label, value]) => ({ label, value: clip(value, max), ...(before && before[label] !== undefined ? { before: clip(before[label], max) } : {}) }));
}
export function questionLine(question) {
  const items = question.options ?? [], config = question.config ?? {};
  const parts = items.map(item => `${item.text ?? item.id ?? ''}${item.match ? ` = ${item.match}` : ''}${item.correct ? ' (correcta)' : ''}`);
  const extra = Object.keys(config).length ? ` ${JSON.stringify(config)}` : '';
  return clip(`[${question.kind}${question.points ? `, ${question.points} pts` : ''}] ${question.prompt ?? ''}${parts.length ? ` | ${parts.join(' · ')}` : ''}${extra}`, 400);
}
export const lessonLine = (lesson, questions = []) => clip(`[${lesson.kind}] ${lesson.title}${lesson.embedUrl ? ` · ${lesson.embedUrl}` : ''}${lesson.preview ? ' · vista previa' : ''}${lesson.required === false ? ' · opcional' : ''}${questions.length ? ` · ${questions.length} preguntas` : ''}`, 300);

// ---- company-scoped lookups ---------------------------------------------------
export function createLmsLookups(prisma) {
  const found = (row, message) => { insist(row, 'not_found', message, 404); return row; };
  return {
    course: async (a, id) => found(await prisma.lmsCourse.findFirst({ where: { id, companyId: a.companyId, enabled: true } }), 'El curso no existe.'),
    section: async (a, id) => found(await prisma.lmsSection.findFirst({ where: { id, companyId: a.companyId } }), 'La sección no existe.'),
    lesson: async (a, id) => found(await prisma.lmsLesson.findFirst({ where: { id, companyId: a.companyId, enabled: true } }), 'La lección no existe.'),
    question: async (a, id) => found(await prisma.lmsQuizQuestion.findFirst({ where: { id, companyId: a.companyId, enabled: true } }), 'La pregunta no existe.'),
    async template(a, id) {
      if (!id) return null;
      return found(await prisma.lmsCertificateTemplate.findFirst({ where: { id, companyId: a.companyId, enabled: true }, select: { id: true, name: true } }), 'La plantilla de certificado no existe.');
    },
    async quiz(a, id) {
      const lesson = found(await prisma.lmsLesson.findFirst({ where: { id, companyId: a.companyId, enabled: true } }), 'La lección no existe.');
      insist(lesson.kind === 'quiz', 'conflict', 'La lección no es un examen (kind quiz).', 409);
      return lesson;
    },
  };
}
