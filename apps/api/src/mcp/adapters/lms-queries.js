// Read operations of the runly.lms MCP domain. Everything is scoped by the
// consented company; authoring reads need lms.course.manage and enrollments
// lms.enrollment.manage, the same permissions as the REST routes.
import { z } from 'zod';
import { normalizeShareSettings } from '../../routes/lms/lms-share-core.js';
import { isFileSource } from '../../routes/lms/lms-cert-templates.js';
import { readLayout } from '../../routes/lms/lms-cert-pdf-layout.js';
import { CERTIFICATES_LINK, CERT_TAG_GUIDE } from './lms-cert-actions.js';
import { createLmsSerializers } from '../../routes/lms/lms-serialize.js';
import { normalizeLessonSettings } from '../../routes/lms/lms-eval-core.js';
import { pageInput } from '../contracts.js';
import { courseLink, lessonLink, QUESTION_GUIDE } from './lms-common.js';

export const LMS_GUIDE = [
  'Flujo: lms_courses -> lms.course.create -> lms.section.build (sección con lecciones y preguntas en una propuesta) -> revisar en Runly -> lms.course.status published.',
  'Tipos de lección por MCP: text, embed (YouTube/Vimeo), quiz y assignment. El video subido y los archivos se agregan en la app.',
  'Escribe contenido real en español y en markdown; nada de lorem ipsum. Cada propuesta debe ser revisable: hasta 20 lecciones y 50 preguntas por lección.',
  'Las preguntas se describen en lms.question.create; usa lms_quiz_questions para ver la forma exacta antes de editar.',
  'Certificados: lms_certificate_templates lista las plantillas con sus etiquetas; una plantilla nueva se sube como archivo .docx/.pptx/.pdf (runly_files_import_* sin destino y luego lms.certificate_template.create) y se asigna con lms.course.update certificateTemplateId.',
  'Calificar, emitir certificados, enlaces compartidos e invitaciones se hacen en la app.',
];

const MANAGE = 'lms.course.manage';
const pick = (row, keys) => Object.fromEntries(keys.map(key => [key, row[key] ?? null]));
const COURSE_KEYS = ['id', 'title', 'status', 'category', 'level', 'estimatedMinutes', 'sequential', 'selfEnroll', 'certificateTemplateId', 'sectionCount', 'lessonCount', 'enrollmentCount', 'updatedAt'];

export function createLmsQueries({ prisma, svc, quiz, find }) {
  const ser = createLmsSerializers({ prisma });
  async function shares(a, ids) {
    if (!ids.length) return new Map();
    const rows = await prisma.lmsCourse.findMany({ where: { id: { in: ids }, companyId: a.companyId }, select: { id: true, shareEnabled: true, shareSettings: true } });
    return new Map(rows.map(row => [row.id, { enabled: row.shareEnabled === true, scope: normalizeShareSettings(row.shareSettings).scope }]));
  }
  async function questionCounts(lessonIds) {
    if (!lessonIds.length) return new Map();
    const rows = await prisma.lmsQuizQuestion.groupBy({ by: ['lessonId'], where: { lessonId: { in: lessonIds }, enabled: true }, _count: { _all: true } });
    return new Map(rows.map(row => [row.lessonId, row._count._all]));
  }
  const lessonSummary = (lesson, counts) => ({
    id: lesson.id, kind: lesson.kind, title: lesson.title, position: lesson.position, durationSeconds: lesson.durationSeconds, required: lesson.required, preview: lesson.preview,
    settings: lesson.settings, hasFile: Boolean(lesson.fileId), ...(lesson.kind === 'quiz' ? { questionCount: counts.get(lesson.id) ?? 0 } : {}), link: lessonLink(lesson.courseId, lesson.id),
  });

  return [
    { name: 'lms_courses', permission: MANAGE, inputSchema: z.strictObject({ ...pageInput, search: z.string().max(200).optional(), status: z.enum(['draft', 'published', 'archived']).optional() }),
      definition: { description: 'Cursos de la empresa: estado, conteos de secciones/lecciones/alumnos, enlace compartido y guía de autoría.' },
      async run(input, a) {
        const needle = input.search?.trim().toLowerCase();
        const all = (await svc.listCourses(a.companyId, { status: input.status })).filter(row => !needle || `${row.title} ${row.category ?? ''}`.toLowerCase().includes(needle));
        const page = all.slice((input.page - 1) * input.limit, input.page * input.limit), share = await shares(a, page.map(row => row.id));
        return { items: page.map(row => ({ ...pick(row, COURSE_KEYS), share: share.get(row.id) ?? { enabled: false, scope: 'all' }, link: courseLink(row.id) })), total: all.length, page: input.page, limit: input.limit, guide: LMS_GUIDE };
      } },
    { name: 'lms_course_detail', permission: MANAGE, inputSchema: z.strictObject({ courseId: z.uuid() }),
      definition: { description: 'Curso con descripción, secciones y lecciones (tipo, título, duración, gratis/vista previa, configuración y número de preguntas).' },
      async run(input, a) {
        const { course, sections } = await svc.getCourse(a.companyId, input.courseId);
        const lessons = sections.flatMap(section => section.lessons);
        const [share, counts] = await Promise.all([shares(a, [course.id]), questionCounts(lessons.filter(lesson => lesson.kind === 'quiz').map(lesson => lesson.id))]);
        return { course: { ...pick(course, [...COURSE_KEYS, 'summary', 'description', 'promoLessonId']), share: share.get(course.id), link: courseLink(course.id) },
          sections: sections.map(section => ({ id: section.id, title: section.title, position: section.position, free: section.free, lessons: section.lessons.map(lesson => lessonSummary(lesson, counts)) })) };
      } },
    { name: 'lms_lesson_detail', permission: MANAGE, inputSchema: z.strictObject({ lessonId: z.uuid() }),
      definition: { description: 'Lección completa: contenido markdown, enlace embebido, configuración del examen o la tarea.' },
      async run(input, a) {
        const lesson = await ser.serializeLesson(await find.lesson(a, input.lessonId));
        const counts = lesson.kind === 'quiz' ? await questionCounts([lesson.id]) : new Map();
        return { lesson: { ...lessonSummary(lesson, counts), courseId: lesson.courseId, sectionId: lesson.sectionId, body: lesson.body, embedUrl: lesson.embedUrl, fileName: lesson.fileName } };
      } },
    { name: 'lms_quiz_questions', permission: MANAGE, inputSchema: z.strictObject({ lessonId: z.uuid() }),
      definition: { description: 'Preguntas de un examen con su forma de autoría completa (options con id y correct, config), en el mismo formato que aceptan lms.question.create/update.' },
      async run(input, a) {
        const lesson = await find.quiz(a, input.lessonId);
        const questions = await quiz.listQuestions(a.companyId, lesson.id);
        return { lessonId: lesson.id, title: lesson.title, settings: normalizeLessonSettings('quiz', lesson.settings), questions, format: QUESTION_GUIDE };
      } },
    { name: 'lms_enrollments', permission: 'lms.enrollment.manage', inputSchema: z.strictObject({ ...pageInput, courseId: z.uuid(), status: z.enum(['active', 'completed', 'dropped']).optional() }),
      definition: { description: 'Alumnos inscritos en un curso con avance, estado, vencimiento y certificado (solo lectura).' },
      async run(input, a) {
        const rows = (await svc.listEnrollments(a.companyId, input.courseId)).filter(row => !input.status || row.status === input.status);
        const page = rows.slice((input.page - 1) * input.limit, input.page * input.limit);
        return { items: page.map(row => ({ id: row.id, learner: row.learner ? { id: row.learner.id, displayName: row.learner.displayName, kind: row.learner.kind } : null, status: row.status, source: row.source,
          progressPct: row.progressPct, dueAt: row.dueAt, overdue: row.overdue, startedAt: row.startedAt, completedAt: row.completedAt, certificateFolio: row.certificate?.revokedAt ? null : row.certificate?.folio ?? null,
          failedLessons: row.failedLessons })), total: rows.length, page: input.page, limit: input.limit };
      } },
    { name: 'lms_certificate_templates', permission: MANAGE, inputSchema: z.strictObject({ includeDisabled: z.boolean().optional() }),
      definition: { description: 'Plantillas de certificado para certificateTemplateId de un curso: origen (design, docx, pptx, pdf), etiquetas {{…}} de Word/PowerPoint, campos colocados de un PDF, cursos que la usan y la guía de etiquetas para crear una nueva con lms.certificate_template.create.' },
      async run(input, a) {
        const rows = await prisma.lmsCertificateTemplate.findMany({ where: { companyId: a.companyId, ...(input.includeDisabled ? {} : { enabled: true }) }, select: { id: true, name: true, source: true, enabled: true, placeholders: true, layout: true }, orderBy: { name: 'asc' } });
        const used = rows.length ? await prisma.lmsCourse.groupBy({ by: ['certificateTemplateId'], where: { companyId: a.companyId, enabled: true, certificateTemplateId: { in: rows.map(row => row.id) } }, _count: { _all: true } }) : [];
        const courses = new Map(used.map(row => [row.certificateTemplateId, row._count._all]));
        return { items: rows.map(row => {
          const source = isFileSource(row.source) ? row.source : 'design';
          const tags = ['docx', 'pptx'].includes(source) && Array.isArray(row.placeholders) ? row.placeholders : null;
          const fields = source === 'pdf' ? readLayout(row.layout).fields.map(field => field.key) : null;
          return { id: row.id, name: row.name, source, enabled: row.enabled, ...(tags ? { tags } : {}), ...(fields ? { fields } : {}), courseCount: courses.get(row.id) ?? 0 };
        }), tagGuide: CERT_TAG_GUIDE, link: CERTIFICATES_LINK };
      } },
  ];
}
