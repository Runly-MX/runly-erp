import { createHash } from 'node:crypto'
import {assertWebsiteAccess} from './website-authorization-service.js'
import { WebsiteServiceError, notFound } from '../routes/website/service-helpers.js'

const fail = (message, code = 'validation_failed', status = 422) => new WebsiteServiceError(message, status, code)
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
export function websiteDocumentHash(value) {
  const ordered = item => Array.isArray(item) ? item.map(ordered) : plain(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, ordered(item[key])])) : item
  return createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex')
}

// Preserve all metadata and unknown block types; never repair/drop orphan blocks.
export function normalizeWebsiteDocument(input, { strict = false } = {}) {
  let doc = input
  if (typeof doc === 'string') {
    try { doc = JSON.parse(doc) } catch { throw fail('El documento no contiene JSON válido.') }
  }
  if (!plain(doc) || Buffer.byteLength(JSON.stringify(doc)) > 2 * 1024 * 1024) throw fail('Documento inválido o demasiado grande.')
  if (doc.schemaVersion === undefined && !strict && !doc.blocks && !doc.regions) return doc // historical opaque JSON, no destructive conversion
  if (doc.schemaVersion !== 1) throw fail('Versión de documento no soportada.', 'schema_unsupported')
  if (!plain(doc.blocks) || !plain(doc.regions) || Object.keys(doc.blocks).length > 1000) throw fail('Estructura de documento inválida.')
  const visited = new Set(), ancestors = new Set()
  function visit(id, depth) {
    const block = doc.blocks[id]
    if (depth > 50 || typeof id !== 'string' || !plain(block) || ancestors.has(id) || visited.has(id) || block.id !== id || typeof block.type !== 'string') throw fail('Árbol de bloques inválido.')
    ancestors.add(id); visited.add(id)
    if (block.children !== undefined) {
      if (!plain(block.children)) throw fail('Slots inválidos.')
      for (const children of Object.values(block.children)) {
        if (!Array.isArray(children)) throw fail('Slots inválidos.')
        for (const child of children) visit(child, depth + 1)
      }
    }
    ancestors.delete(id)
  }
  for (const region of Object.values(doc.regions)) {
    if (!plain(region) || !Array.isArray(region.children)) throw fail('Región inválida.')
    for (const id of region.children) visit(id, 1)
  }
  if (visited.size !== Object.keys(doc.blocks).length) throw fail('El documento contiene bloques sin relación.')
  return doc
}

export function createWebsiteDraftService({ prisma }) {
  async function lockSite(tx, companyId, siteId) {
    const rows = await tx.$queryRaw`SELECT id FROM website_site WHERE id=${siteId}::uuid AND company_id=${companyId}::uuid AND enabled=true FOR UPDATE`
    if (!rows.length) throw notFound('Recurso')
  }
  function expected(current, revision) {
    if (revision === undefined) return // explicit legacy last-write-wins, serialized under the same lock
    if (!Number.isSafeInteger(revision) || revision < 0) throw fail('Revisión inválida.')
    if ((current ?? 0) !== revision) throw fail('La revisión cambió. Recupera el borrador vigente.', 'revision_conflict', 409)
  }
  async function receipt(tx, args, operation, body, run) {
    const key = args.idempotencyKey
    if (key === undefined) return run()
    if (typeof key !== 'string' || key.length < 16 || key.length > 200) throw fail('Idempotency-Key inválida.')
    const keyHash = websiteDocumentHash(key), requestHash = websiteDocumentHash(body)
    const where = { companyId: args.companyId, actorId: args.actorId, operation, keyHash }
    const previous = await tx.websiteDraftCommand.findFirst({ where })
    if (previous) {
      if (previous.requestHash !== requestHash) throw fail('La clave ya corresponde a otra solicitud.', 'idempotency_conflict', 409)
      return previous.result
    }
    const result = await run()
    // JSON receipts have the same wire representation on first call and replay.
    const json = JSON.parse(JSON.stringify(result))
    await tx.websiteDraftCommand.create({ data: { ...where, requestHash, result: json } })
    return json
  }
  async function save(args, kind = 'page') {
    if(args.themeTokens!==undefined){
      assertWebsiteAccess(args.access,args.companyId,'website.theme.update')
      assertWebsiteAccess(args.access,args.companyId,'website.site.update')
      if(!plain(args.themeTokens)||Buffer.byteLength(JSON.stringify(args.themeTokens))>65536||!Number.isSafeInteger(args.expectedSiteRevision))throw fail('Tema o revisión de sitio inválidos.')
    }
    const model = kind === 'page' ? 'websitePage' : 'websiteBlogPost'
    const id = kind === 'page' ? args.pageId : args.postId
    const initial = await prisma[model].findFirst({ where: { id, companyId: args.companyId, enabled: true } })
    if (!initial || (args.siteId && initial.siteId !== args.siteId)) throw notFound('Recurso')
    const document = normalizeWebsiteDocument(args.builderData, { strict: args.strictDocument })
    if (args.strictDocument && args.expectedRevision === undefined) throw fail('expectedRevision requerida.')
    if (args.seo !== undefined && !plain(args.seo)) throw fail('SEO inválido.')
    return prisma.$transaction(async tx => {
      // Old SQL writers lock the page before their site-counter trigger. Keep
      // that order to coexist without a page/site lock inversion.
      if (kind === 'page') await tx.$queryRaw`SELECT id FROM website_page WHERE id=${id}::uuid AND company_id=${args.companyId}::uuid FOR UPDATE`
      else await tx.$queryRaw`SELECT id FROM website_blog_post WHERE id=${id}::uuid AND company_id=${args.companyId}::uuid FOR UPDATE`
      await lockSite(tx, args.companyId, initial.siteId)
      const current = await tx[model].findFirst({ where: { id, companyId: args.companyId, siteId: initial.siteId, enabled: true } })
      if (!current) throw notFound('Recurso')
      return receipt(tx, args, `${kind}.draft:${id}`, { document, seo: args.seo, metadata: args.metadata, expectedRevision: args.expectedRevision,themeTokens:args.themeTokens,expectedSiteRevision:args.expectedSiteRevision }, async () => {
        expected(current.revision, args.expectedRevision)
        if(args.themeTokens!==undefined){
          const site=await tx.websiteSite.findUnique({where:{id:initial.siteId}});expected(site.draftRevision,args.expectedSiteRevision)
          const theme=await tx.websiteTheme.create({data:{companyId:args.companyId,siteId:site.id,name:'Tema del borrador Atlas',tokens:args.themeTokens}})
          await tx.websiteSite.update({where:{id:site.id},data:{draftIdentity:{...(site.draftIdentity??{name:site.name,siteType:site.siteType,settings:site.settings??{},seoDefaults:site.seoDefaults??{},homepagePageId:site.homepagePageId}),themeId:theme.id},draftRevision:{increment:1}}})
        }
        if (kind === 'page' && args.metadata?.routePath) {
          const others = await tx.websitePage.findMany({ where: { companyId: args.companyId, siteId: current.siteId, id: { not: id } }, select: { routePath: true, draftMetadata: true } })
          if (others.some(row => row.routePath === args.metadata.routePath || row.draftMetadata?.routePath === args.metadata.routePath)) throw fail('La ruta está reservada por otra página.', 'route_conflict', 409)
        }
        const updated = await tx[model].update({ where: { id, companyId: args.companyId, siteId: current.siteId, revision: current.revision ?? 0 }, data: {
          draftBuilderData: document, revision: { increment: 1 },
          ...(args.seo !== undefined && { draftSeo: args.seo }),
          ...(kind === 'page' && args.metadata && { draftMetadata: { ...(current.draftMetadata ?? { title: current.title, slug: current.slug, routePath: current.routePath, visibility: current.visibility }), ...args.metadata } }),
          ...(kind === 'page' && { updatedById: args.actorId }),
        } })
        await tx.auditLog.create({ data: { actorId: args.actorId, moduleKey: 'runly.website', entityType: `website.${kind}`, entityId: id, action: `${kind}.save_draft`, metadata: { companyId: args.companyId, siteId: current.siteId, revision: updated.revision } } })
        return { ...updated, documentHash: websiteDocumentHash(document), concurrency: args.expectedRevision === undefined ? 'legacy_last_write_wins' : 'compare_and_swap' }
      })
    })
  }
  async function saveSite(args) {
    if (args.expectedRevision === undefined) throw fail('expectedRevision requerida.')
    return prisma.$transaction(async tx => {
      await lockSite(tx, args.companyId, args.siteId)
      return receipt(tx, args, `site.draft:${args.siteId}`, { data: args.data, expectedRevision: args.expectedRevision }, async () => {
        const current = await tx.websiteSite.findFirst({ where: { id: args.siteId, companyId: args.companyId, enabled: true } })
        expected(current.draftRevision, args.expectedRevision)
        const identity = current.draftIdentity ?? { name: current.name, siteType: current.siteType, settings: current.settings, seoDefaults: current.seoDefaults, themeId: current.themeId, homepagePageId: current.homepagePageId }
        const saved = await tx.websiteSite.update({ where: { id: args.siteId, companyId: args.companyId, draftRevision: current.draftRevision }, data: { draftIdentity: { ...identity, ...args.data }, draftRevision: { increment: 1 } } })
        await tx.auditLog.create({ data: { actorId: args.actorId, moduleKey: 'runly.website', entityType: 'website.site', entityId: args.siteId, action: 'site.save_draft', metadata: { companyId: args.companyId, revision: saved.draftRevision } } })
        return saved
      })
    })
  }
  async function createSite(args, create) {
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${args.companyId}::text,0))::text`
      return receipt(tx, args, 'site.create', args.data, async () => {
        const any = await tx.websiteSite.findFirst({ where: { companyId: args.companyId } })
        return create(tx, !any)
      })
    })
  }
  return { save, saveSite, createSite, lockSite, receipt, expected }
}
