// apps/api/src/routes/projects/mirai-actions.js
//
// runly.projects (tasks) actions MirAI can propose (spec
// 2026-09-30-mirai-remaining-modules §3). prepare() resolves project/assignee
// names -> ids without writing; execute() goes through tasksSvc +
// projects-task-effects.js, exactly like the HTTP routes in projects-routes.js.
//
// Project-level access: the HTTP routes additionally gate every /tasks/*
// route behind requireProjectAccess(minRole) (projects-routes.js) on top of
// the company-wide RBAC permission. resolveProject()/loadTaskWithProject()
// below replicate that same OWNER/MEMBER/VIEWER rank check so a MirAI action
// can never act on a project the caller only has VIEWER access to, even
// though the action's declared `permission` is a company-wide grant.
import { z } from "zod";
import { actorContext } from "../calendar/calendar-event-effects.js";
import { createTimeService } from "./projects-time-service.js";
import { checkManualEntry, minutesText } from "./projects-time.js";

const LINK = (projectId, taskId) => `/app/m/runly.projects?open=task:${taskId ?? ""}&project=${projectId}`;
const PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW", "NONE"];
const PROJECT_ROLE_RANK = { VIEWER: 1, MEMBER: 2, OWNER: 3 };
const dayKey = (d) => (d ? (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)) : null); // eslint-disable-line no-restricted-syntax -- dueDate is a @db.Date (date-only)

const createArgs = z.object({
  project: z.string().trim().min(1),
  title: z.string().trim().min(1).max(200),
  assignee: z.string().trim().min(1).optional(),
  dueDate: z.string().optional(),
  priority: z.enum(PRIORITIES).optional(),
  description: z.string().trim().max(2000).optional(),
});
const updateArgs = z.object({
  taskId: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  status: z.string().trim().min(1).optional(),
  assignee: z.string().trim().min(1).optional(),
  dueDate: z.string().nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  estimateMinutes: z.number().int().min(0).max(100000).nullable().optional(),
});
const logTimeArgs = z.object({
  taskId: z.string().min(1),
  minutes: z.number().int().min(1).max(1440),
  date: z.string().optional(),
  note: z.string().trim().max(500).optional(),
});
const deleteArgs = z.object({ taskId: z.string().min(1) });

export function createProjectsMiraiActions({ prisma, projectsSvc, tasksSvc, effects }) {
  async function findProjectRole(actx, project) {
    if (project.ownerId === actx.actorProfileId) return "OWNER";
    const member = await prisma.projectMember.findFirst({ where: { projectId: project.id, userId: actx.actorProfileId }, select: { role: true } });
    return member?.role ?? null;
  }

  async function resolveProject(actx, name, minRole) {
    const projects = await projectsSvc.listProjects(actx.companyId, actx.actorProfileId);
    const q = name.trim().toLowerCase();
    const exact = projects.filter((p) => p.name.toLowerCase() === q);
    const matches = exact.length ? exact : projects.filter((p) => p.name.toLowerCase().includes(q));
    if (!matches.length) return { error: `No encontre el proyecto "${name}". Tus proyectos: ${projects.map((p) => p.name).join(", ") || "(ninguno)"}.` };
    if (matches.length > 1) return { error: `Hay varios proyectos que coinciden: ${matches.map((p) => p.name).join(", ")}.` };
    const project = matches[0];
    const role = await findProjectRole(actx, project);
    if (!role || (PROJECT_ROLE_RANK[role] ?? 0) < (PROJECT_ROLE_RANK[minRole] ?? 1)) {
      return { error: `No tienes acceso suficiente en el proyecto "${project.name}".` };
    }
    return { project, role };
  }

  async function loadTaskWithProject(actx, taskId, minRole) {
    const task = await prisma.task.findFirst({ where: { id: taskId }, include: { project: true, status: true, assignee: { select: { displayName: true } } } });
    if (!task) return { error: "No encontre esa tarea. Usa projects_list_tasks para obtener su taskId." };
    if (!task.project || task.project.companyId !== actx.companyId) return { error: "No encontre esa tarea. Usa projects_list_tasks para obtener su taskId." };
    const role = await findProjectRole(actx, task.project);
    if (!role || (PROJECT_ROLE_RANK[role] ?? 0) < (PROJECT_ROLE_RANK[minRole] ?? 1)) {
      return { error: `No tienes acceso suficiente en el proyecto "${task.project.name}".` };
    }
    return { task };
  }

  // Candidates are restricted to this project's members + owner — the same
  // pool tasksSvc.createTask/updateTask accept (validateTargets -> assertCandidates
  // re-checks this, and the company-wide read permission, at write time).
  async function projectMemberCandidates(projectId, ownerId) {
    const members = await prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { id: true, displayName: true, email: true } } },
    });
    const users = members.map((m) => m.user).filter(Boolean);
    if (ownerId && !users.some((u) => u.id === ownerId)) {
      const owner = await prisma.userProfile.findFirst({ where: { id: ownerId }, select: { id: true, displayName: true, email: true } });
      if (owner) users.push(owner);
    }
    return users;
  }

  async function resolveAssignee(projectId, ownerId, name) {
    const candidates = await projectMemberCandidates(projectId, ownerId);
    const q = name.trim().toLowerCase();
    const exact = candidates.filter((u) => u.displayName?.toLowerCase() === q || u.email?.toLowerCase() === q);
    const matches = exact.length ? exact : candidates.filter((u) => u.displayName?.toLowerCase().includes(q));
    if (matches.length === 1) return { user: matches[0] };
    if (!matches.length) return { error: `No encontre a "${name}" como miembro de este proyecto.` };
    return { error: `Hay varias personas que coinciden con "${name}": ${matches.map((u) => u.displayName).join(", ")}.` };
  }

  async function resolveStatus(projectId, name) {
    const statuses = await prisma.taskStatus.findMany({ where: { projectId } });
    const q = name.trim().toLowerCase();
    const exact = statuses.filter((s) => s.name.toLowerCase() === q);
    const matches = exact.length ? exact : statuses.filter((s) => s.name.toLowerCase().includes(q));
    if (matches.length === 1) return { status: matches[0] };
    if (!matches.length) return { error: `No encontre el estado "${name}". Estados del proyecto: ${statuses.map((s) => s.name).join(", ")}.` };
    return { error: `Hay varios estados que coinciden: ${matches.map((s) => s.name).join(", ")}.` };
  }

  const create = {
    key: "projects.task.create",
    moduleKey: "runly.projects",
    operation: "create",
    label: "Crear tarea",
    permission: "projects.task.create",
    description: "Crea una tarea en un proyecto del usuario (debe ser MEMBER u OWNER de ese proyecto). El proyecto se busca por nombre; sin estado indicado usa el estado por defecto del proyecto.",
    parameters: {
      type: "object",
      properties: {
        project: { type: "string", description: "Nombre del proyecto." },
        title: { type: "string" },
        assignee: { type: "string", description: "Nombre o correo de un miembro del proyecto (opcional)." },
        dueDate: { type: "string", description: "YYYY-MM-DD" },
        priority: { type: "string", enum: PRIORITIES },
        description: { type: "string" },
      },
      required: ["project", "title"],
    },
    async prepare(args, actx) {
      const parsed = createArgs.safeParse(args);
      if (!parsed.success) return { error: "Faltan datos: proyecto y titulo de la tarea." };
      const a = parsed.data;
      const found = await resolveProject(actx, a.project, "MEMBER");
      if (found.error) return { error: found.error };
      const { project } = found;
      const statuses = await prisma.taskStatus.findMany({ where: { projectId: project.id }, orderBy: { position: "asc" } });
      const defaultStatus = statuses.find((s) => s.isDefault) ?? statuses[0];
      if (!defaultStatus) return { error: `El proyecto "${project.name}" no tiene columnas/estados configurados.` };
      let assigneeId = null;
      let assigneeName = null;
      if (a.assignee) {
        const resolved = await resolveAssignee(project.id, project.ownerId, a.assignee);
        if (resolved.error) return { error: resolved.error };
        assigneeId = resolved.user.id;
        assigneeName = resolved.user.displayName;
      }
      return {
        input: {
          projectId: project.id,
          title: a.title,
          description: a.description ?? null,
          statusId: defaultStatus.id,
          assigneeId,
          priority: a.priority ?? "NONE",
          dueDate: a.dueDate ?? null,
        },
        preview: {
          title: "Crear tarea",
          fields: [
            { label: "Proyecto", value: project.name },
            { label: "Titulo", value: a.title },
            { label: "Estado", value: defaultStatus.name },
            a.priority ? { label: "Prioridad", value: a.priority } : null,
            assigneeName ? { label: "Asignado", value: assigneeName } : null,
            a.dueDate ? { label: "Vence", value: a.dueDate } : null,
            a.description ? { label: "Descripcion", value: a.description } : null,
          ].filter(Boolean),
        },
      };
    },
    async execute(input, actx) {
      const { projectId, ...data } = input;
      const task = await tasksSvc.createTask(projectId, actx.actorProfileId, data);
      await effects.afterCreate(actorContext({ companyId: actx.companyId, profile: actx.actorProfile }), task);
      return { id: task.id, summary: `Tarea creada: ${task.title}`, link: LINK(projectId, task.id) };
    },
  };

  const update = {
    key: "projects.task.update",
    moduleKey: "runly.projects",
    operation: "update",
    label: "Editar tarea",
    permission: "projects.task.update",
    description: "Cambia una tarea existente (titulo, estado, asignado, prioridad, fecha de vencimiento). Requiere el taskId de projects_list_tasks; envia solo los campos que cambian.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        title: { type: "string" },
        status: { type: "string", description: "Nombre del estado/columna destino." },
        assignee: { type: "string" },
        dueDate: { type: "string", description: "YYYY-MM-DD; cadena vacia para quitarla." },
        priority: { type: "string", enum: PRIORITIES },
        estimateMinutes: { type: "integer", description: "Estimacion de la tarea en minutos (0 = hito); null para quitarla." },
      },
      required: ["taskId"],
    },
    async prepare(args, actx) {
      const parsed = updateArgs.safeParse(args);
      if (!parsed.success) return { error: "Indica el taskId (de projects_list_tasks) y los campos a cambiar." };
      const a = parsed.data;
      const found = await loadTaskWithProject(actx, a.taskId, "MEMBER");
      if (found.error) return { error: found.error };
      const { task } = found;
      const data = {};
      const fields = [{ label: "Tarea", value: task.title }];

      if (a.title !== undefined && a.title !== task.title) {
        data.title = a.title;
        fields.push({ label: "Titulo", before: task.title, value: a.title });
      }
      if (a.status !== undefined) {
        const resolved = await resolveStatus(task.projectId, a.status);
        if (resolved.error) return { error: resolved.error };
        if (resolved.status.id !== task.statusId) {
          data.statusId = resolved.status.id;
          fields.push({ label: "Estado", before: task.status?.name ?? null, value: resolved.status.name });
        }
      }
      if (a.assignee !== undefined) {
        const resolved = await resolveAssignee(task.projectId, task.project?.ownerId, a.assignee);
        if (resolved.error) return { error: resolved.error };
        if (resolved.user.id !== task.assigneeId) {
          data.assigneeId = resolved.user.id;
          fields.push({ label: "Asignado", before: task.assignee?.displayName ?? "(sin asignar)", value: resolved.user.displayName });
        }
      }
      if (a.priority !== undefined && a.priority !== task.priority) {
        data.priority = a.priority;
        fields.push({ label: "Prioridad", before: task.priority, value: a.priority });
      }
      if (a.estimateMinutes !== undefined && a.estimateMinutes !== task.estimateMinutes) {
        data.estimateMinutes = a.estimateMinutes;
        fields.push({ label: "Estimacion", before: task.estimateMinutes == null ? "(sin estimar)" : minutesText(task.estimateMinutes), value: a.estimateMinutes == null ? "(sin estimar)" : minutesText(a.estimateMinutes) });
      }
      if (a.dueDate !== undefined) {
        const next = a.dueDate || null;
        if (next !== dayKey(task.dueDate)) {
          data.dueDate = next;
          fields.push({ label: "Vence", before: dayKey(task.dueDate) ?? "(sin fecha)", value: next ?? "(sin fecha)" });
        }
      }
      if (!Object.keys(data).length) return { error: "No indicaste ningun cambio respecto a la tarea actual." };
      return { input: { taskId: task.id, data }, targetId: task.id, preview: { title: "Editar tarea", fields } };
    },
    async execute(input, actx) {
      const previous = await prisma.task.findFirst({ where: { id: input.taskId }, select: { id: true, statusId: true, assigneeId: true, projectId: true } });
      const task = await tasksSvc.updateTask(input.taskId, input.data);
      await effects.afterUpdate(actorContext({ companyId: actx.companyId, profile: actx.actorProfile }), previous, task, input.data);
      return { id: task.id, summary: `Tarea actualizada: ${task.title}`, link: LINK(task.projectId, task.id) };
    },
  };

  const remove = {
    key: "projects.task.delete",
    moduleKey: "runly.projects",
    operation: "delete",
    label: "Eliminar tarea",
    permission: "projects.task.delete",
    description: "Elimina una tarea existente (y sus subtareas). Requiere el taskId de projects_list_tasks.",
    parameters: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"] },
    async prepare(args, actx) {
      const parsed = deleteArgs.safeParse(args);
      if (!parsed.success) return { error: "Indica el taskId (de projects_list_tasks)." };
      const found = await loadTaskWithProject(actx, parsed.data.taskId, "MEMBER");
      if (found.error) return { error: found.error };
      const { task } = found;
      return {
        input: { taskId: task.id },
        targetId: task.id,
        preview: {
          title: "Eliminar tarea",
          fields: [
            { label: "Tarea", value: task.title },
            { label: "Proyecto", value: task.project?.name ?? null },
            task.status?.name ? { label: "Estado", value: task.status.name } : null,
          ].filter(Boolean),
        },
      };
    },
    async execute(input, actx) {
      const task = await tasksSvc.deleteTask(input.taskId);
      await effects.afterDelete(actorContext({ companyId: actx.companyId, profile: actx.actorProfile }), task);
      return { id: input.taskId, summary: `Tarea eliminada: ${task.title}` };
    },
  };

  const timeSvc = createTimeService({ prisma });
  const logTime = {
    key: "projects.time.log",
    moduleKey: "runly.projects",
    operation: "create",
    label: "Registrar tiempo",
    permission: "projects.task.update",
    description: "Registra tiempo trabajado en una tarea (a nombre del usuario). Requiere el taskId de projects_list_tasks y los minutos (1 a 1440); la fecha es opcional (YYYY-MM-DD, por defecto ahora).",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        minutes: { type: "integer", description: "Minutos trabajados." },
        date: { type: "string", description: "YYYY-MM-DD (opcional)." },
        note: { type: "string" },
      },
      required: ["taskId", "minutes"],
    },
    async prepare(args, actx) {
      const parsed = logTimeArgs.safeParse(args);
      if (!parsed.success) return { error: "Indica el taskId (de projects_list_tasks) y los minutos (1 a 1440)." };
      const a = parsed.data;
      const found = await loadTaskWithProject(actx, a.taskId, "MEMBER");
      if (found.error) return { error: found.error };
      const startedAt = a.date ? `${a.date.slice(0, 10)}T12:00:00.000Z` : undefined;
      const checked = checkManualEntry({ minutes: a.minutes, startedAt });
      if (checked.error) return { error: checked.error };
      return {
        input: { taskId: found.task.id, minutes: a.minutes, startedAt, note: a.note ?? null },
        targetId: found.task.id,
        preview: {
          title: "Registrar tiempo",
          fields: [
            { label: "Tarea", value: found.task.title },
            { label: "Tiempo", value: minutesText(a.minutes) },
            a.date ? { label: "Fecha", value: a.date.slice(0, 10) } : null,
            a.note ? { label: "Nota", value: a.note } : null,
          ].filter(Boolean),
        },
      };
    },
    async execute(input, actx) {
      const entry = await timeSvc.addEntry({ companyId: actx.companyId, taskId: input.taskId, userId: actx.actorProfileId, minutes: input.minutes, startedAt: input.startedAt, note: input.note });
      const task = await prisma.task.findFirst({ where: { id: input.taskId }, select: { id: true, title: true, projectId: true } });
      return { id: entry.id, summary: `Tiempo registrado: ${minutesText(entry.minutes)} en ${task?.title ?? "la tarea"}`, link: LINK(task?.projectId, task?.id) };
    },
  };

  return [create, update, logTime, remove];
}
