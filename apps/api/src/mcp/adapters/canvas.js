import { createCanvasMiraiCapabilities } from '../../routes/canvas/mirai-capabilities.js';
import { createCanvasService } from '../../routes/canvas/canvas-service.js';
import { boardAccessWhere } from '../../routes/canvas/canvas-mirai-queries.js';
import { insist } from '../config.js';

export function createCanvasAdapter({ prisma }) {
  const service = createCanvasService({ prisma }), capability = createCanvasMiraiCapabilities({ prisma, service });
  return { moduleKey: capability.moduleKey, label: capability.label, queries: capability.tools, actions: capability.actions.map(action => action.key !== 'canvas.hotspot.update' ? action : { ...action, async prepare(input, a) { const prepared = await action.prepare(input, a); return prepared.error ? prepared : { ...prepared, targetId: prepared.input.hotspotId }; } }),
    async guard(definition, input, a) {
      if (!definition.key || !input.hotspotId) return;
      const hotspot = await prisma.canvasHotspot.findFirst({ where: { id: input.hotspotId, archivedAt: null, board: boardAccessWhere(a) }, select: { boardId: true } });
      insist(hotspot, 'not_found', 'Recurso no disponible.', 404);
      await service.assertBoardAccess(a.companyId, a.actorProfileId, hotspot.boardId, 'EDITOR');
    },
    revision: async (_definition, prepared, a) => prepared.targetId ? prisma.canvasHotspot.findFirst({ where: { id: prepared.targetId, board: boardAccessWhere(a) } }) : null,
    sensitive: false,
    effects: ['Crear Board o cambiar metadatos de un hotspot autorizado. No reemplazar la escena colaborativa.'],
  };
}
