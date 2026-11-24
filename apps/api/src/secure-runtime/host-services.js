// Host services the Capability Gateway may use (experimental). They run in
// the trusted host with the host-derived context; the module never reaches
// them directly. Least privilege: never the user's admin flag, only the
// module permissions the user holds.
import { externalTarget } from '@runly/module-compiler'
import { GatewayError } from './protocol.js'

export function createGatewayHostServices({ filesService, prisma = null, relationTargets = null, activityService = null }) {
  const services = {
    files: {
      async describe({ companyId, profileId, permissionSet, ids }) {
        const assets = await filesService.getCompanyAssets({ activeContext: { companyId, profileId, isAdmin: false, permissionSet }, fileIds: ids })
        return assets.map((asset) => ({ id: asset.id, mimeType: asset.mimeType }))
      },
    },
  }
  if (activityService) services.activity = { publish: (input) => activityService.publish({ severity: 'info', source: 'explicit', ...input }) }
  if (relationTargets && prisma) {
    // One contract for every Runly entity: the platform's relation-targets
    // catalog. The owning module's own permission and visibility apply to the
    // user (never a broad host identity), the target module must be enabled,
    // and the module only ever receives id, label and subtitle.
    const run = async ({ companyId, profileId, type }, fn) => {
      const target = externalTarget(type)
      if (!target) throw new GatewayError('INVALID_ARGS', 'Destino de relación desconocido.', 422)
      const moduleRow = await prisma.runlyModule.findUnique({ where: { key: target.module }, select: { id: true, status: true, enabled: true } })
      const company = moduleRow && await prisma.companyModule.findUnique({ where: { companyId_moduleId: { companyId, moduleId: moduleRow.id } }, select: { enabled: true } })
      if (!moduleRow || moduleRow.status !== 'INSTALLED' || !moduleRow.enabled || company?.enabled === false) throw new GatewayError('RELATION_TARGET_UNAVAILABLE', 'El módulo de destino no está habilitado.', 409)
      const profile = await prisma.userProfile.findUnique({ where: { id: profileId }, select: { authUserId: true } })
      if (!profile?.authUserId) throw new GatewayError('PERMISSION_DENIED', 'No tienes permiso para esta operación.', 403)
      try { return await fn(profile.authUserId) } catch (error) {
        if (error instanceof GatewayError) throw error
        if (error?.status === 403 || error?.status === 401) throw new GatewayError('PERMISSION_DENIED', 'No tienes permiso para ver este destino.', 403)
        throw error
      }
    }
    // Some owning resolvers still show soft-deleted rows by id (their own detail
    // screens do). A reference to a deleted record must not resolve: filter by the
    // catalog's own soft-delete column. The table comes from the trusted catalog
    // constant, never from the module.
    const withoutDeleted = async ({ companyId, type }, ids, entries) => {
      const connection = externalTarget(type)?.connection
      if (!ids.length || connection?.softDelete !== 'enabled' || !/^[a-z][a-z0-9_]{1,40}$/.test(connection.table)) return entries
      const live = new Set((await prisma.$queryRawUnsafe(`SELECT id::text AS id FROM "${connection.table}" WHERE id = ANY($1::uuid[]) AND company_id = $2::uuid AND enabled = true`, ids, companyId)).map((r) => r.id))
      return entries.filter(([id]) => live.has(id))
    }
    services.relations = {
      async resolve(input) {
        return run(input, async (authUserId) => {
          const found = [...(await relationTargets.resolve({ authUserId, companyId: input.companyId, type: input.type, ids: input.ids }))]
          return (await withoutDeleted(input, found.map(([id]) => id), found)).map(([id, v]) => ({ id, label: v.title, subtitle: v.subtitle }))
        })
      },
      async search(input) {
        return run(input, async (authUserId) => (await relationTargets.search({ authUserId, companyId: input.companyId, type: input.type, q: input.q, limit: input.limit })).map((r) => ({ id: r.id, label: r.title, subtitle: r.subtitle })))
      },
    }
  }
  return services
}
