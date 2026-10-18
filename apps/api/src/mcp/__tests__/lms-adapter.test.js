import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../registry.js';
import { createDomainRuntime } from '../domain-runtime.js';
import { createMcpAccess } from '../access.js';

// Real registry, domain runtime and MCP access over an in-memory Prisma double:
// scopes, company grant, membership permissions and module checks all run.
const uid = n => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const COMPANY = uid(1), OTHER = uid(2), PROFILE = uid(3), AUTH = uid(4);
const config = { resource: 'https://erp.example/mcp', web: 'https://web.example' };
const ALL = ['lms.access', 'lms.course.manage', 'lms.enrollment.manage'];
let next = 100;

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && !(value instanceof Date)) return 'in' in value ? value.in.includes(row[key]) : 'not' in value ? row[key] !== value.not : true;
    return row[key] === value;
  });
}
function table(rows, decorate = row => row) {
  const pick = where => rows.filter(row => matches(row, where)).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const first = async (args = {}) => { const row = pick(args.where)[0]; return row ? decorate(row, args) : null; };
  return { rows, findFirst: first, findUnique: first,
    findMany: async (args = {}) => pick(args.where).map(row => decorate(row, args)),
    count: async (args = {}) => pick(args.where).length,
    create: async ({ data }) => { const row = { id: uid(next++), position: 0, enabled: true, createdAt: new Date(), updatedAt: new Date(), ...data }; rows.push(row); return decorate(row, {}); },
    update: async ({ where, data }) => { const row = rows.find(r => r.id === where.id); Object.assign(row, data); return decorate(row, {}); },
    aggregate: async ({ where }) => ({ _max: { position: pick(where).reduce((max, row) => Math.max(max, row.position ?? 0), 0) || null } }),
    groupBy: async ({ by: [key], where }) => [...new Set(pick(where).map(row => row[key]))].map(value => ({ [key]: value, _count: { _all: pick({ ...where, [key]: value }).length } })),
    delete: async ({ where }) => rows.splice(rows.findIndex(row => row.id === where.id), 1)[0],
  };
}

function fixture(permissions = ALL) {
  const lessons = table([]);
  const sections = table([], (row, args) => args.include?.lessons ? { ...row, lessons: lessons.rows.filter(l => l.sectionId === row.id && l.enabled) } : row);
  const courses = table([], row => ({ ...row, _count: { sections: sections.rows.filter(s => s.courseId === row.id).length, enrollments: 0 } }));
  const proposals = [];
  const prisma = {
    lmsCourse: courses, lmsSection: sections, lmsLesson: lessons, lmsQuizQuestion: table([]), lmsEnrollment: table([]), lmsLessonProgress: table([]), lmsCertificateTemplate: table([]),
    fileAsset: { findMany: async () => [] },
    userProfile: { findUnique: async () => ({ id: PROFILE, authUserId: AUTH, enabled: true }) },
    membership: { findMany: async () => [{ companyId: COMPANY, company: { id: COMPANY, name: 'A', enabled: true }, role: { key: 'tester', companyId: COMPANY, permissions: permissions.map(key => ({ permission: { key, active: true } })) } }] },
    userPermissionGrant: { findMany: async () => [] },
    companyModule: { findMany: async () => [] },
    runlyModule: { findMany: async () => [{ id: uid(9), key: 'runly.lms', core: false, enabled: true, status: 'INSTALLED', manifest: { acl: { module: 'lms.access' } } }] },
    mcpState: { findUnique: async () => null, deleteMany: async () => ({ count: 0 }), create: async ({ data }) => { proposals.push(data.payload); return data; } },
  };
  const course = { id: uid(10), companyId: COMPANY, title: 'Seguridad industrial', status: 'draft', level: 'basic', enabled: true, shareEnabled: true, shareSettings: { scope: 'preview' }, position: 0 };
  const foreign = { id: uid(11), companyId: OTHER, title: 'Curso ajeno', status: 'draft', level: 'basic', enabled: true, shareSettings: {}, position: 0 };
  courses.rows.push(course, foreign);
  sections.rows.push({ id: uid(20), companyId: COMPANY, courseId: course.id, title: 'Introducción', position: 1 }, { id: uid(21), companyId: OTHER, courseId: foreign.id, title: 'Ajena', position: 1 });
  lessons.rows.push({ id: uid(30), companyId: COMPANY, courseId: course.id, sectionId: uid(20), title: 'Examen', kind: 'quiz', settings: {}, position: 1, enabled: true, required: true },
    { id: uid(31), companyId: OTHER, courseId: foreign.id, sectionId: uid(21), title: 'Lección ajena', kind: 'text', settings: {}, position: 1, enabled: true, required: true });
  const registry = createCapabilityRegistry({ prisma });
  const runtime = createDomainRuntime({ prisma, config, registry });
  const auth = (scopes = ['lms:read', 'lms:write']) => ({ authUserId: AUTH, grantId: 'grant', clientId: 'client', companyIds: [COMPANY], scopes, resource: config.resource, access: createMcpAccess(prisma, new Map()) });
  const call = (mode, operation, input, { scopes, companyId = COMPANY } = {}) => {
    const tool = registry.tools.find(item => item.name === `runly_lms_${mode}`);
    return runtime.run('lms', mode, tool.inputSchema.parse({ companyId, request: { operation, input } }), auth(scopes));
  };
  const actx = { companyId: COMPANY, actorProfileId: PROFILE };
  const apply = (key, proposal) => registry.create('runly.lms', prisma).actions.find(action => action.key === key).execute(proposal.prepared.input, actx);
  return { prisma, call, apply, proposals, course };
}

test('lms_courses y lms_course_detail: solo la empresa autorizada, con estado compartido', async () => {
  const { call, course } = fixture();
  const { result } = await call('query', 'lms_courses', {});
  assert.deepEqual(result.items.map(item => item.id), [course.id]);
  assert.deepEqual(result.items[0].share, { enabled: true, scope: 'preview' });
  assert.equal(result.items[0].sectionCount, 1);
  const detail = await call('query', 'lms_course_detail', { courseId: course.id });
  assert.equal(detail.result.sections[0].lessons[0].questionCount, 0);
  await assert.rejects(() => call('query', 'lms_course_detail', { courseId: uid(11) }), { code: 'not_found' });
  await assert.rejects(() => call('query', 'lms_lesson_detail', { lessonId: uid(31) }), { code: 'not_found' });
});

test('permisos, scopes y empresa: enrollments exige lms.enrollment.manage; escribir exige lms:write', async () => {
  const { call, course } = fixture(['lms.access', 'lms.course.manage']);
  await assert.rejects(() => call('query', 'lms_enrollments', { courseId: course.id }), { code: 'permission_denied' });
  await assert.rejects(() => call('prepare', 'lms.section.create', { courseId: course.id, title: 'Módulo 2' }, { scopes: ['lms:read'] }), { code: 'insufficient_scope' });
  await assert.rejects(() => call('query', 'lms_courses', {}, { companyId: OTHER }), { code: 'company_not_granted' });
  const limited = fixture(['lms.access']);
  await assert.rejects(() => limited.call('query', 'lms_courses', {}), { code: 'permission_denied' });
  await assert.rejects(() => limited.call('prepare', 'lms.course.create', { data: { title: 'X' } }), { code: 'permission_denied' });
});

test('lms.lesson.create: propuesta de examen con preguntas aplicada; sección ajena rechazada', async () => {
  const { call, apply, proposals, prisma } = fixture();
  const input = { sectionId: uid(20), data: { title: 'Evaluación final', kind: 'quiz', settings: { passingScore: 80, layout: 'one', drawCount: null }, questions: [
    { kind: 'single', prompt: '¿Color del casco de visitantes?', options: [{ text: 'Blanco', correct: true }, { text: 'Rojo' }] },
    { kind: 'fill_blank', prompt: 'El extintor tipo [[ABC|PQS]] sirve para fuegos eléctricos.' },
  ] } };
  const proposal = await call('prepare', 'lms.lesson.create', input);
  assert.equal(proposal.status, 'approval_required');
  assert.equal((await call('prepare', 'lms.lesson.create', input)).proposalId, proposal.proposalId, 'idempotente');
  const result = await apply('lms.lesson.create', proposals[0]);
  const lesson = prisma.lmsLesson.rows.find(row => row.id === result.id);
  assert.equal(lesson.companyId, COMPANY);
  assert.equal(lesson.settings.passingScore, 80);
  assert.equal(lesson.settings.layout, 'one');
  const questions = prisma.lmsQuizQuestion.rows.filter(row => row.lessonId === lesson.id);
  assert.equal(questions.length, 2);
  assert.equal(questions[0].options.filter(option => option.correct).length, 1);
  await assert.rejects(() => call('prepare', 'lms.lesson.create', { sectionId: uid(21), data: { title: 'X', kind: 'text' } }), { code: 'not_found' });
  await assert.rejects(() => call('prepare', 'lms.lesson.create', { sectionId: uid(20), data: { title: 'X', kind: 'text', settings: { passingScore: 50 } } }), { code: 'invalid_request' });
});

test('lms.question.create: cada tipo nuevo valida con las reglas del LMS', async () => {
  const { call } = fixture();
  const valid = [
    { kind: 'short', prompt: 'Símbolo del sodio', options: [{ text: 'Na' }], config: { exactMatch: true } },
    { kind: 'numeric', prompt: '7/2 =', config: { answer: 3.5, tolerance: 0 } },
    { kind: 'ordering', prompt: 'Ordena', options: [{ text: 'Uno' }, { text: 'Dos' }], config: { partialCredit: true } },
    { kind: 'matching', prompt: 'Relaciona', options: [{ text: 'México', match: 'CDMX' }, { text: 'Perú', match: 'Lima' }] },
    { kind: 'fill_blank', prompt: 'La capital de España es [[Madrid]].', config: { allOrNothing: true } },
    { kind: 'true_false', prompt: 'El agua hierve a 100 °C', options: [{ id: 'true', correct: true }] },
    { kind: 'multiple', prompt: 'Primos', options: [{ text: '2', correct: true }, { text: '4' }, { text: '3', correct: true }] },
    { kind: 'open', prompt: 'Explica el procedimiento' },
  ];
  for (const question of valid) assert.equal((await call('prepare', 'lms.question.create', { lessonId: uid(30), questions: [question] })).status, 'approval_required', question.kind);
  const invalid = [
    { kind: 'short', prompt: 'Sin respuestas', options: [] },
    { kind: 'numeric', prompt: 'Sin respuesta', config: {} },
    { kind: 'ordering', prompt: 'Uno solo', options: [{ text: 'Uno' }] },
    { kind: 'matching', prompt: 'Repetidas', options: [{ text: 'A', match: 'X' }, { text: 'B', match: 'x' }] },
    { kind: 'fill_blank', prompt: 'Sin espacios en blanco' },
    { kind: 'single', prompt: 'Dos correctas', options: [{ text: 'A', correct: true }, { text: 'B', correct: true }] },
  ];
  for (const question of invalid) await assert.rejects(() => call('prepare', 'lms.question.create', { lessonId: uid(30), questions: [question] }), { code: 'invalid_request' }, question.prompt);
  await assert.rejects(() => call('prepare', 'lms.question.create', { lessonId: uid(31), questions: [valid[0]] }), { code: 'not_found' });
});

test('lms.course.reorder: orden completo aplicado dentro de la transacción', async () => {
  const { call, apply, proposals, prisma, course } = fixture();
  const second = await prisma.lmsSection.create({ data: { companyId: COMPANY, courseId: course.id, title: 'Práctica', position: 2 } });
  await assert.rejects(() => call('prepare', 'lms.course.reorder', { courseId: course.id, sections: [{ sectionId: second.id, lessonIds: [] }] }), { code: 'invalid_request' });
  await call('prepare', 'lms.course.reorder', { courseId: course.id, sections: [{ sectionId: second.id, lessonIds: [uid(30)] }, { sectionId: uid(20), lessonIds: [] }] });
  await apply('lms.course.reorder', proposals.at(-1));
  assert.equal(prisma.lmsLesson.rows.find(row => row.id === uid(30)).sectionId, second.id);
  assert.equal(second.position, 1);
});

test('lms.section.build, lms.lesson.update y lms.course.status: lote revisable y reglas del servicio', async () => {
  const { call, apply, proposals, prisma, course } = fixture();
  await call('prepare', 'lms.section.build', { courseId: course.id, title: 'Módulo 2', lessons: [
    { title: 'Lectura', kind: 'text', body: '# Riesgos\nTexto real.' },
    { title: 'Video', kind: 'embed', embedUrl: 'https://youtu.be/dQw4w9WgXcQ', preview: true },
    { title: 'Tarea', kind: 'assignment', settings: { allowFiles: false, passingScore: 70 } },
  ] });
  const built = await apply('lms.section.build', proposals.at(-1));
  assert.equal(built.lessons.length, 3);
  const video = prisma.lmsLesson.rows.find(row => row.id === built.lessons[1].id);
  assert.equal(video.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  await assert.rejects(() => call('prepare', 'lms.section.build', { courseId: course.id, title: 'X', lessons: [{ title: 'Sin enlace', kind: 'embed' }] }), { code: 'invalid_request' });
  await call('prepare', 'lms.lesson.update', { lessonId: uid(30), data: { settings: { maxAttempts: 3 } } });
  await call('prepare', 'lms.lesson.update', { lessonId: uid(30), data: { settings: { passingScore: 90 } } });
  await apply('lms.lesson.update', proposals.at(-1));
  assert.equal(prisma.lmsLesson.rows.find(row => row.id === uid(30)).settings.passingScore, 90);
  const update = await call('prepare', 'lms.course.update', { courseId: course.id, data: { summary: 'Curso obligatorio', sequential: true } });
  assert.equal(update.preview.fields.find(field => field.label === 'sequential').value, 'true');
  const publish = await call('prepare', 'lms.course.status', { courseId: course.id, status: 'published' });
  assert.ok(publish.preview.fields.some(field => field.label === 'Enlace compartido'));
  await apply('lms.course.status', proposals.at(-1));
  assert.equal(course.status, 'published');
  await assert.rejects(() => call('prepare', 'lms.section.delete', { sectionId: uid(20) }), { code: 'conflict' });
});
