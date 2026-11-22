import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createCapabilityRegistry } from '../registry.js';
import { createDomainRuntime, isSensitive } from '../domain-runtime.js';
import { createMcpAccess } from '../access.js';

// Real registry, domain runtime and MCP access over an in-memory Prisma double,
// like lms-adapter.test.js, extended with the tables standalone evaluations use.
const uid = n => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const COMPANY = uid(1), OTHER = uid(2), PROFILE = uid(3), AUTH = uid(4), COLLEAGUE = uid(5);
const config = { resource: 'https://erp.example/mcp', web: 'https://web.example' };
const MANAGER = ['lms.access', 'lms.course.manage'];
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
    createMany: async ({ data }) => { for (const item of data) rows.push({ id: uid(next++), createdAt: new Date(), ...item }); },
    update: async ({ where, data }) => { const row = rows.find(r => r.id === where.id); Object.assign(row, data); return decorate(row, {}); },
    deleteMany: async ({ where }) => { for (const row of pick(where)) rows.splice(rows.indexOf(row), 1); },
    aggregate: async ({ where }) => ({ _max: { position: pick(where).reduce((max, row) => Math.max(max, row.position ?? 0), 0) || null } }),
    groupBy: async ({ by: [key], where }) => [...new Set(pick(where).map(row => row[key]))].map(value => { const group = pick({ ...where, [key]: value }); return { [key]: value, _count: { _all: group.length }, _sum: { points: group.reduce((sum, row) => sum + (row.points ?? 0), 0) } }; }),
    delete: async ({ where }) => rows.splice(rows.findIndex(row => row.id === where.id), 1)[0],
  };
}

function fixture(permissions = MANAGER) {
  const lessons = table([]), enrollments = table([]);
  const courses = table([], row => ({ ...row, _count: { enrollments: enrollments.rows.filter(e => e.courseId === row.id && e.status !== 'dropped').length } }));
  const create = courses.create;
  courses.create = ({ data }) => create({ data: { shareEnabled: false, shareToken: null, shareSettings: {}, ...data } });
  const graders = table([]);
  const proposals = [];
  const prisma = {
    lmsCourse: courses, lmsLesson: lessons, lmsSection: table([]), lmsQuizQuestion: table([]), lmsLessonResource: table([]), lmsEnrollment: enrollments, lmsCourseGrader: graders, lmsGradeEvent: table([]),
    lmsAssessmentSession: table([]), lmsQuizAttempt: table([]), lmsSubmission: table([]), lmsLessonProgress: table([]), lmsCertificateTemplate: table([]),
    fileAsset: { findMany: async () => [], findFirst: async () => null },
    userProfile: { findUnique: async () => ({ id: PROFILE, authUserId: AUTH, enabled: true }), findMany: async () => [{ id: COLLEAGUE, displayName: 'Ana Evaluadora', email: 'ana@example.com' }] },
    membership: { findMany: async args => args?.where?.userId?.in ? args.where.userId.in.filter(id => id === COLLEAGUE).map(userId => ({ userId }))
      : [{ companyId: COMPANY, company: { id: COMPANY, name: 'A', enabled: true }, role: { key: 'tester', companyId: COMPANY, permissions: permissions.map(key => ({ permission: { key, active: true } })) } }] },
    userPermissionGrant: { findMany: async () => [] },
    companyModule: { findMany: async () => [] },
    runlyModule: { findMany: async () => [{ id: uid(9), key: 'runly.lms', core: false, enabled: true, status: 'INSTALLED', manifest: { acl: { module: 'lms.access' } } }] },
    mcpState: { findUnique: async () => null, deleteMany: async () => ({ count: 0 }), create: async ({ data }) => { proposals.push(data.payload); return data; } },
    $transaction: async fn => fn(prisma),
  };
  const foreign = { id: uid(11), companyId: OTHER, kind: 'assessment', title: 'Evaluación ajena', status: 'draft', enabled: true, settings: {}, shareSettings: {}, position: 0 };
  courses.rows.push(foreign);
  const registry = createCapabilityRegistry({ prisma });
  const runtime = createDomainRuntime({ prisma, config, registry });
  const auth = (scopes = ['lms:read', 'lms:write']) => ({ authUserId: AUTH, grantId: 'grant', clientId: 'client', companyIds: [COMPANY], scopes, resource: config.resource, access: createMcpAccess(prisma, new Map()) });
  const call = async (mode, operation, input, { scopes, companyId = COMPANY } = {}) => {
    const tool = registry.tools.find(item => item.name === `runly_lms_${mode}`);
    return runtime.run('lms', mode, tool.inputSchema.parse({ companyId, request: { operation, input } }), auth(scopes));
  };
  // Prepare, then execute the stored proposal the way commit does (fresh prepare, then execute).
  const adapter = () => registry.create('runly.lms', prisma);
  const actx = { companyId: COMPANY, actorProfileId: PROFILE, isAdmin: false, permissionSet: new Set(permissions), can: key => permissions.includes(key) };
  async function run(key, input) {
    const proposal = await call('prepare', key, input);
    const definition = adapter().actions.find(action => action.key === key);
    const prepared = proposals.at(-1).prepared;
    return { proposal, result: await definition.execute(prepared.input, actx) };
  }
  return { prisma, call, run, proposals, adapter, registry };
}

const open = (prompt, points = 20) => ({ kind: 'open', prompt, points });
const pvr = () => ({
  data: { title: 'Evaluación técnica y práctica — Analista Comercial PVR', settings: { timeLimitMinutes: 60, maxSessions: 1 } },
  activities: [
    { type: 'questionnaire', title: 'Cuestionario técnico', questions: Array.from({ length: 10 }, (_, n) => open(`Pregunta ${n + 1}: describe tu método de análisis.`, 10)) },
    { type: 'practical', title: 'Caso práctico en Excel', body: 'Descarga el material original y entrega tu libro y presentación.', settings: { maxPoints: 100, allowFiles: true, acceptedTypes: ['xlsx', 'pptx'] } },
  ],
});

test('descubrimiento: operaciones de evaluaciones en el catálogo y contrato JSON de ChatGPT', () => {
  const { adapter, registry } = fixture();
  const queries = adapter().queries.map(query => query.name), actions = adapter().actions.map(action => action.key);
  for (const name of ['lms_assessments', 'lms_assessment_detail', 'lms_assessment_activity_detail', 'lms_assessment_questions', 'lms_assessment_participants', 'lms_assessment_results', 'lms_assessment_review', 'lms_assessment_graders', 'lms_assessment_share']) assert.ok(queries.includes(name), name);
  for (const key of ['create', 'update', 'status', 'build', 'activity.create', 'activity.update', 'activity.delete', 'activity.reorder', 'question.create', 'question.update', 'question.delete', 'question.reorder', 'rubric.update', 'material.attach', 'material.remove', 'share.update', 'share.rotate', 'grader.assign', 'grader.remove']) assert.ok(actions.includes(`lms.assessment.${key}`), key);
  for (const tool of registry.tools.filter(item => item.name.startsWith('runly_lms_'))) assert.ok(z.toJSONSchema(tool.inputSchema, { io: 'input' }), tool.name);
  assert.ok(actions.includes('lms.course.create') && queries.includes('lms_courses'), 'Cursos intactos');
});

test('lms.assessment.build: 200 puntos y 60 minutos globales, borrador tipo assessment, idempotente y sin duplicados', async () => {
  const { call, run, proposals, prisma } = fixture();
  const input = pvr();
  const proposal = await call('prepare', 'lms.assessment.build', input);
  assert.match(proposal.preview.title, /200 puntos/);
  assert.equal((await call('prepare', 'lms.assessment.build', input)).proposalId, proposal.proposalId, 'idempotente');
  proposals.length = 0;
  const { result } = await run('lms.assessment.build', input);
  const row = prisma.lmsCourse.rows.find(item => item.id === result.id);
  assert.equal(row.kind, 'assessment');
  assert.equal(row.status, 'draft');
  assert.equal(row.settings.timeLimitMinutes, 60);
  assert.equal(row.settings.maxSessions, 1);
  assert.equal(prisma.lmsLesson.rows.filter(item => item.courseId === row.id && item.sectionId === null).length, 2);
  assert.equal(prisma.lmsQuizQuestion.rows.length, 10);
  assert.equal(prisma.lmsSection.rows.length, 0, 'sin secciones artificiales');
  const detail = await call('query', 'lms_assessment_detail', { assessmentId: row.id });
  assert.equal(detail.result.assessment.maxPoints, 200);
  assert.deepEqual(detail.result.publishProblems, []);
  await assert.rejects(() => call('prepare', 'lms.assessment.build', input), { code: 'conflict' }, 'segundo borrador con el mismo título');
});

test('validación del LMS: cuestionario sin preguntas, preguntas en entregas y settings ajenos al tipo', async () => {
  const { call } = fixture();
  const base = { data: { title: 'X' } };
  await assert.rejects(() => call('prepare', 'lms.assessment.build', { ...base, activities: [{ type: 'questionnaire', title: 'Vacío' }] }), { code: 'invalid_request' });
  await assert.rejects(() => call('prepare', 'lms.assessment.build', { ...base, activities: [{ type: 'practical', title: 'P', questions: [open('x')] }] }), { code: 'invalid_request' });
  await assert.rejects(() => call('prepare', 'lms.assessment.build', { ...base, activities: [{ kind: 'quiz', title: 'Q', settings: { maxPoints: 5 }, questions: [open('x')] }] }));
  await assert.rejects(() => call('prepare', 'lms.assessment.create', { data: { title: 'X', settings: { timeLimitMinutes: 0 } } }));
  await assert.rejects(() => call('prepare', 'lms.assessment.create', { data: { title: 'X', settings: { opensAt: '2026-12-02T00:00:00Z', closesAt: '2026-12-01T00:00:00Z' } } }), { code: 'invalid_request' });
});

test('actividades, preguntas, rúbrica y orden: servicios REST reutilizados', async () => {
  const { call, run, proposals, prisma } = fixture();
  const { result } = await run('lms.assessment.create', { data: { title: 'Evaluación base', settings: { timeLimitMinutes: 30 } } });
  const quiz = (await run('lms.assessment.activity.create', { assessmentId: result.id, data: { type: 'questionnaire', title: 'Cuestionario' } })).result;
  const task = (await run('lms.assessment.activity.create', { assessmentId: result.id, data: { type: 'practical', title: 'Práctica' } })).result;
  assert.deepEqual((await call('query', 'lms_assessment_detail', { assessmentId: result.id })).result.publishProblems, ['«Cuestionario» no tiene preguntas.']);
  await run('lms.assessment.question.create', { activityId: quiz.id, questions: [{ kind: 'single', prompt: '¿Cuál?', points: 5, options: [{ text: 'A', correct: true }, { text: 'B' }] }, open('Explica', 15)] });
  const questions = (await call('query', 'lms_assessment_questions', { activityId: quiz.id })).result;
  assert.equal(questions.totalPoints, 20);
  await run('lms.assessment.question.update', { questionId: questions.questions[1].id, data: { points: 25 } });
  assert.equal((await call('query', 'lms_assessment_questions', { activityId: quiz.id })).result.totalPoints, 30);
  await run('lms.assessment.question.reorder', { activityId: quiz.id, questionIds: [questions.questions[1].id, questions.questions[0].id] });
  await assert.rejects(() => call('prepare', 'lms.assessment.question.reorder', { activityId: quiz.id, questionIds: [questions.questions[0].id] }), { code: 'invalid_request' });
  const rubric = [{ label: 'Fórmulas', points: 40 }, { label: 'Presentación', points: 60, description: 'Claridad' }];
  await assert.rejects(() => call('prepare', 'lms.assessment.rubric.update', { activityId: quiz.id, rubric }), { code: 'conflict' }, 'la rúbrica es de entregas');
  assert.match((await call('prepare', 'lms.assessment.rubric.update', { activityId: task.id, rubric })).preview.title, /100 puntos/);
  await run('lms.assessment.rubric.update', { activityId: task.id, rubric });
  assert.equal((await call('query', 'lms_assessment_detail', { assessmentId: result.id })).result.assessment.maxPoints, 130);
  await run('lms.assessment.activity.reorder', { assessmentId: result.id, activityIds: [task.id, quiz.id] });
  assert.equal(prisma.lmsLesson.rows.find(row => row.id === task.id).position, 1);
  await assert.rejects(() => call('prepare', 'lms.assessment.activity.update', { activityId: quiz.id, data: { settings: { maxPoints: 9 } } }), { code: 'invalid_request' });
  proposals.length = 0;
  await run('lms.assessment.activity.delete', { activityId: task.id });
  assert.equal(prisma.lmsLesson.rows.find(row => row.id === task.id).enabled, false);
});

test('publicación: bloqueos, confirmación sensible, enlace real y regeneración', async () => {
  const { adapter, call, run, prisma } = fixture();
  const { result: built } = await run('lms.assessment.build', pvr());
  const id = built.id;
  const status = adapter().actions.find(action => action.key === 'lms.assessment.status');
  assert.equal(isSensitive(adapter(), status, { status: 'published' }), true);
  assert.equal(isSensitive(adapter(), status, { status: 'draft' }), false);
  const shareUpdate = adapter().actions.find(action => action.key === 'lms.assessment.share.update');
  assert.equal(isSensitive(adapter(), shareUpdate, { enabled: true }), true);
  await assert.rejects(() => call('prepare', 'lms.assessment.share.update', { assessmentId: id, consent: { required: true } }), { code: 'invalid_request' }, 'aviso obligatorio sin texto');
  const shared = (await run('lms.assessment.share.update', { assessmentId: id, enabled: true, consent: { required: true, noticeText: 'Aviso de privacidad.' }, intakeFields: [{ key: 'telefono', required: false }] })).result;
  assert.equal(shared.enabled, true);
  assert.match(shared.path, /^\/app\/p\/lms\/evaluacion\/.+/);
  assert.equal(prisma.lmsCourse.rows.find(row => row.id === id).status, 'draft');
  const published = await run('lms.assessment.status', { assessmentId: id, status: 'published' });
  assert.equal(published.result.status, 'published');
  assert.equal((await call('query', 'lms_assessment_share', { assessmentId: id })).result.published, true);
  await assert.rejects(() => call('prepare', 'lms.assessment.status', { assessmentId: id, status: 'published' }), { code: 'invalid_request' });
  const before = shared.path;
  const rotated = (await run('lms.assessment.share.rotate', { assessmentId: id })).result;
  assert.notEqual(rotated.path, before);
  const empty = fixture();
  const { result: bare } = await empty.run('lms.assessment.create', { data: { title: 'Sin actividades' } });
  await assert.rejects(() => empty.call('prepare', 'lms.assessment.status', { assessmentId: bare.id, status: 'published' }), { code: 'invalid_request' });
});

test('evaluadores: lista combinada, quitar es sensible y la lista limita los resultados', async () => {
  const reviewer = fixture([...MANAGER, 'lms.assessment.results', 'lms.grade']);
  const { call, run, adapter, prisma } = reviewer;
  const { result: built } = await run('lms.assessment.build', pvr());
  await run('lms.assessment.status', { assessmentId: built.id, status: 'published' }).catch(() => null);
  prisma.lmsCourse.rows.find(row => row.id === built.id).status = 'published';
  assert.deepEqual((await call('query', 'lms_assessment_results', { assessmentId: built.id })).result.rows ?? [], [], 'sin lista: cualquiera con lms.assessment.results');
  await assert.rejects(() => call('prepare', 'lms.assessment.grader.assign', { assessmentId: built.id, members: [{ userProfileId: uid(77), role: 'grader' }] }), { code: 'invalid_request' }, 'solo personas activas de la empresa');
  const assigned = (await run('lms.assessment.grader.assign', { assessmentId: built.id, members: [{ userProfileId: COLLEAGUE, role: 'grader' }] })).result;
  assert.equal(assigned.members.length, 1);
  assert.equal((await call('query', 'lms_assessment_graders', { assessmentId: built.id })).result.members[0].userProfileId, COLLEAGUE);
  // El actor tiene lms.course.manage (gerente): conserva acceso; quien no está en la lista pierde acceso.
  assert.ok(await call('query', 'lms_assessment_results', { assessmentId: built.id }));
  const remove = adapter().actions.find(action => action.key === 'lms.assessment.grader.remove');
  assert.equal(isSensitive(adapter(), remove, { userProfileIds: [COLLEAGUE] }), true);
  await run('lms.assessment.grader.remove', { assessmentId: built.id, userProfileIds: [COLLEAGUE] });
  assert.equal(prisma.lmsCourseGrader.rows.length, 0);
  await assert.rejects(() => call('prepare', 'lms.assessment.grader.remove', { assessmentId: built.id, userProfileIds: [COLLEAGUE] }), { code: 'invalid_request' });

  const grader = fixture(['lms.access', 'lms.assessment.results']);
  grader.prisma.lmsCourse.rows.push({ id: uid(50), companyId: COMPANY, kind: 'assessment', title: 'Restringida', status: 'published', enabled: true, settings: {}, shareSettings: {}, position: 0 });
  grader.prisma.lmsCourseGrader.rows.push({ id: uid(51), courseId: uid(50), userProfileId: COLLEAGUE, role: 'grader' });
  await assert.rejects(() => grader.call('query', 'lms_assessment_results', { assessmentId: uid(50) }), { code: 'permission_denied' }, 'permiso por evaluación');
  await assert.rejects(() => grader.call('query', 'lms_assessment_graders', { assessmentId: uid(50) }), { code: 'permission_denied' }, 'sin lms.course.manage');
});

test('permisos, scopes y aislamiento entre empresas', async () => {
  const { call, run } = fixture();
  await assert.rejects(() => call('query', 'lms_assessment_detail', { assessmentId: uid(11) }), { code: 'not_found' });
  await assert.rejects(() => call('prepare', 'lms.assessment.update', { assessmentId: uid(11), data: { title: 'Mía' } }), { code: 'not_found' });
  await assert.rejects(() => call('prepare', 'lms.assessment.activity.create', { assessmentId: uid(11), data: { type: 'written', title: 'X' } }), { code: 'not_found' });
  await assert.rejects(() => call('query', 'lms_assessments', {}, { companyId: OTHER }), { code: 'company_not_granted' });
  await assert.rejects(() => call('prepare', 'lms.assessment.create', { data: { title: 'X' } }, { scopes: ['lms:read'] }), { code: 'insufficient_scope' });
  const { result: mine } = await run('lms.assessment.create', { data: { title: 'Propia' } });
  assert.deepEqual((await call('query', 'lms_assessments', {})).result.items.map(item => item.id), [mine.id], 'no lista evaluaciones ajenas ni cursos');
  for (const limited of [fixture(['lms.access']), fixture(['lms.access', 'lms.enrollment.manage'])]) {
    await assert.rejects(() => limited.call('query', 'lms_assessments', {}), { code: 'permission_denied' });
    await assert.rejects(() => limited.call('prepare', 'lms.assessment.build', pvr()), { code: 'permission_denied' });
    await assert.rejects(() => limited.call('query', 'lms_assessment_results', { assessmentId: uid(11) }), { code: 'permission_denied' });
  }
  const participants = fixture(['lms.access', 'lms.enrollment.manage']);
  await assert.rejects(() => participants.call('query', 'lms_assessment_participants', { assessmentId: uid(11) }), { code: 'not_found' });
});

test('materiales: archivo inexistente rechazado y material ajeno no se toca', async () => {
  const { call, run, prisma } = fixture();
  const { result: built } = await run('lms.assessment.build', pvr());
  const activity = prisma.lmsLesson.rows.find(row => row.courseId === built.id && row.kind === 'assignment');
  await assert.rejects(() => call('prepare', 'lms.assessment.material.attach', { activityId: activity.id, fileId: uid(90) }), { code: 'not_found' });
  await assert.rejects(() => call('prepare', 'lms.assessment.material.remove', { resourceId: uid(91) }), { code: 'not_found' });
  prisma.lmsLessonResource.rows.push({ id: uid(92), companyId: OTHER, lessonId: uid(93), fileId: uid(94) });
  await assert.rejects(() => call('prepare', 'lms.assessment.material.remove', { resourceId: uid(92) }), { code: 'not_found' });
});
