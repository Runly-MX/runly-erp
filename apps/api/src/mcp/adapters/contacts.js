import { createContactsMiraiCapabilities } from '../../routes/contacts/mirai-capabilities.js';
import { createContactsService } from '../../services/contacts-service.js';

export function createContactsAdapter({ prisma }) {
  const capability = createContactsMiraiCapabilities({ prisma }), service = createContactsService({ prisma });
  return { moduleKey: capability.moduleKey, label: capability.label, queries: capability.tools.filter(tool => !tool.name.includes('_public_')),
    actions: capability.actions.filter(action => ['contacts.contact.create', 'contacts.contact.update'].includes(action.key)),
    revision: async (_definition, prepared, a) => prepared.targetId ? service.getById({ companyId: a.companyId, id: prepared.targetId }) : null,
    effects: ['Crear o editar el contacto y sus datos; registrar actividad interna. Sin mensajes ni invitaciones.'],
  };
}
