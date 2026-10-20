// inventory-area-service.js - areas (nested folders), area members and moving items between areas.
import { InventoryServiceError, assertCompany } from './inventory-guards.js';
import { areasEnabledKey, canWriteArea } from './inventory-scope.js';

const ROLES = new Set(['viewer', 'editor', 'manager']);
const DUPLICATE_MESSAGE = 'Ya existe un area con ese nombre en esta carpeta.';

function cleanName(raw) {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name.length < 1 || name.length > 150) {
    throw new InventoryServiceError('El nombre del area debe tener entre 1 y 150 caracteres.', 400);
  }
  return name;
}

// Unique-index violations (same name under the same parent) surface as a 409.
function rethrowDuplicate(err) {
  if (err?.code === 'P2002') throw new InventoryServiceError(DUPLICATE_MESSAGE, 409);
  throw err;
}

export function createInventoryAreaService({ prisma }) {
  async function getArea(companyId, id) {
    const area = await prisma.invArea.findFirst({ where: { id, companyId, enabled: true } });
    if (!area) throw new InventoryServiceError('Area no encontrada.', 404);
    return area;
  }

  async function listTree(companyId, scope = null) {
    assertCompany(companyId);
    const rows = await prisma.invArea.findMany({
      where: { companyId, enabled: true },
      orderBy: { name: 'asc' },
      select: {
        id: true, parentId: true, name: true,
        _count: { select: { members: true, items: { where: { enabled: true } } } },
      },
    });
    return rows
      .filter((a) => !scope || scope.all || scope.roles.has(a.id))
      .map((a) => ({
        id: a.id,
        parentId: a.parentId,
        name: a.name,
        memberCount: a._count?.members ?? 0,
        itemCount: a._count?.items ?? 0,
        role: !scope || scope.all ? 'manager' : scope.roles.get(a.id),
      }));
  }

  async function createArea({ companyId, actorId = null, name, parentId = null }) {
    assertCompany(companyId);
    const clean = cleanName(name);
    if (parentId) await getArea(companyId, parentId);
    try {
      return await prisma.invArea.create({
        data: { companyId, name: clean, parentId: parentId || null, createdById: actorId },
      });
    } catch (err) {
      return rethrowDuplicate(err);
    }
  }

  // Rename and/or move. `parentId: undefined` keeps the parent, `null` moves to the root.
  async function updateArea({ companyId, id, name, parentId }) {
    assertCompany(companyId);
    const area = await getArea(companyId, id);
    const data = {};
    if (name !== undefined) data.name = cleanName(name);
    if (parentId !== undefined && (parentId || null) !== area.parentId) {
      if (parentId) {
        await getArea(companyId, parentId);
        const all = await prisma.invArea.findMany({ where: { companyId, enabled: true }, select: { id: true, parentId: true } });
        const parentOf = new Map(all.map((a) => [a.id, a.parentId]));
        // Walk up from the proposed parent; reaching `id` means it is a descendant.
        for (let cur = parentId, hops = 0; cur && hops <= all.length; cur = parentOf.get(cur), hops += 1) {
          if (cur === id) throw new InventoryServiceError('No puedes mover un area dentro de si misma o de una subcarpeta.', 400);
        }
      }
      data.parentId = parentId || null;
    }
    if (Object.keys(data).length === 0) return area;
    try {
      return await prisma.invArea.update({ where: { id }, data });
    } catch (err) {
      return rethrowDuplicate(err);
    }
  }

  // Soft delete: items fall back to General, direct children become roots.
  async function disableArea({ companyId, id }) {
    assertCompany(companyId);
    await getArea(companyId, id);
    await prisma.$transaction(async (tx) => {
      await tx.invItem.updateMany({ where: { companyId, areaId: id }, data: { areaId: null } });
      await tx.invArea.updateMany({ where: { companyId, parentId: id }, data: { parentId: null } });
      await tx.invArea.update({ where: { id }, data: { enabled: false } });
    });
    return { id };
  }

  async function listMembers(companyId, areaId) {
    assertCompany(companyId);
    await getArea(companyId, areaId);
    return prisma.invAreaMember.findMany({
      where: { areaId, user: { isBot: false } },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, displayName: true, email: true } } },
    });
  }

  async function setMember({ companyId, areaId, userId, role = 'viewer', actorId = null }) {
    assertCompany(companyId);
    if (!ROLES.has(role)) throw new InventoryServiceError('Rol de area invalido.', 400);
    await getArea(companyId, areaId);
    const membership = await prisma.membership.findFirst({ where: { companyId, userId, enabled: true }, select: { id: true } });
    if (!membership) throw new InventoryServiceError('El usuario no pertenece a la empresa actual.', 400);
    return prisma.invAreaMember.upsert({
      where: { areaId_userId: { areaId, userId } },
      create: { areaId, userId, role, invitedById: actorId },
      update: { role },
    });
  }

  async function removeMember({ companyId, areaId, userId }) {
    assertCompany(companyId);
    await getArea(companyId, areaId);
    await prisma.invAreaMember.deleteMany({ where: { areaId, userId } });
    return { areaId, userId };
  }

  // areaId null = General. Needs write access on every source area and on the destination.
  async function moveItems({ companyId, itemIds, areaId = null, scope = null }) {
    assertCompany(companyId);
    const ids = [...new Set(itemIds ?? [])];
    if (ids.length === 0) throw new InventoryServiceError('Selecciona al menos un item.', 400);
    if (areaId) await getArea(companyId, areaId);
    const items = await prisma.invItem.findMany({ where: { id: { in: ids }, companyId, enabled: true }, select: { id: true, areaId: true } });
    if (items.length !== ids.length) throw new InventoryServiceError('Item no encontrado.', 404);
    if (scope && !scope.all) {
      if (!canWriteArea(scope, areaId)) throw new InventoryServiceError('No tienes permiso para mover items a esa area.', 403);
      if (items.some((i) => !canWriteArea(scope, i.areaId))) {
        throw new InventoryServiceError('No tienes permiso para mover items de su area actual.', 403);
      }
    }
    await prisma.invItem.updateMany({ where: { id: { in: ids }, companyId }, data: { areaId: areaId || null } });
    return { moved: ids.length };
  }

  async function getSettings(companyId) {
    assertCompany(companyId);
    const row = await prisma.instanceConfig.findUnique({ where: { key: areasEnabledKey(companyId) } });
    return { enabled: row?.value === 'true' };
  }

  async function setEnabled(companyId, enabled) {
    assertCompany(companyId);
    const value = enabled ? 'true' : 'false';
    const key = areasEnabledKey(companyId);
    await prisma.instanceConfig.upsert({ where: { key }, create: { key, value }, update: { value } });
    return { enabled: Boolean(enabled) };
  }

  return { listTree, createArea, updateArea, disableArea, listMembers, setMember, removeMember, moveItems, getSettings, setEnabled };
}
