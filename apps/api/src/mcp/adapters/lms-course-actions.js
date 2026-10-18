// Course and section writes of the runly.lms MCP domain. Every write goes
// through lms-service, so the REST validation rules apply unchanged.
import { z } from 'zod';
import { insist } from '../config.js';
import { checkCourse, clip, courseCreate, courseLink, coursePatch, fieldsOf } from './lms-common.js';

const MANAGE = 'lms.course.manage';
const STATUS_LABEL = { published: 'Publicar curso', draft: 'Pasar el curso a borrador (deja de verse en el catálogo)', archived: 'Archivar curso' };
const courseResult = row => ({ id: row.id, title: row.title, status: row.status, link: courseLink(row.id) });
const sectionTitle = z.string().trim().min(1).max(200);

export function createLmsCourseActions({ prisma, svc, find }) {
  async function structure(a, courseId) {
    const [sections, lessons] = await Promise.all([
      prisma.lmsSection.findMany({ where: { courseId, companyId: a.companyId }, select: { id: true, title: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }),
      prisma.lmsLesson.findMany({ where: { courseId, companyId: a.companyId, enabled: true }, select: { id: true, title: true, sectionId: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }),
    ]);
    return { sections, lessons };
  }

  return [
    { key: 'lms.course.create', permission: MANAGE, operation: 'create', label: 'Crear curso',
      description: 'Crear un curso en borrador (no visible para alumnos hasta publicarlo con lms.course.status).',
      inputSchema: z.strictObject({ data: courseCreate }),
      async prepare(input, a) {
        checkCourse(input.data, false);
        const template = await find.template(a, input.data.certificateTemplateId);
        return { input, targetId: null, preview: { title: 'Crear curso (borrador)', fields: fieldsOf({ ...input.data, ...(template ? { certificateTemplateId: template.name } : {}) }) } };
      },
      execute: async (input, a) => courseResult(await svc.createCourse(a.companyId, a.actorProfileId, input.data)) },

    { key: 'lms.course.update', permission: MANAGE, operation: 'update', label: 'Editar curso',
      description: 'Editar datos del curso: título, resumen, descripción markdown, categoría, nivel, duración estimada, orden secuencial, autoinscripción y plantilla de certificado.',
      inputSchema: z.strictObject({ courseId: z.uuid(), data: coursePatch }),
      async prepare(input, a) {
        const before = await find.course(a, input.courseId);
        checkCourse(input.data, true);
        const template = await find.template(a, input.data.certificateTemplateId);
        return { input, targetType: 'course', targetId: before.id, preview: { title: `Editar curso «${before.title}»`, fields: fieldsOf({ ...input.data, ...(template ? { certificateTemplateId: template.name } : {}) }, before) } };
      },
      execute: async (input, a) => courseResult(await svc.updateCourse(a.companyId, input.courseId, input.data)) },

    { key: 'lms.course.status', permission: MANAGE, operation: 'update', label: 'Publicar, despublicar o archivar curso',
      description: 'published: visible en el catálogo interno (y en su enlace compartido si está activo); draft: despublicar; archived: archivar. Publicar requiere al menos una lección.',
      inputSchema: z.strictObject({ courseId: z.uuid(), status: z.enum(['published', 'draft', 'archived']) }),
      async prepare(input, a) {
        const before = await find.course(a, input.courseId);
        insist(before.status !== input.status, 'invalid_request', `El curso ya está en estado ${input.status}.`);
        if (input.status === 'published') insist(await prisma.lmsLesson.count({ where: { courseId: before.id, companyId: a.companyId, enabled: true } }), 'invalid_request', 'Agrega al menos una lección antes de publicar.');
        const shared = input.status === 'published' && before.shareEnabled ? [{ label: 'Enlace compartido', value: 'Activo: personas externas con el enlace también verán el curso.' }] : [];
        return { input, targetType: 'course', targetId: before.id, preview: { title: `${STATUS_LABEL[input.status]}: «${before.title}»`, fields: [{ label: 'Estado', value: input.status, before: before.status }, ...shared] } };
      },
      execute: async (input, a) => courseResult(input.status === 'archived' ? await svc.archiveCourse(a.companyId, input.courseId) : await svc.updateCourse(a.companyId, input.courseId, { status: input.status })) },

    { key: 'lms.section.create', permission: MANAGE, operation: 'create', label: 'Crear sección',
      description: 'Agregar una sección vacía al final del curso. free: true abre sus lecciones sin inscribirse. Para crearla con lecciones usa lms.section.build.',
      inputSchema: z.strictObject({ courseId: z.uuid(), title: sectionTitle, free: z.boolean().optional() }),
      async prepare(input, a) {
        const course = await find.course(a, input.courseId);
        return { input, targetId: null, preview: { title: `Nueva sección en «${course.title}»`, fields: fieldsOf({ title: input.title, free: input.free ?? false }) } };
      },
      async execute(input, a) {
        const row = await svc.createSection(a.companyId, input.courseId, { title: input.title, free: input.free === true });
        return { id: row.id, title: row.title, free: row.free, link: courseLink(input.courseId) };
      } },

    { key: 'lms.section.update', permission: MANAGE, operation: 'update', label: 'Editar sección',
      description: 'Renombrar una sección o cambiar free (lecciones abiertas sin inscripción).',
      inputSchema: z.strictObject({ sectionId: z.uuid(), title: sectionTitle.optional(), free: z.boolean().optional() }).refine(input => input.title !== undefined || input.free !== undefined, 'Indica title o free'),
      async prepare(input, a) {
        const before = await find.section(a, input.sectionId);
        const { sectionId, ...data } = input;
        return { input, targetType: 'section', targetId: sectionId, preview: { title: `Editar sección «${before.title}»`, fields: fieldsOf(data, before) } };
      },
      async execute(input, a) {
        const { sectionId, ...data } = input;
        const row = await svc.updateSection(a.companyId, sectionId, data);
        return { id: row.id, title: row.title, free: row.free, link: courseLink(row.courseId) };
      } },

    { key: 'lms.section.delete', permission: MANAGE, operation: 'update', label: 'Eliminar sección vacía',
      description: 'Eliminar definitivamente una sección sin lecciones activas. Mueve o desactiva sus lecciones antes.',
      inputSchema: z.strictObject({ sectionId: z.uuid() }),
      async prepare(input, a) {
        const section = await find.section(a, input.sectionId);
        insist(!(await prisma.lmsLesson.count({ where: { sectionId: section.id, companyId: a.companyId, enabled: true } })), 'conflict', 'La sección tiene lecciones. Muévelas (lms.course.reorder o lms.lesson.update con sectionId) o desactívalas antes.', 409);
        return { input, targetType: 'section', targetId: section.id, preview: { title: 'Eliminar sección (definitivo)', fields: [{ label: 'Sección', value: section.title }] } };
      },
      execute: async (input, a) => svc.deleteSection(a.companyId, input.sectionId) },

    { key: 'lms.course.reorder', permission: MANAGE, operation: 'update', label: 'Ordenar secciones y lecciones',
      description: 'Orden completo del curso: todas las secciones con todas sus lecciones activas, cada una exactamente una vez. Sirve para reordenar secciones y mover o reordenar lecciones entre secciones. Consulta lms_course_detail antes.',
      inputSchema: z.strictObject({ courseId: z.uuid(), sections: z.array(z.strictObject({ sectionId: z.uuid(), lessonIds: z.array(z.uuid()).max(500) })).min(1).max(200) }),
      async prepare(input, a) {
        const course = await find.course(a, input.courseId);
        const { sections, lessons } = await structure(a, course.id);
        const sectionIds = input.sections.map(entry => entry.sectionId), lessonIds = input.sections.flatMap(entry => entry.lessonIds);
        const same = (given, rows) => given.length === rows.length && new Set(given).size === given.length && rows.every(row => given.includes(row.id));
        insist(same(sectionIds, sections), 'invalid_request', 'Incluye todas las secciones del curso exactamente una vez.');
        insist(same(lessonIds, lessons), 'invalid_request', 'Incluye todas las lecciones activas del curso exactamente una vez.');
        const titles = new Map([...sections, ...lessons].map(row => [row.id, row.title]));
        return { input, targetType: 'structure', targetId: course.id,
          preview: { title: `Nuevo orden de «${course.title}»`, fields: input.sections.map((entry, index) => ({ label: `${index + 1}. ${titles.get(entry.sectionId)}`, value: clip(entry.lessonIds.map(id => titles.get(id)).join(' · ') || 'Sin lecciones', 400) })) } };
      },
      async execute(input, a) {
        const { sections } = await svc.reorder(a.companyId, input.courseId, { sections: input.sections.map(entry => ({ id: entry.sectionId, lessonIds: entry.lessonIds })) });
        return { courseId: input.courseId, sections: sections.map(section => ({ id: section.id, title: section.title, lessons: section.lessons.map(lesson => lesson.id) })), link: courseLink(input.courseId) };
      } },
  ];
}
