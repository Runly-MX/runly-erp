import { scopeWhere, canWriteArea } from './inventory-scope.js'
// Component links between inventory items: a main item (principal) and its
// components (e.g. condenser + evaporator of an air conditioner). One level
// only: a component cannot have components. The form sends `parentItemId`
// ('' clears it); the change commits in the same transaction as the item write.

const SUMMARY_SELECT = {
  id: true, name: true, folio: true, serialNumber: true, assetTag: true, status: true, adminStatus: true,
  category: { select: { name: true } }, brand: { select: { name: true } },
}
const summarize = ({ category, brand, ...item }) => ({ ...item, categoryName: category?.name ?? null, brandName: brand?.name ?? null })

// undefined = untouched, null = clear, string = new main item.
export function requestedParent(body = {}) {
  const value = body?.parentItemId
  if (value === undefined) return undefined
  return value === null || value === '' ? null : String(value)
}

export function withoutParentField(body = {}) {
  const { parentItemId: _drop, ...rest } = body
  return rest
}

// Filter for the list: parent = has components, child = is a component,
// standalone = neither, linked = parent or child.
export function componentLinkWhere(link) {
  const isParent = { components: { some: { enabled: true } } }
  const isChild = { parentItemId: { not: null } }
  if (link === 'parent') return isParent
  if (link === 'child') return isChild
  if (link === 'linked') return { OR: [isParent, isChild] }
  if (link === 'standalone') return { parentItemId: null, components: { none: { enabled: true } } }
  return null
}

export async function prepareParentLink({ prisma, companyId, itemId = null, body, fail }) {
  const parentId = requestedParent(body)
  if (parentId === undefined) return { afterWrite: null }
  if (parentId) {
    if (parentId === itemId) throw fail('Un activo no puede ser componente de sí mismo.', 400)
    const parent = await prisma.invItem.findFirst({ where: { id: parentId, companyId, enabled: true }, select: { parentItemId: true } })
    if (!parent) throw fail('El activo principal no existe o pertenece a otra empresa.', 404)
    if (parent.parentItemId) throw fail('Ese activo ya es componente de otro; elige el principal.', 409)
    if (itemId && await prisma.invItem.count({ where: { companyId, parentItemId: itemId, enabled: true } })) {
      throw fail('Este activo ya tiene componentes; no puede ser componente de otro.', 409)
    }
  }
  return { afterWrite: async (tx, item) => { await tx.invItem.update({ where: { id: item.id }, data: { parentItemId: parentId } }) } }
}

// { parent, children, siblings } of one item, restricted to the caller's areas. null when the item is not visible.
export async function loadComponents(prisma, companyId, itemId, scope = null) {
  const visible = scopeWhere(scope)
  const where = (extra) => ({ companyId, enabled: true, ...extra, ...(visible ? { AND: [visible] } : {}) })
  const item = await prisma.invItem.findFirst({ where: where({ id: itemId }), select: { parentItemId: true } })
  if (!item) return null
  const [parent, children, siblings] = await Promise.all([
    item.parentItemId ? prisma.invItem.findFirst({ where: where({ id: item.parentItemId }), select: SUMMARY_SELECT }) : null,
    prisma.invItem.findMany({ where: where({ parentItemId: itemId }), select: SUMMARY_SELECT, orderBy: { createdAt: 'asc' } }),
    item.parentItemId ? prisma.invItem.findMany({ where: where({ parentItemId: item.parentItemId, id: { not: itemId } }), select: SUMMARY_SELECT, orderBy: { createdAt: 'asc' } }) : [],
  ])
  return { parent: parent && summarize(parent), children: children.map(summarize), siblings: siblings.map(summarize) }
}

// Components of the given items that the caller can see: [{ id, parentItemId, adminStatus }].
export async function componentsOf(prisma, companyId, itemIds, scope = null) {
  const visible = scopeWhere(scope)
  return prisma.invItem.findMany({
    where: { companyId, enabled: true, parentItemId: { in: itemIds ?? [] }, ...(visible ? { AND: [visible] } : {}) },
    select: { id: true, parentItemId: true, adminStatus: true },
  })
}

// List rows: adds componentCount (main items) and parentName (components) in two queries per page.
export async function attachComponentInfo(prisma, companyId, rows) {
  if (!rows.length) return rows
  const ids = rows.map((row) => row.id)
  const parentIds = [...new Set(rows.map((row) => row.parentItemId).filter(Boolean))]
  const [counts, parents] = await Promise.all([
    prisma.invItem.groupBy({ by: ['parentItemId'], where: { companyId, enabled: true, parentItemId: { in: ids } }, _count: { _all: true } }),
    parentIds.length ? prisma.invItem.findMany({ where: { companyId, id: { in: parentIds } }, select: { id: true, name: true } }) : [],
  ])
  const countOf = new Map(counts.map((row) => [row.parentItemId, row._count._all]))
  const nameOf = new Map(parents.map((row) => [row.id, row.name]))
  return rows.map((row) => {
    const componentCount = countOf.get(row.id) ?? 0
    const parentName = row.parentItemId ? (nameOf.get(row.parentItemId) ?? null) : null
    const componentLabel = componentCount ? `Principal · ${componentCount} ${componentCount === 1 ? 'componente' : 'componentes'}` : (row.parentItemId ? `Componente de ${parentName ?? 'otro activo'}` : null)
    return { ...row, componentCount, parentName, componentLabel }
  })
}

// Bulk link/unlink from the list: parentId = null detaches the items. Same one-level rules as the form.
export async function linkComponents({ prisma, companyId, parentId = null, itemIds, scope = null, fail }) {
  const ids = [...new Set(itemIds ?? [])]
  if (!ids.length || ids.length > 500) throw fail('Selecciona entre 1 y 500 activos.', 400)
  if (parentId) {
    if (ids.includes(parentId)) throw fail('Un activo no puede ser componente de sí mismo.', 400)
    const parent = await prisma.invItem.findFirst({ where: { id: parentId, companyId, enabled: true }, select: { parentItemId: true } })
    if (!parent) throw fail('El activo principal no existe o pertenece a otra empresa.', 404)
    if (parent.parentItemId) throw fail('Ese activo ya es componente de otro; elige el principal.', 409)
    if (await prisma.invItem.count({ where: { companyId, enabled: true, parentItemId: null, id: { in: ids }, components: { some: { enabled: true } } } })) {
      throw fail('Alguno de los activos ya tiene componentes; no puede ser componente de otro.', 409)
    }
  }
  const items = await prisma.invItem.findMany({ where: { id: { in: ids }, companyId, enabled: true }, select: { id: true, areaId: true } })
  if (items.length !== ids.length) throw fail('Activo no encontrado.', 404)
  if (scope && !scope.all && items.some((item) => !canWriteArea(scope, item.areaId))) throw fail('No tienes permiso para modificar alguno de esos activos.', 403)
  await prisma.invItem.updateMany({ where: { id: { in: ids }, companyId }, data: { parentItemId: parentId } })
  return { linked: ids.length }
}
