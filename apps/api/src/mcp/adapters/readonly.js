import { z } from 'zod';
import { createFilesService } from '../../services/files-service.js';
import { createUserAccessService } from '../../services/user-access-service.js';
import { createActivityService } from '../../services/activity-service.js';
import { createChatService } from '../../routes/chat/chat-service.js';
import { pageInput } from '../contracts.js';
import { insist } from '../config.js';
import { attachmentTargetSchema, createAttachmentTargets } from '../attachment-targets.js';

const fileSummary = file => ({ id: file.id, name: file.originalName, mimeType: file.mimeType, sizeBytes: Number(file.sizeBytes), moduleKey: file.moduleKey, entityType: file.entityType, createdAt: file.createdAt, updatedAt: file.updatedAt, link: `/app/m/runly.files?fileId=${file.id}` });
function filesAdapter({ prisma }, documents) {
  const service = createFilesService({ prisma }), targets = createAttachmentTargets({ prisma });
  const domain = documents ? 'documents' : 'files';
  const context = a => ({ authUserId: a.actorAuthUserId, activeContext: { companyId: a.companyId, profileId: a.actorProfileId, isAdmin: a.isAdmin, permissionSet: a.permissionSet } });
  return { moduleKey: `runly.${domain}`, label: documents ? 'Documentos' : 'Archivos', actions: [], queries: [
    ...(!documents ? [
      { name: 'files_attachment_targets', permission: 'files.assets.read', definition: { description: 'Destinos soportados para adjuntos en los módulos instalados y autorizados: native aparece en su panel; private-reference queda como referencia privada en Archivos, sin modificar el registro. Cada carga exige files:write y los scopes/permisos del destino.' }, inputSchema: z.strictObject({}), run: async (_input, a) => ({ targets: await targets.catalog(a) }) },
      { name: 'files_record_attachments', permission: 'files.assets.read', definition: { description: 'Listar metadatos de adjuntos nativos o referencias privadas de un registro autorizado. Revalida permisos individuales y consentimiento del módulo. No descarga contenido ni genera URLs firmadas.' }, inputSchema: z.strictObject({ ...pageInput, target: attachmentTargetSchema }), run: (input, a) => targets.list(input.target, a, input) },
    ] : []),
    { name: `${domain}_search`, permission: 'files.assets.read', definition: { description: 'Buscar metadatos de archivos autorizados; sin URLs firmadas ni claves de almacenamiento.' }, inputSchema: z.object({ ...pageInput, search: z.string().max(200).optional() }).strict(),
      async run(input, a) {
        const result = await service.list({ ...context(a), query: { page: input.page, pageSize: input.limit, q: input.search, ...(documents ? { workspace: 'documents' } : {}) }, includeSignedUrls: false });
        return { items: result.data.map(fileSummary), pagination: result.pagination };
      } },
    { name: `${domain}_metadata`, permission: 'files.assets.read', definition: { description: 'Metadatos de un archivo con acceso individual revalidado.' }, inputSchema: z.object({ fileId: z.uuid() }).strict(),
      async run(input, a) {
        const file = await service.getById({ ...context(a), id: input.fileId });
        insist(!documents || file.entityType === 'AtlasFile' && [null, 'runly.files', 'atlas.files'].includes(file.moduleKey), 'not_found', 'Documento no disponible.', 404);
        return { file: fileSummary(file) };
      } },
  ] };
}
export const createFilesAdapter = dependencies => filesAdapter(dependencies, false);
export const createDocumentsAdapter = dependencies => filesAdapter(dependencies, true);

export function createIdentityAdapter({ prisma }) {
  const service = createUserAccessService({ prisma });
  return { moduleKey: 'runly.identity', label: 'Identidad', actions: [], queries: [{ name: 'identity_candidates', permission: 'identity.users.read', definition: { description: 'Buscar perfiles activos de la empresa para resolver referencias por ID. No crea usuarios ni concede roles.' },
    inputSchema: z.object({ search: z.string().max(100).optional(), limit: z.number().int().min(1).max(50).default(30) }).strict(),
    run: async (input, a) => ({ users: await service.listCandidates({ companyId: a.companyId, actorId: a.actorProfileId, ...input }) }),
  }] };
}

export function createActivityAdapter({ prisma }) {
  const service = createActivityService({ prisma });
  return { moduleKey: 'runly.activity', label: 'Mi actividad', actions: [], queries: [{ name: 'activity_mine', permission: 'activity.read', definition: { description: 'Historial propio en la empresa autorizada; excluye la actividad de otras personas.' },
    inputSchema: z.object({ ...pageInput, search: z.string().max(200).optional() }).strict(),
    run: async (input, a) => service.list({ authUserId: a.actorAuthUserId, companyId: a.companyId, query: { page: input.page, pageSize: input.limit, actorId: a.actorProfileId, q: input.search } }),
  }] };
}

export function createChatAdapter({ prisma }) {
  const service = createChatService({ prisma, includeAvatarUrls: false });
  return { moduleKey: 'runly.chat', label: 'Mis conversaciones', actions: [], queries: [{ name: 'chat_my_conversations', permission: 'chat.conversations.read', definition: { description: 'Solo metadatos de conversaciones donde participas. No lee mensajes ni envía contenido.' },
    inputSchema: z.object({ limit: z.number().int().min(1).max(30).default(20), cursor: z.iso.datetime().optional() }).strict(),
    async run(input, a) {
      const result = await service.listConversations({ authUserId: a.actorAuthUserId, companyId: a.companyId, ...input, restrictCompany: true });
      const scoped = result.data.filter(c => c.company_id === a.companyId);
      return { conversations: scoped.map(c => ({ id: c.id, title: c.title, type: c.type, lastMessageAt: c.last_message_at, link: `/app/m/runly.chat?conversation=${c.id}` })), nextCursor: scoped.length === result.data.length ? result.nextCursor ?? null : null };
    },
  }] };
}
