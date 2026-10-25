// apps/api/src/routes/projects/projects-mirai-load-queries.js
//
// Read tools of the workload and time tracking of runly.projects (spec
// 2026-10-26-projects-depth-design §4): who is loaded when, and how much time was
// logged. Exact numbers come from the same services as the screens.
import { createOverviewService } from "./projects-overview-service.js";
import { createTimeService } from "./projects-time-service.js";
import { minutesText } from "./projects-time.js";

const nameOf = (u) => u?.displayName || [u?.firstName, u?.lastName].filter(Boolean).join(" ") || "(sin nombre)";

// One of the caller's projects by name, with the caller's role in it.
async function findProject(projectsSvc, actx, name) {
  const projects = await projectsSvc.listProjects(actx.companyId, actx.actorProfileId);
  const q = name.trim().toLowerCase();
  const exact = projects.filter((p) => p.name.toLowerCase() === q);
  const matches = exact.length ? exact : projects.filter((p) => p.name.toLowerCase().includes(q));
  if (!matches.length) return { error: `No encontre el proyecto "${name}". Tus proyectos: ${projects.map((p) => p.name).join(", ") || "(ninguno)"}.` };
  if (matches.length > 1) return { error: `Hay varios proyectos que coinciden: ${matches.map((p) => p.name).join(", ")}.` };
  const project = matches[0];
  const mine = (project.members ?? []).find((m) => m.userId === actx.actorProfileId);
  return { project, role: project.ownerId === actx.actorProfileId || mine?.role === "OWNER" ? "OWNER" : "MEMBER" };
}

export function createProjectsMiraiLoadQueries({ prisma, projectsSvc }) {
  const resolveProject = (actx, name) => findProject(projectsSvc, actx, name);
  const overviewSvc = createOverviewService({ prisma });
  const timeSvc = createTimeService({ prisma });

  const projects_workload = {
    name: "projects_workload",
    permission: "projects.task.read",
    definition: {
      description: "Carga de trabajo de un proyecto: por persona y semana, las horas planeadas (estimaciones de tareas abiertas repartidas entre sus fechas, lunes a viernes) contra su capacidad semanal, y las tareas sin fecha o sin estimacion. Usala para saber quien esta saturado o libre.",
      parameters: {
        type: "object",
        properties: {
          project: { type: "string", description: "Nombre del proyecto." },
          from: { type: "string", description: "YYYY-MM-DD (opcional; por defecto la semana actual)." },
          to: { type: "string", description: "YYYY-MM-DD (opcional; por defecto 6 semanas)." },
        },
        required: ["project"],
      },
    },
    async run(args, actx) {
      const found = await resolveProject(actx, String(args?.project ?? ""));
      if (found.error) return { error: found.error };
      const data = await overviewSvc.workload({ projectId: found.project.id, from: args?.from, to: args?.to });
      return {
        proyecto: found.project.name,
        semanas: data.weeks,
        personas: data.people.map((p) => ({
          persona: nameOf(p.user),
          capacidadSemanal: minutesText(p.capacity),
          semanas: data.weeks.map((w) => ({ semana: w, planeado: minutesText(p.byWeek[w] ?? 0), porcentaje: Math.round(((p.byWeek[w] ?? 0) / p.capacity) * 100) })),
          tareasSinFechaOEstimacion: p.unscheduled.map((id) => data.tasks[id]?.title).filter(Boolean),
        })),
      };
    },
  };

  const projects_time_summary = {
    name: "projects_time_summary",
    permission: "projects.task.read",
    definition: {
      description: "Tiempo registrado en un proyecto: total, por persona, por semana y contra lo estimado. Los dueños del proyecto ven el de todos; los demas solo el propio.",
      parameters: { type: "object", properties: { project: { type: "string", description: "Nombre del proyecto." } }, required: ["project"] },
    },
    async run(args, actx) {
      const found = await resolveProject(actx, String(args?.project ?? ""));
      if (found.error) return { error: found.error };
      const canSeeAll = found.role === "OWNER";
      const [summary, estimated] = await Promise.all([
        timeSvc.projectSummary({ companyId: actx.companyId, projectId: found.project.id, userId: actx.actorProfileId, canSeeAll }),
        prisma.task.aggregate({ where: { projectId: found.project.id }, _sum: { estimateMinutes: true } }),
      ]);
      const users = await prisma.userProfile.findMany({ where: { id: { in: Object.keys(summary.byUser) } }, select: { id: true, displayName: true, firstName: true, lastName: true } });
      const userById = new Map(users.map((u) => [u.id, u]));
      return {
        proyecto: found.project.name,
        alcance: canSeeAll ? "todas las personas" : "solo tu tiempo",
        total: minutesText(summary.total),
        estimado: minutesText(estimated._sum.estimateMinutes ?? 0),
        porPersona: Object.entries(summary.byUser).map(([id, minutes]) => ({ persona: nameOf(userById.get(id)), tiempo: minutesText(minutes) })),
        porSemana: Object.entries(summary.byWeek).sort(([a], [b]) => a.localeCompare(b)).map(([semana, minutes]) => ({ semana, tiempo: minutesText(minutes) })),
      };
    },
  };

  return [projects_workload, projects_time_summary];
}
