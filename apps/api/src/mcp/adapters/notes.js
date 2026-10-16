import { createNotesService } from '../../routes/notes/notes-service.js';
import { createFoldersService } from '../../routes/notes/folders-service.js';
import { createTagsService } from '../../routes/notes/tags-service.js';
import { createNotesMiraiQueries } from '../../routes/notes/notes-mirai-queries.js';
import { createNotesMiraiActions } from '../../routes/notes/mirai-actions.js';
import { insist } from '../config.js';

export function createNotesAdapter({ prisma }) {
  const notesSvc = createNotesService({ prisma }), foldersSvc = createFoldersService({ prisma }), tagsSvc = createTagsService({ prisma });
  return { moduleKey: 'runly.notes', label: 'Notas',
    queries: [...createNotesMiraiQueries({ prisma, notesSvc }), ...[['notes_folders', foldersSvc, 'listFolders'], ['notes_tags', tagsSvc, 'listTags']].map(([name, service, method]) => ({ name, permission: 'notes.notes.read', definition: { description: name === 'notes_folders' ? 'Carpetas accesibles del usuario.' : 'Etiquetas del usuario.', parameters: { type: 'object', properties: {} } }, run: async (_args, a) => ({ items: await service[method]({ userId: a.actorProfileId, companyId: a.companyId }) }) }))],
    actions: createNotesMiraiActions({ prisma, notesSvc, foldersSvc, tagsSvc }).filter(a => ['notes.note.create', 'notes.note.rename_move'].includes(a.key)),
    async guard(definition, input, a) {
      if (!input.noteId) return;
      const access = await notesSvc.assertAccess(input.noteId, a.actorProfileId, definition.key ? 'edit' : 'read');
      insist(access.companyId === a.companyId || access.companyId === null, 'not_found', 'Nota no disponible.', 404);
    },
    revision: async (_definition, prepared, a) => prepared.targetId ? notesSvc.getNote(prepared.targetId, a.actorProfileId) : null,
    effects: ['Crear contenido inicial o editar título/carpeta. No reemplazar HTML existente ni estados Yjs.'],
  };
}
