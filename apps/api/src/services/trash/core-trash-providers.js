// Desactivados providers of core modules (spec 2026-10-03-records-trash-design
// §5.4): inventory items, contacts and HR employees. Same contract as the
// generic RME3 provider; Prisma FK errors (P2003, including Connections
// "Impedir la eliminación") become TrashInUseError.
import { TrashError, TrashInUseError, isForeignKeyViolation } from './trash-errors.js'
import { findActiveDuplicates } from '../inventory-identifiers.js'
import { createInventoryAccess } from '../inventory-access.js'
import { scopeWhere } from '../inventory-scope.js'

const PAGE_SIZE = 25

// scope: where-fragment that ties a row to the company (default: its own companyId column).
export function prismaProvider({ id, table, moduleKey, moduleName, label, pluralLabel, restorePermission, purgePermission = null, delegate, toLabel, searchWhere, select, beforeRestore = null, restrict = null, scope = (companyId) => ({ companyId }) }) {
  // restrict(ctx) -> extra where for the acting user (e.g. inventory areas), or null. System runs (no actor) are never restricted.
  const where = (companyId, extra = {}, restriction = null) => ({ ...scope(companyId), enabled: false, ...extra, ...(restriction ?? {}) })
  const restriction = async (ctx) => (restrict && ctx.actorId ? restrict(ctx) : null)
  const find = async (prisma, companyId, recordId, restricted = null) => {
    const row = await prisma[delegate].findFirst({ where: where(companyId, { id: recordId }, restricted), select })
    if (!row) throw new TrashError('El registro no está desactivado o no existe.', 404)
    return row
  }
  return {
    id, table, transactional: true, moduleKey, moduleName, label, pluralLabel,
    permissions: { restore: restorePermission, purge: purgePermission },
    count: async (ctx) => ctx.prisma[delegate].count({ where: where(ctx.companyId, {}, await restriction(ctx)) }),
    // Ids deactivated (last changed) before `before`, for the automatic purge.
    async expired({ prisma, companyId }, before, limit = 200) {
      const rows = await prisma[delegate].findMany({ where: where(companyId, { updatedAt: { lt: before } }), select: { id: true }, orderBy: { updatedAt: 'asc' }, take: limit })
      return rows.map((row) => row.id)
    },
    async list(ctx, { search = '', page = 1 } = {}) {
      const { prisma, companyId } = ctx
      const term = String(search ?? '').trim()
      const filter = where(companyId, term ? searchWhere(term) : {}, await restriction(ctx))
      const [rows, total] = await Promise.all([
        prisma[delegate].findMany({ where: filter, select, orderBy: { updatedAt: 'desc' }, take: PAGE_SIZE, skip: (Math.max(1, Number(page) || 1) - 1) * PAGE_SIZE }),
        prisma[delegate].count({ where: filter }),
      ])
      return { items: rows.map((row) => ({ id: row.id, label: toLabel(row), deactivatedAt: row.updatedAt })), total }
    },
    async restore(ctx, recordId) {
      const { prisma, companyId } = ctx
      const row = await find(prisma, companyId, recordId, await restriction(ctx))
      if (beforeRestore) await beforeRestore({ prisma, companyId }, row)
      await prisma[delegate].update({ where: { id: row.id }, data: { enabled: true } })
      return { id: row.id, label: toLabel(row) }
    },
    async purge(ctx, recordId) {
      const { prisma, companyId } = ctx
      const row = await find(prisma, companyId, recordId, await restriction(ctx))
      try {
        await prisma[delegate].delete({ where: { id: row.id } })
      } catch (error) {
        if (isForeignKeyViolation(error)) throw new TrashInUseError()
        throw error
      }
      return { id: row.id, label: toLabel(row) }
    },
  }
}

export const contains = (term) => ({ contains: term, mode: 'insensitive' })

export const CORE_TRASH_PROVIDERS = Object.freeze([
  prismaProvider({
    id: 'runly.inventory:item', table: 'inv_item', moduleKey: 'runly.inventory', moduleName: 'Inventario',
    label: 'Artículo', pluralLabel: 'Artículos', restorePermission: 'inventory.item.delete', delegate: 'invItem',
    // Area scoping: a limited user only sees / restores / purges deactivated items of their areas.
    restrict: async ({ prisma, companyId, actorId }) => scopeWhere(await createInventoryAccess({ prisma }).scopeFor({ companyId, actorId })),
    select: { id: true, name: true, assetTag: true, serialNumber: true, updatedAt: true },
    // A reactivated item must not repeat the serial / asset number of an active one.
    beforeRestore: async ({ prisma, companyId }, row) => {
      const found = await findActiveDuplicates(prisma, companyId, { assetTag: row.assetTag, serialNumber: row.serialNumber, excludeId: row.id })
      if (found.serialNumber) throw new TrashError(`No se puede reactivar: ya existe un inventario activo con el número de serie ${row.serialNumber}. Cámbialo o desactiva el otro primero.`, 409, 'identifier_exists', { item: found.serialNumber })
      if (found.assetTag) throw new TrashError(`No se puede reactivar: ya existe un inventario activo con el número de activo ${row.assetTag}. Cámbialo o desactiva el otro primero.`, 409, 'identifier_exists', { item: found.assetTag })
    },
    toLabel: (row) => [row.name, row.assetTag].filter(Boolean).join(' · '),
    searchWhere: (term) => ({ OR: [{ name: contains(term) }, { assetTag: contains(term) }] }),
  }),
  prismaProvider({
    id: 'runly.contacts:contact', table: 'contact', moduleKey: 'runly.contacts', moduleName: 'Contactos',
    label: 'Contacto', pluralLabel: 'Contactos', restorePermission: 'contacts.contacts.update', delegate: 'contact',
    select: { id: true, name: true, updatedAt: true },
    toLabel: (row) => row.name,
    searchWhere: (term) => ({ name: contains(term) }),
  }),
  prismaProvider({
    id: 'runly.hr:employee', table: 'hr_employee', moduleKey: 'runly.hr', moduleName: 'Recursos humanos',
    label: 'Colaborador', pluralLabel: 'Colaboradores', restorePermission: 'hr.employee.delete', delegate: 'hrEmployee',
    select: { id: true, firstName: true, lastName: true, employeeCode: true, updatedAt: true },
    toLabel: (row) => [`${row.firstName ?? ''} ${row.lastName ?? ''}`.trim(), row.employeeCode].filter(Boolean).join(' · '),
    searchWhere: (term) => ({ OR: [{ firstName: contains(term) }, { lastName: contains(term) }, { employeeCode: contains(term) }] }),
  }),
])
