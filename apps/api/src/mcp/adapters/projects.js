import { z } from 'zod';
import { createProjectsService } from '../../routes/projects/projects-service.js';
import { createTasksService } from '../../routes/projects/tasks-service.js';
import { createProjectsMiraiQueries } from '../../routes/projects/projects-mirai-queries.js';
import { createProjectsMiraiActions } from '../../routes/projects/mirai-actions.js';
import { createProjectsTaskEffects } from '../../routes/projects/projects-task-effects.js';
import { createProjectsCalendarBridge } from '../../routes/projects/projects-calendar-bridge.js';
import { createProjectsNotificationService } from '../../routes/projects/projects-notification-service.js';
import { insist } from '../config.js';
import { pageInput } from '../contracts.js';
import { createDependenciesService } from '../../routes/projects/projects-dependencies-service.js';

export function createProjectsAdapter({ prisma }) {
  const projectsSvc = createProjectsService({ prisma }), tasksSvc = createTasksService({ prisma });
  const bridge = createProjectsCalendarBridge({ prisma });
  const effects = createProjectsTaskEffects({ prisma, bridge, notifSvc: createProjectsNotificationService({ prisma }), awaitDatabaseEffects: true });
  const projectData = z.object({ name: z.string().trim().min(1).max(200), description: z.string().max(2000).optional(), color: z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(), icon: z.string().max(80).optional() }).strict();
  async function project(a, id, write = false) {
    const row = await projectsSvc.getProject(id, a.actorProfileId);
    insist(row.companyId === a.companyId, 'not_found', 'Proyecto no disponible.', 404);
    insist(!write || row.ownerId === a.actorProfileId || row.members.some(m => m.userId === a.actorProfileId && m.role === 'OWNER'), 'permission_denied', 'No tienes permiso para editar este proyecto.', 403);
    return row;
  }
  async function task(a, id) {
    const link = await prisma.task.findFirst({ where: { id, project: { companyId: a.companyId, OR: [{ ownerId: a.actorProfileId }, { members: { some: { userId: a.actorProfileId } } }] } }, select: { projectId: true } });
    insist(link, 'not_found', 'Tarea no disponible.', 404);
    await project(a, link.projectId);
    return tasksSvc.getTask(id, { projectId: link.projectId, companyId: a.companyId, actorId: a.actorProfileId });
  }
  const actions = ['create', 'update'].map(operation => ({ key: `projects.project.${operation}`, permission: `projects.project.${operation}`, operation, label: 'Guardar proyecto',
    inputSchema: z.object({ ...(operation === 'update' ? { projectId: z.uuid() } : {}), data: operation === 'create' ? projectData : projectData.partial() }).strict(),
    async prepare(input, a) {
      const previous = input.projectId ? await project(a, input.projectId, true) : null;
      if (!previous) insist(!(await projectsSvc.listProjects(a.companyId, a.actorProfileId)).some(p => p.name.toLowerCase() === input.data.name.toLowerCase()), 'duplicate_resource', 'Ya existe un proyecto accesible con ese nombre.', 409);
      return { input, targetId: input.projectId ?? null, preview: { title: 'Guardar proyecto', fields: [{ label: 'Datos del proyecto', value: JSON.stringify(input.data), ...(previous ? { before: JSON.stringify(previous) } : {}) }] } };
    },
    async execute(input, a) {
      const project = operation === 'create' ? await projectsSvc.createProject(a.companyId, a.actorProfileId, input.data) : await projectsSvc.updateProject(input.projectId, a.actorProfileId, input.data);
      await bridge.syncProjectCalendar(project);
      return project;
    },
  }));
  return { moduleKey: 'runly.projects', label: 'Proyectos',
    queries: [...createProjectsMiraiQueries({ prisma, projectsSvc }), { name: 'projects_detail', permission: 'projects.project.read', inputSchema: z.object({ projectId: z.uuid() }).strict(), definition: { description: 'Proyecto accesible, miembros, estados y permisos individuales.' }, run: async (input, a) => ({ project: await project(a, input.projectId) }) },
      { name: 'projects_page', permission: 'projects.project.read', inputSchema: z.object(pageInput).strict(), definition: { description: 'Proyectos accesibles con paginación.' }, async run(input, a) { const projects = await projectsSvc.listProjects(a.companyId, a.actorProfileId); return { items: projects.slice((input.page - 1) * input.limit, input.page * input.limit), total: projects.length, ...input }; } },
      { name: 'projects_task_detail', permission: 'projects.task.read', inputSchema: z.object({ taskId: z.uuid() }).strict(), definition: { description: 'Tarea accesible con responsables, fechas, dependencias y registros vinculados (tipo, id y etiqueta).' }, async run(input, a) { const row = await task(a, input.taskId); return { task: row, dependencies: await createDependenciesService({ prisma }).listDependencies(input.taskId, row.projectId), links: await prisma.taskLink.findMany({ where: { taskId: input.taskId }, select: { targetType: true, targetId: true, label: true } }) }; } }],
    actions: [...createProjectsMiraiActions({ prisma, projectsSvc, tasksSvc, effects }).filter(a => ['projects.task.create', 'projects.task.update', 'projects.time.log'].includes(a.key)), ...actions],
    async guard(_definition, input, a) {
      if (input.projectId) await project(a, input.projectId);
      if (input.taskId) {
        await task(a, input.taskId);
      }
    },
    revision: async (definition, prepared, a) => !prepared.targetId ? null : definition.key.includes('.project.') ? project(a, prepared.targetId) : task(a, prepared.targetId),
    // Assignments and changes can notify project members by email/web push.
    sensitive: true,
    effects: ['Guardar proyecto/tarea y sincronizar fechas con el calendario interno. Asignaciones y cambios pueden generar avisos a sus miembros en el ERP, correo y web push según sus preferencias.'],
  };
}
