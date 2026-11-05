// Per-record folders inside the per-module folders of the runly.files explorer.
// Attachments group by the record they belong to (metadata.sourceEntityId);
// task attachments group under their project, and every project the caller
// belongs to gets a folder as soon as it exists, even before it holds files.
import { FilesServiceError } from "../files-service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// shortcut: groups are tallied from at most this many attachments of one module; move to SQL if a module outgrows it.
const MAX_SCAN = 5000;
const PROJECTS_MODULE = "runly.projects";

const person = (r) => `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim();
const pairs = (rows, label) => rows.map((r) => [r.id, label(r)]);

// entityType -> [id, label] pairs of its records in the company.
const LABELS = {
  Project: (db, companyId, ids) => db.project.findMany({ where: { id: { in: ids }, companyId }, select: { id: true, name: true } }).then((r) => pairs(r, (x) => x.name)),
  HrEmployee: (db, companyId, ids) =>
    db.hrEmployee.findMany({ where: { id: { in: ids }, companyId }, select: { id: true, firstName: true, lastName: true } }).then((r) => pairs(r, person)),
  FleetDriver: (db, companyId, ids) =>
    db.fleetDriver.findMany({ where: { id: { in: ids }, companyId }, select: { id: true, firstName: true, lastName: true } }).then((r) => pairs(r, person)),
  FleetVehicle: (db, companyId, ids) => db.fleetVehicle.findMany({ where: { id: { in: ids }, companyId }, select: { id: true, plate: true } }).then((r) => pairs(r, (x) => x.plate)),
  Contact: (db, companyId, ids) => db.contact.findMany({ where: { id: { in: ids }, companyId }, select: { id: true, name: true } }).then((r) => pairs(r, (x) => x.name)),
  InvItem: (db, companyId, ids) =>
    db.invItem.findMany({ where: { id: { in: ids }, companyId }, select: { id: true, name: true, assetTag: true } }).then((r) => pairs(r, (x) => (x.assetTag ? `${x.assetTag} · ${x.name}` : x.name))),
  CanvasBoard: (db, companyId, ids) => db.canvasBoard.findMany({ where: { id: { in: ids }, companyId }, select: { id: true, name: true } }).then((r) => pairs(r, (x) => x.name)),
  GrowthLead: (db, companyId, ids) => db.growthLead.findMany({ where: { id: { in: ids }, companyId }, select: { id: true, name: true } }).then((r) => pairs(r, (x) => x.name || "Prospecto")),
};

const projectMemberWhere = (profileId) => ({ OR: [{ ownerId: profileId }, { members: { some: { userId: profileId } } }] });

export function visibleProjectsWhere(context) {
  return { companyId: context.companyId, kind: { not: "PERSONAL" }, ...(context.admin ? {} : projectMemberWhere(context.profileId)) };
}

// -> [{ record: "Type:id", label, count }] for one module, sorted by label.
// `readable` is the caller's file visibility fragment.
export async function recordGroups(prisma, context, moduleKey, readable) {
  const rows = await prisma.fileAsset.findMany({
    where: { entityId: context.companyId, enabled: true, moduleKey, AND: [readable] },
    select: { entityType: true, metadata: true },
    take: MAX_SCAN,
  });
  const counts = new Map();
  const bump = (type, id, n = 1) => counts.set(`${type}:${id}`, (counts.get(`${type}:${id}`) ?? 0) + n);
  const taskCounts = new Map();
  for (const row of rows) {
    const id = row.metadata?.sourceEntityId;
    if (!UUID.test(String(id ?? ""))) continue;
    if (row.entityType === "Task") taskCounts.set(id, (taskCounts.get(id) ?? 0) + 1);
    else if (LABELS[row.entityType]) bump(row.entityType, id);
  }
  if (taskCounts.size) {
    const tasks = await prisma.task.findMany({ where: { id: { in: [...taskCounts.keys()] }, project: { companyId: context.companyId } }, select: { id: true, projectId: true } });
    for (const t of tasks) bump("Project", t.projectId, taskCounts.get(t.id));
  }
  if (moduleKey === PROJECTS_MODULE) {
    const projects = await prisma.project.findMany({ where: visibleProjectsWhere(context), select: { id: true } });
    for (const p of projects) bump("Project", p.id, 0);
  }
  const idsByType = new Map();
  for (const key of counts.keys()) {
    const [type, id] = key.split(":");
    idsByType.set(type, [...(idsByType.get(type) ?? []), id]);
  }
  const labels = new Map();
  await Promise.all(
    [...idsByType].map(async ([type, ids]) => {
      for (const [id, label] of await LABELS[type](prisma, context.companyId, ids)) labels.set(`${type}:${id}`, label);
    }),
  );
  // Records that no longer exist keep their files in the module's flat list.
  return [...counts]
    .filter(([key]) => labels.has(key))
    .map(([record, count]) => ({ record, label: labels.get(record), count }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

// Prisma `where` on file_asset for one per-record folder ("Project:<id>").
export async function recordFilesWhere(prisma, companyId, record) {
  const [type, id] = String(record).split(":");
  if (!LABELS[type] || !UUID.test(String(id ?? ""))) throw new FilesServiceError("Carpeta no válida.", 400);
  if (type !== "Project") return { entityType: type, metadata: { path: ["sourceEntityId"], equals: id } };
  const tasks = await prisma.task.findMany({ where: { projectId: id, project: { companyId } }, select: { id: true } });
  if (!tasks.length) return { id: { in: [] } };
  return { entityType: "Task", OR: tasks.map((t) => ({ metadata: { path: ["sourceEntityId"], equals: t.id } })) };
}
