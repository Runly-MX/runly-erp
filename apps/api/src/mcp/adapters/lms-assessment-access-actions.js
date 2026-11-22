// Public registration link and reviewer list of evaluations in the runly.lms MCP
// domain. Both reuse the REST services, so the reviewer rule (only managers edit
// the list) and the link normalizers apply unchanged. Invitations by email,
// grading and session administration stay in the app: mail is an external call
// and a one-time access code must not travel through the assistant.
import { z } from 'zod';
import { insist } from '../config.js';
import { normalizeAssessmentShareInput } from '../../routes/lms/lms-assessment-share-core.js';
import { fieldsOf } from './lms-common.js';
import { assessmentLink, userOf } from './lms-assessment-common.js';

const MANAGE = 'lms.course.manage';
const intakeField = z.strictObject({ key: z.string().max(40).optional(), label: z.string().max(80).optional(), type: z.string().max(20).optional(), required: z.boolean().optional() });
const member = z.strictObject({ userProfileId: z.uuid(), role: z.enum(['grader', 'reader']).describe('grader califica y ve resultados; reader solo consulta resultados.') });
const roleLabel = { grader: 'evaluador', reader: 'lector' };
const shareView = share => ({ enabled: share.enabled, url: share.url, path: share.path, published: share.published, accessMode: share.settings.accessMode, dedupeByEmail: share.settings.dedupeByEmail, intakeFields: share.settings.intakeFields.map(field => field.label), consentRequired: share.settings.consent.required });

export function createLmsAssessmentAccessActions({ prisma, share, admin, find }) {
  const members = async (a, id) => (await admin.listGraders(a.companyId, userOf(a), id)).map(row => ({ userProfileId: row.userProfileId, role: row.role, name: row.name }));
  const listText = rows => rows.length ? rows.map(row => `${row.name ?? row.userProfileId} (${roleLabel[row.role]})`).join(', ') : 'Sin lista: cualquiera con permiso de calificar o ver resultados';

  async function setList(a, assessmentId, next) {
    await admin.setGraders(a.companyId, userOf(a), assessmentId, { members: next.map(({ userProfileId, role }) => ({ userProfileId, role })) });
    return { assessmentId, members: await members(a, assessmentId), link: assessmentLink(assessmentId) };
  }

  return [
    { key: 'lms.assessment.share.update', permission: MANAGE, operation: 'update', label: 'Configurar registro público',
      description: 'Activar o desactivar el enlace público y configurar el registro: accessMode open|invite, dedupeByEmail, intakeFields (campos extra del formulario; el correo siempre se pide con dedupe) y consent {required, noticeText}. Los valores omitidos se conservan. El enlace real se obtiene con lms_assessment_share. Activarlo es sensible: requiere confirmación explícita.',
      inputSchema: z.strictObject({ assessmentId: z.uuid(), enabled: z.boolean().optional(), accessMode: z.enum(['open', 'invite']).optional(), dedupeByEmail: z.boolean().optional(),
        intakeFields: z.array(intakeField).max(20).optional(), consent: z.strictObject({ required: z.boolean().optional(), noticeText: z.string().max(4000).optional() }).optional() }),
      async prepare(input, a) {
        const before = await find.assessment(a, input.assessmentId);
        const { assessmentId, ...body } = input;
        const { enabled, settings } = normalizeAssessmentShareInput(body, before.shareSettings);
        const fields = { ...(enabled !== null ? { enlace: enabled ? 'activo' : 'desactivado' } : {}), accessMode: settings.accessMode, dedupeByEmail: settings.dedupeByEmail,
          formulario: settings.intakeFields.map(field => `${field.label}${field.required ? ' *' : ''}`).join(', '), aviso: settings.consent.noticeText ? `${settings.consent.required ? 'obligatorio' : 'opcional'}: ${settings.consent.noticeText}` : 'sin aviso' };
        const live = enabled && before.status !== 'published' ? [{ label: 'Nota', value: 'La evaluación sigue en borrador: el enlace no admitirá registros hasta publicarla.' }] : [];
        return { input, targetType: 'share', targetId: before.id, preview: { title: `Registro público de «${before.title}»`, fields: [...fieldsOf(fields), ...live] } };
      },
      async execute(input, a) { const { assessmentId, ...body } = input; return shareView(await share.updateShare(a.companyId, assessmentId, body)); } },

    { key: 'lms.assessment.share.rotate', permission: MANAGE, operation: 'update', label: 'Regenerar enlace público',
      description: 'Generar un enlace público nuevo: el anterior deja de funcionar de inmediato. Acción sensible.',
      inputSchema: z.strictObject({ assessmentId: z.uuid() }),
      async prepare(input, a) {
        const row = await find.assessment(a, input.assessmentId);
        insist(row.shareToken, 'invalid_request', 'La evaluación aún no tiene enlace: actívalo con lms.assessment.share.update.');
        return { input, targetType: 'share', targetId: row.id, preview: { title: `Regenerar enlace de «${row.title}»`, fields: [{ label: 'Efecto', value: 'El enlace actual deja de funcionar; quien lo tenga necesitará el nuevo.' }] } };
      },
      execute: async (input, a) => shareView(await share.rotateShare(a.companyId, input.assessmentId)) },

    { key: 'lms.assessment.grader.assign', permission: MANAGE, operation: 'update', label: 'Asignar evaluadores',
      description: 'Agregar o cambiar de rol a evaluadores/lectores de la evaluación (se combinan con la lista actual; solo personas activas de la empresa). Con lista, solo ellos revisan esta evaluación. Los permisos de la app no se modifican.',
      inputSchema: z.strictObject({ assessmentId: z.uuid(), members: z.array(member).min(1).max(50) }),
      async prepare(input, a) {
        const row = await find.assessment(a, input.assessmentId);
        const current = await members(a, row.id);
        const ids = [...new Set(input.members.map(item => item.userProfileId))];
        const active = await prisma.membership.findMany({ where: { companyId: a.companyId, userId: { in: ids }, enabled: true, user: { isBot: false } }, select: { userId: true } });
        insist(active.length === ids.length, 'invalid_request', 'Solo puedes asignar personas activas de tu empresa.');
        const next = new Map(current.map(item => [item.userProfileId, item]));
        for (const item of input.members) next.set(item.userProfileId, { ...next.get(item.userProfileId), ...item });
        insist(next.size <= 50, 'invalid_request', 'Máximo 50 personas por evaluación.');
        return { input: { assessmentId: row.id, members: input.members }, targetType: 'graders', targetId: row.id, preview: { title: `Evaluadores de «${row.title}»`, fields: [{ label: 'Lista', value: listText([...next.values()]), before: listText(current) }] } };
      },
      async execute(input, a) {
        const next = new Map((await members(a, input.assessmentId)).map(item => [item.userProfileId, item]));
        for (const item of input.members) next.set(item.userProfileId, item);
        return setList(a, input.assessmentId, [...next.values()]);
      } },

    { key: 'lms.assessment.grader.remove', permission: MANAGE, operation: 'update', label: 'Quitar evaluadores',
      description: 'Quitar personas de la lista de revisión. Si la lista queda vacía, vuelve a aplicar la regla general (cualquiera con permiso de calificar o ver resultados). Acción sensible.',
      inputSchema: z.strictObject({ assessmentId: z.uuid(), userProfileIds: z.array(z.uuid()).min(1).max(50) }),
      async prepare(input, a) {
        const row = await find.assessment(a, input.assessmentId);
        const current = await members(a, row.id);
        const missing = input.userProfileIds.filter(id => !current.some(item => item.userProfileId === id));
        insist(!missing.length, 'invalid_request', 'Alguna de las personas no está en la lista de la evaluación.');
        const next = current.filter(item => !input.userProfileIds.includes(item.userProfileId));
        return { input, targetType: 'graders', targetId: row.id, preview: { title: `Quitar evaluadores de «${row.title}»`, fields: [{ label: 'Lista', value: listText(next), before: listText(current) }] } };
      },
      async execute(input, a) { return setList(a, input.assessmentId, (await members(a, input.assessmentId)).filter(item => !input.userProfileIds.includes(item.userProfileId))); } },
  ];
}
