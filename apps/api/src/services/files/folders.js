// Folders of the runly.files explorer: a company-scoped tree of containers for
// files-origin documents. Module attachments are not filed into folders; the
// explorer shows them as virtual per-module folders (groupBy moduleKey).
// Folder visibility: admins see everything, others see COMPANY folders and
// their own PRIVATE ones. A folder's public link (module_public_link,
// resourceKey folder.share) exposes the enabled files of its whole subtree.
import crypto from "node:crypto";
import { linkStatus } from "../module-public-links-service.js";
import { FilesServiceError } from "../files-service.js";
import { FILES_LINK_MODULE, FILE_LINK_MODES, serializeFileLink } from "./public-links.js";
import { FILES_ORIGIN_MODULES } from "./visibility.js";

export const FOLDER_LINK_RESOURCE = "folder.share";
export const FOLDER_SCOPES = ["PRIVATE", "COMPANY"];
const MAX_DEPTH = 8;
const MAX_FOLDERS_PER_COMPANY = 2000;
const MAX_LINKS_PER_FOLDER = 20;
const MOVE_MAX_FILES = 200;

function cleanName(value) {
  const name = String(value ?? "").trim();
  if (!name || name.length > 120 || /[\x00-\x1f\\/]/.test(name)) {
    throw new FilesServiceError("El nombre de la carpeta no es válido (1 a 120 caracteres, sin barras).", 400);
  }
  return name;
}

export function createFilesFolders({ prisma, filesService }) {
  const can = (context, key) => context.admin || context.permissions?.has(key);
  const need = (context, key) => {
    if (!can(context, key)) throw new FilesServiceError("No tienes permiso para realizar esta acción.", 403);
  };

  async function contextFor(authUserId, activeContext) {
    const context = await filesService.getUserCompanyContext(authUserId, activeContext);
    need(context, "files.assets.read");
    return context;
  }

  const visibleWhere = (context) =>
    context.admin ? { companyId: context.companyId } : { companyId: context.companyId, OR: [{ scope: "COMPANY" }, { createdById: context.profileId }] };

  async function visibleFolder(context, id) {
    const folder = id ? await prisma.fileFolder.findFirst({ where: { id, ...visibleWhere(context) } }) : null;
    if (!folder) throw new FilesServiceError("Carpeta no encontrada.", 404);
    return folder;
  }

  async function manageableFolder(context, id) {
    const folder = await visibleFolder(context, id);
    if (!context.admin && folder.createdById !== context.profileId) {
      throw new FilesServiceError("Solo quien creó la carpeta o un administrador puede modificarla.", 403);
    }
    return folder;
  }

  // Ancestor chain (root first) of a folder, bounded to survive bad data.
  async function chain(companyId, folderId) {
    const all = await prisma.fileFolder.findMany({ where: { companyId }, select: { id: true, parentId: true, name: true, scope: true } });
    const byId = new Map(all.map((f) => [f.id, f]));
    const path = [];
    let cursor = byId.get(folderId);
    while (cursor && path.length <= MAX_DEPTH + 1) {
      path.unshift(cursor);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
    }
    return { path, byId, all };
  }

  function descendantIds(all, rootId) {
    const children = new Map();
    for (const f of all) children.set(f.parentId, [...(children.get(f.parentId) ?? []), f.id]);
    const out = [];
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop();
      out.push(id);
      for (const child of children.get(id) ?? []) stack.push(child);
    }
    return out;
  }

  async function assertNameFree(companyId, parentId, name, exceptId = null) {
    const clash = await prisma.fileFolder.findFirst({
      where: { companyId, parentId: parentId ?? null, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new FilesServiceError("Ya existe una carpeta con ese nombre aquí.", 409);
  }

  async function audit(context, folderId, action, metadata = {}) {
    await prisma.auditLog.create({
      data: { companyId: context.companyId, actorId: context.profileId, moduleKey: FILES_LINK_MODULE, entityType: "FileFolder", entityId: folderId, action, metadata },
    });
  }

  const serialize = (f) => ({ id: f.id, parentId: f.parentId, name: f.name, scope: f.scope, createdById: f.createdById, createdAt: f.createdAt, updatedAt: f.updatedAt });

  // Tree for the sidebar: every visible folder plus how many files-origin
  // files each holds, and the per-module virtual folders with their counts.
  async function tree({ authUserId, activeContext }) {
    const context = await contextFor(authUserId, activeContext);
    const folders = await prisma.fileFolder.findMany({ where: visibleWhere(context), orderBy: { name: "asc" } });
    const filesOrigin = { entityType: "AtlasFile", OR: [{ moduleKey: null }, { moduleKey: { in: FILES_ORIGIN_MODULES } }] };
    const readable = await filesService.visibility.listWhere(context);
    const [perFolder, perModule] = await Promise.all([
      prisma.fileAsset.groupBy({ by: ["folderId"], where: { entityId: context.companyId, enabled: true, folderId: { not: null }, AND: [readable] }, _count: { _all: true } }),
      prisma.fileAsset.groupBy({
        by: ["moduleKey"],
        where: { entityId: context.companyId, enabled: true, entityType: { not: "CanvasThumbnail" }, AND: [readable, { NOT: filesOrigin }] },
        _count: { _all: true },
      }),
    ]);
    const counts = new Map(perFolder.map((r) => [r.folderId, r._count._all]));
    return {
      folders: folders.map((f) => ({ ...serialize(f), fileCount: counts.get(f.id) ?? 0 })),
      modules: perModule.filter((r) => r.moduleKey).map((r) => ({ moduleKey: r.moduleKey, count: r._count._all })),
    };
  }

  async function create({ authUserId, activeContext, name, parentId = null, scope = "PRIVATE" }) {
    const context = await contextFor(authUserId, activeContext);
    need(context, "files.assets.create");
    if (!FOLDER_SCOPES.includes(scope)) throw new FilesServiceError("Alcance no válido.", 400);
    const clean = cleanName(name);
    let depth = 1;
    let effectiveScope = scope;
    if (parentId) {
      const parent = await visibleFolder(context, parentId);
      depth = (await chain(context.companyId, parent.id)).path.length + 1;
      // A subfolder of a shared folder is shared too: it lives inside it.
      if (parent.scope === "COMPANY") effectiveScope = "COMPANY";
    }
    if (depth > MAX_DEPTH) throw new FilesServiceError(`Máximo ${MAX_DEPTH} niveles de carpetas.`, 400);
    if ((await prisma.fileFolder.count({ where: { companyId: context.companyId } })) >= MAX_FOLDERS_PER_COMPANY) {
      throw new FilesServiceError("Alcanzaste el máximo de carpetas.", 409);
    }
    await assertNameFree(context.companyId, parentId, clean);
    const folder = await prisma.fileFolder.create({
      data: { companyId: context.companyId, parentId, name: clean, scope: effectiveScope, createdById: context.profileId },
    });
    await audit(context, folder.id, "files.folder.create", { name: clean, parentId });
    return { ...serialize(folder), fileCount: 0 };
  }

  async function update({ authUserId, activeContext, id, name, scope, parentId }) {
    const context = await contextFor(authUserId, activeContext);
    need(context, "files.assets.update");
    const folder = await manageableFolder(context, id);
    const data = {};
    if (name !== undefined) {
      data.name = cleanName(name);
    }
    if (scope !== undefined) {
      if (!FOLDER_SCOPES.includes(scope)) throw new FilesServiceError("Alcance no válido.", 400);
      data.scope = scope;
    }
    if (parentId !== undefined && parentId !== folder.parentId) {
      const { all } = await chain(context.companyId, folder.id);
      if (parentId) {
        if (descendantIds(all, folder.id).includes(parentId)) throw new FilesServiceError("No puedes mover una carpeta dentro de sí misma.", 400);
        const target = await visibleFolder(context, parentId);
        const depth = (await chain(context.companyId, target.id)).path.length + 1;
        if (depth > MAX_DEPTH) throw new FilesServiceError(`Máximo ${MAX_DEPTH} niveles de carpetas.`, 400);
      }
      data.parentId = parentId;
    }
    if (!Object.keys(data).length) return serialize(folder);
    await assertNameFree(context.companyId, data.parentId !== undefined ? data.parentId : folder.parentId, data.name ?? folder.name, folder.id);
    const updated = await prisma.$transaction(async (db) => {
      const row = await db.fileFolder.update({ where: { id: folder.id }, data });
      // Sharing a folder with the company shares the folders inside it; its
      // files keep their own access.
      if (data.scope === "COMPANY") {
        const { all } = await chain(context.companyId, folder.id);
        await db.fileFolder.updateMany({ where: { id: { in: descendantIds(all, folder.id) } }, data: { scope: "COMPANY" } });
      }
      return row;
    });
    await audit(context, folder.id, "files.folder.update", data);
    return serialize(updated);
  }

  // Deleting a folder never deletes files: contents move up to its parent.
  async function remove({ authUserId, activeContext, id }) {
    const context = await contextFor(authUserId, activeContext);
    need(context, "files.assets.delete");
    const folder = await manageableFolder(context, id);
    await prisma.$transaction(async (db) => {
      await db.fileFolder.updateMany({ where: { parentId: folder.id }, data: { parentId: folder.parentId } });
      await db.fileAsset.updateMany({ where: { folderId: folder.id }, data: { folderId: folder.parentId } });
      await db.modulePublicLink.updateMany({
        where: { companyId: context.companyId, moduleKey: FILES_LINK_MODULE, resourceKey: FOLDER_LINK_RESOURCE, recordId: folder.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await db.fileFolder.delete({ where: { id: folder.id } });
    });
    await audit(context, folder.id, "files.folder.delete", { name: folder.name });
    return { id: folder.id };
  }

  // Files-origin documents the caller owns (or any, for admins) go into a
  // folder (null = root). Moving into a shared folder shares the file with the
  // company so the folder is not full of files its members cannot open.
  async function moveFiles({ authUserId, activeContext, fileIds, folderId = null }) {
    const context = await contextFor(authUserId, activeContext);
    need(context, "files.assets.update");
    if (!Array.isArray(fileIds) || !fileIds.length || fileIds.length > MOVE_MAX_FILES) throw new FilesServiceError("Selección de archivos no válida.", 400);
    const folder = folderId ? await visibleFolder(context, folderId) : null;
    const files = await prisma.fileAsset.findMany({
      where: { id: { in: fileIds }, entityId: context.companyId, entityType: "AtlasFile", OR: [{ moduleKey: null }, { moduleKey: { in: FILES_ORIGIN_MODULES } }] },
      select: { id: true, uploadedById: true, officeLock: true, officeLockExpiresAt: true },
    });
    if (files.length !== new Set(fileIds).size) throw new FilesServiceError("Algunos archivos no se pueden mover (pertenecen a otro módulo).", 400);
    for (const file of files) {
      if (!context.admin && file.uploadedById !== context.profileId) throw new FilesServiceError("Solo puedes mover tus propios archivos.", 403);
      if (file.officeLock && new Date(file.officeLockExpiresAt).getTime() > Date.now()) {
        throw new FilesServiceError("Un documento está abierto en Office. Ciérralo antes de moverlo.", 409);
      }
    }
    await prisma.fileAsset.updateMany({
      where: { id: { in: files.map((f) => f.id) } },
      data: { folderId: folder?.id ?? null, ...(folder?.scope === "COMPANY" ? { accessScope: "COMPANY" } : {}) },
    });
    await audit(context, folder?.id ?? context.companyId, "files.folder.move_files", { fileIds: files.map((f) => f.id), folderId: folder?.id ?? null });
    return { moved: files.length };
  }

  // ---- public links (owner or admin) ------------------------------------
  const linkScope = (companyId, folderId) => ({ companyId, moduleKey: FILES_LINK_MODULE, resourceKey: FOLDER_LINK_RESOURCE, recordId: folderId });

  async function listLinks({ authUserId, activeContext, folderId }) {
    const context = await contextFor(authUserId, activeContext);
    const folder = await manageableFolder(context, folderId);
    const rows = await prisma.modulePublicLink.findMany({ where: linkScope(context.companyId, folder.id), orderBy: { createdAt: "desc" }, take: MAX_LINKS_PER_FOLDER });
    return rows.map(serializeFileLink);
  }

  async function createLink({ authUserId, activeContext, folderId, input = {} }) {
    const context = await contextFor(authUserId, activeContext);
    const folder = await manageableFolder(context, folderId);
    const mode = input.mode ?? "view";
    if (!FILE_LINK_MODES.includes(mode)) throw new FilesServiceError("El modo del enlace no es válido.", 400);
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date())) throw new FilesServiceError("La fecha de vencimiento debe ser futura.", 400);
    const maxUses = input.maxUses == null || input.maxUses === "" ? null : Number(input.maxUses);
    if (maxUses != null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1_000_000)) throw new FilesServiceError("El máximo de usos no es válido.", 400);
    const active = await prisma.modulePublicLink.count({ where: { ...linkScope(context.companyId, folder.id), revokedAt: null } });
    if (active >= MAX_LINKS_PER_FOLDER) throw new FilesServiceError("Esta carpeta alcanzó el máximo de enlaces activos.", 409);
    const link = await prisma.modulePublicLink.create({
      data: {
        ...linkScope(context.companyId, folder.id), token: crypto.randomBytes(32).toString("base64url"), mode,
        label: input.label ? String(input.label).trim().slice(0, 120) || null : null, expiresAt, maxUses, createdByUserId: context.profileId,
      },
    });
    await audit(context, folder.id, "files.folder.link.create", { linkId: link.id, mode, expiresAt, maxUses });
    return serializeFileLink(link);
  }

  async function revokeLink({ authUserId, activeContext, folderId, linkId }) {
    const context = await contextFor(authUserId, activeContext);
    const folder = await manageableFolder(context, folderId);
    const link = await prisma.modulePublicLink.findFirst({ where: { ...linkScope(context.companyId, folder.id), id: linkId } });
    if (!link) throw new FilesServiceError("Enlace no encontrado.", 404);
    if (link.revokedAt) return serializeFileLink(link);
    const updated = await prisma.modulePublicLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
    await audit(context, folder.id, "files.folder.link.revoke", { linkId: link.id });
    return serializeFileLink(updated);
  }

  return { tree, create, update, remove, moveFiles, listLinks, createLink, revokeLink, descendantIds, linkStatus };
}
