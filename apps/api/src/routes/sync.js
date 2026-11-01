import { Hono } from 'hono'
import { createSyncService, SyncServiceError } from '../services/sync-service.js'
import { createSyncPushService } from '../services/sync-push-service.js'
import { createCatalogSyncWriteService } from './catalog/catalog-sync-write-service.js'
import { id as catalogId } from './catalog/commerce-contracts.js'

// resolveTenantContext: the same X-Runly-Company-Id-validating resolver
// requirePermission/requireAnyPermission use, injected rather than imported
// (index.js imports this router — importing back from index.js would be
// circular). None of these routes carry a single natural permission gate
// (sync pulls/pushes across arbitrary modules at once), so they call it
// directly instead of going through requirePermission. Strict: sync must
// know exactly which company it's syncing — unlike a bootstrap endpoint,
// there's no safe "ambiguous" default for a multi-company user's offline data.
// See docs/superpowers/specs/2026-09-10-multi-tenant-architecture-design.md §5.
export function createSyncRouter({ prisma, getUserContext, resolveTenantContext, catalogWriteService }) {
  const app = new Hono()
  const service = createSyncService({ prisma })
  const pushService = createSyncPushService({ prisma })
  const catalogWrites = catalogWriteService ?? createCatalogSyncWriteService({prisma})

  function handleError(c, err, scope) {
    if (err instanceof SyncServiceError) {
      return c.json({ error: err.message, code: err.code }, err.status)
    }
    console.error(`[${scope}]`, err?.message ?? err)
    return c.json({ error: 'Error interno' }, 500)
  }

  async function resolveCompanyId(c) {
    const context = await getUserContext(c)
    if (!context?.profile) {
      return { error: c.json({ error: 'No autorizado. Perfil de usuario no encontrado.' }, 401) }
    }
    const resolved = await resolveTenantContext(c, context)
    if (!resolved.ok) return { error: resolved.response }
    return { companyId: resolved.tenant.companyId, tenant: resolved.tenant, actorId:context.profile.id }
  }

  // GET /sync/pull?modules=runly.contacts,runly.hr&cursor=ISO-timestamp
  app.get('/sync/pull', async (c) => {
    try {
      const authUserId = c.get('authUserId')
      const { companyId, error } = await resolveCompanyId(c)
      if (error) return error
      const modulesParam = c.req.query('modules') ?? ''
      const cursor = c.req.query('cursor') ?? null
      const modules = modulesParam
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean)
      const result = await service.pull({ authUserId, companyId, modules, cursor })
      return c.json(result)
    } catch (err) {
      return handleError(c, err, 'GET /sync/pull')
    }
  })

  // GET /sync/status — returns stored SyncCursor rows for the current company
  app.get('/sync/status', async (c) => {
    try {
      const authUserId = c.get('authUserId')
      const { companyId, error } = await resolveCompanyId(c)
      if (error) return error
      const result = await service.getStatus({ authUserId, companyId })
      return c.json({ cursors: result })
    } catch (err) {
      return handleError(c, err, 'GET /sync/status')
    }
  })

  // POST /sync/push — apply a batch of offline mutations
  app.post('/sync/push', async (c) => {
    try {
      const authUserId = c.get('authUserId')
      const { companyId, error, tenant, actorId } = await resolveCompanyId(c)
      if (error) return error
      const body = await c.req.json()
      const mutations = Array.isArray(body?.mutations) ? body.mutations : []
      // Catalog prices must not be writable through an unprivileged offline
      // route while the online POS enforces authoritative pricing.
      const accepted = [], positions = [], results = []
      for (const [index, mutation] of mutations.entries()) {
        if (['runly.catalog', 'atlas.catalog'].includes(mutation.moduleKey)) {
          const entity = { product: 'products', category: 'categories' }[mutation.entityType]
          const action = { CREATE: 'create', UPDATE: 'update' }[mutation.operation]
          const allowed = entity && action && (tenant.isAdmin || tenant.permissionSet?.has(`catalog.${entity}.${action}`))
          const forbiddenFields = ['id','companyId','company_id','stock'].some((key) => Object.hasOwn(mutation.payload ?? {}, key))
          if (!allowed || forbiddenFields) {
            results[index] = { idempotencyKey: mutation.idempotencyKey, status: 'PERMISSION_DENIED', record: null }
            continue
          }
          if(mutation.entityType==='product'){
            // Preserve pre-existing replay records; new writes use atomic commands.
            const legacy=catalogId.safeParse(mutation.idempotencyKey).success
              ? await prisma.syncMutationLog.findUnique({where:{idempotencyKey:mutation.idempotencyKey}}) : null
            if(!legacy){
              try{
                const record=await catalogWrites.apply({companyId,actorId},mutation)
                results[index]={idempotencyKey:mutation.idempotencyKey,status:'OK',record}
              }catch(err){
                const conflict=err.code==='CATALOG_VERSION_CONFLICT'
                const record=conflict?await prisma.catalogProduct.findFirst({where:{id:mutation.recordId,companyId}}):null
                results[index]={idempotencyKey:mutation.idempotencyKey,status:conflict?'CONFLICT':'ERROR',code:err.code??'VALIDATION_ERROR',record}
              }
              continue
            }
          }
        }
        accepted.push(mutation); positions.push(index)
      }
      const applied = await pushService.push({ authUserId, companyId, mutations: accepted })
      applied.results.forEach((result, index) => { results[positions[index]] = result })
      return c.json({ results })
    } catch (err) {
      return handleError(c, err, 'POST /sync/push')
    }
  })

  return app
}
