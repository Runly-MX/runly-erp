import { z } from 'zod';
import { createProjectsService } from '../../routes/projects/projects-service.js';
import { createTasksService } from '../../routes/projects/tasks-service.js';
import { createProjectsMiraiQueries } from '../../routes/projects/projects-mirai-queries.js';
import { createProjectsMiraiActions } from '../../routes/projects/mirai-actions.js';
import { createProjectsTaskEffects } from '../../routes/projects/projects-task-effects.js';
import { createProjectsCalendarBridge } from '../../routes/projects/projects-calendar-bridge.js';
import { createProjectsNotificationService } from '../../routes/projects/projects-notification-service.js';
import { insist } from '../config.js';

export function createProjectsAdapter({ prisma }) {
  const projectsSvc = createProjectsService({ prisma }), tasksSvc = createTasksService({ prisma });
  const effects = createProjectsTaskEffects({ prisma, bridge: createProjectsCalendarBridge({ prisma }), notifSvc: createProjectsNotificationService({ prisma }) });
  const projectData = z.object({ name: z.string().trim().min(1).max(200), description: z.string().max(2000).optional(), color: z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(), icon: z.string().max(80).optional() }).strict();
  async function project(a, id, write = false) {
    const row = await projectsSvc.getProject(id, a.actorProfileId);
    insist(row.companyId === a.companyId, 'not_found', 'Proyecto no disponible.', 404);
    insist(!write || row.ownerId === a.actorProfileId || row.members.some(m => m.userId === a.actorProfileId && m.role === 'OWNER'), 'permission_denied', 'No tienes permiso para editar este proyecto.', 403);
    return row;
  }
  const actions = ['create', 'update'].map(operation => ({ key: `projects.project.${operation}`, permission: `projects.project.${operation}`, operation, label: 'Guardar proyecto',
    inputSchema: z.object({ ...(operation === 'update' ? { projectId: z.uuid() } : {}), data: operation === 'create' ? projectData : projectData.partial() }).strict(),
    async prepare(input, a) {
      const previous = input.projectId ? await project(a, input.projectId, true) : null;
      if (!previous) insist(!(await projectsSvc.listProjects(a.companyId, a.actorProfileId)).some(p => p.name.toLowerCase() === input.data.name.toLowerCase()), 'duplicate_resource', 'Ya existe un proyecto accesible con ese nombre.', 409);
      return { input, targetId: input.projectId ?? null, preview: { title: 'Guardar proyecto', fields: [{ label: 'Datos del proyecto', value: JSON.stringify(input.data), ...(previous ? { before: JSON.stringify(previous) } : {}) }] } };
    },
    execute: async (input, a) => operation === 'create' ? projectsSvc.createProject(a.companyId, a.actorProfileId, input.data) : projectsSvc.updateProject(input.projectId, a.actorProfileId, input.data),
  }));
  return { moduleKey: 'runly.projects', label: 'Proyectos',
    queries: [...createProjectsMiraiQueries({ prisma, projectsSvc }), { name: 'projects_detail', permission: 'projects.project.read', inputSchema: z.object({ projectId: z.uuid() }).strict(), definition: { description: 'Proyecto accesible, miembros, estados y permisos individuales.' }, run: async (input, a) => ({ project: await project(a, input.projectId) }) }],
    actions: [...createProjectsMiraiActions({ prisma, projectsSvc, tasksSvc, effects }).filter(a => ['projects.task.create', 'projects.task.update'].includes(a.key)), ...actions],
    async guard(_definition, input, a) {
      if (input.projectId) await project(a, input.projectId);
      if (input.taskId) {
        const task = await tasksSvc.getTask(input.taskId, { companyId: a.companyId, actorId: a.actorProfileId });
        await project(a, task.projectId);
      }
    },
    revision: async (definition, prepared, a) => !prepared.targetId ? null : definition.key.includes('.project.') ? project(a, prepared.targetId) : tasksSvc.getTask(prepared.targetId, { companyId: a.companyId, actorId: a.actorProfileId }),
    effects: ['Guardar proyecto/tarea; asignaciones y avisos internos a sus miembros; sincronización interna de fechas con calendario.'],
  };
}
