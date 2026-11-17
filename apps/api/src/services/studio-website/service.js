// Studio → Website: creates editable Website DRAFT pages from Studio pages. Never publishes,
// never changes the Studio design. Photos are copied as private files of the target site
// (the Studio design's image authorization decides which ones the actor may copy); objects
// without an Atlas equivalent arrive as one PNG each, rendered by the browser and checked
// here. Files are staged through website_template_job, so a failure before the final
// transaction leaves no page and its uploads are removed by the existing compensation.
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { validateImage } from '@runly/studio-interchange/inspect'
import { findPage } from '../../../../shared/studio/pages.js'
import { StudioError } from '../../../../shared/studio/document.js'
import { convertStudioPage, rasterObjects, websiteKind } from '../../../../shared/studio/website-conversion.js'
import { assertWebsiteAccess } from '../website-authorization-service.js'
import { WebsiteServiceError, notFound } from '../../routes/website/service-helpers.js'
import { createWebsiteDraftService, websiteDocumentHash } from '../website-draft-service.js'
import { createWebsiteTemplateService } from '../website-template-service.js'
import { createWebsiteMarketplaceService } from '../marketplace/website-import-service.js'
import { websiteReleasePath } from '../website-release-service.js'
import { buildStudioWebsitePage } from './page-builder.js'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const MAX_IMAGE = 8 * 1024 * 1024, MAX_TOTAL = 48 * 1024 * 1024
const box = z.strictObject({ x: z.number().finite(), y: z.number().finite(), width: z.number().finite().positive(), height: z.number().finite().positive() })
export const studioWebsiteRequest = z.strictObject({
  siteId: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), designRevision: z.number().int().positive(),
  pages: z.array(z.strictObject({ pageId: z.string().min(1).max(64), routePath: z.string().min(1).max(512), title: z.string().trim().min(1).max(160) })).min(1).max(24),
  rasters: z.array(z.strictObject({ pageId: z.string().min(1).max(64), objectId: z.string().min(1).max(64), box, base64: z.string().max(12_000_000) })).max(200).default([]),
  replaceExisting: z.boolean().default(false), acceptWarnings: z.literal(true),
})
const fail = (message, status = 409, code = 'studio_website_failed') => new WebsiteServiceError(message, status, code)

export function createStudioWebsiteService({ prisma, designs, filesService, supabaseAdmin }) {
  const drafts = createWebsiteDraftService({ prisma }), templates = createWebsiteTemplateService({ prisma })
  const jobs = createWebsiteMarketplaceService({ prisma, gate: null, filesService, supabaseAdmin })
  async function download(file) {
    const { data, error } = await supabaseAdmin.storage.from(file.bucket).download(file.objectKey)
    if (error || !data) throw fail('No se pudo leer una imagen del diseño.', 503, 'asset_unavailable')
    return Buffer.from(await data.arrayBuffer())
  }
  async function job(a, db = prisma, lock = false) {
    const rows = lock ? await db.$queryRaw`SELECT * FROM website_template_job WHERE company_id=${a.companyId}::uuid AND site_id=${a.siteId}::uuid AND actor_id=${a.access.actorId}::uuid AND key_hash=${websiteDocumentHash(a.idempotencyKey)} FOR UPDATE`
      : await db.$queryRaw`SELECT * FROM website_template_job WHERE company_id=${a.companyId}::uuid AND site_id=${a.siteId}::uuid AND actor_id=${a.access.actorId}::uuid AND key_hash=${websiteDocumentHash(a.idempotencyKey)}`
    return rows[0]
  }

  // a: { companyId, access (Website), idempotencyKey }, designId, fileContext: Studio/Files context of the actor.
  async function convert(a, designId, input, fileContext) {
    const body = studioWebsiteRequest.parse(input), site = { ...a, siteId: body.siteId }, requestHash = websiteDocumentHash({ designId, ...body, rasters: body.rasters.map(r => ({ ...r, base64: sha(r.base64) })) })
    if (typeof a.idempotencyKey !== 'string' || a.idempotencyKey.length < 16 || a.idempotencyKey.length > 200) throw fail('Falta la clave de idempotencia.', 422, 'idempotency_required')
    for (const permission of ['website.site.read', 'website.pages.create']) assertWebsiteAccess(a.access, a.companyId, permission)
    if (!await prisma.websiteSite.findFirst({ where: { id: body.siteId, companyId: a.companyId, enabled: true } })) throw notFound('Recurso')
    const previous = await job(site)
    if (previous) {
      if (previous.request_hash !== requestHash) throw fail('Este intento ya corresponde a otra conversión.', 409, 'idempotency_conflict')
      if (previous.state === 'committed') return previous.result
      throw fail('La conversión sigue en curso o se canceló. Inténtalo de nuevo.', 409, 'import_in_progress')
    }
    // Studio side: the actor must reach the design and every photo it shows.
    const design = await designs.get(a.companyId, a.access.actorId, designId)
    if (design.revision !== body.designRevision) throw fail('El diseño cambió. Vuelve a revisar la conversión.', 409, 'design_changed')
    const routes = new Set()
    const scenes = body.pages.map(target => {
      const scene = findPage(design.document, target.pageId)
      if (!scene) throw fail('Una página del diseño ya no existe.', 409, 'design_changed')
      websiteReleasePath(target.routePath)
      if (routes.has(target.routePath)) throw fail('Dos páginas usan la misma ruta.', 422, 'route_conflict')
      routes.add(target.routePath)
      return { target, scene }
    })
    if (routes.has('/')) assertWebsiteAccess(a.access, a.companyId, 'website.site.update')
    const photoIds = new Set(scenes.flatMap(({ scene }) => scene.objects.flatMap(item => { const { kind, shaped } = websiteKind(item, scene.page); return kind === 'image' ? [shaped ? item.fillPaint.fileAssetId : item.fileAssetId] : [] })))
    const wanted = scenes.flatMap(({ scene }) => rasterObjects(scene).map(item => `${scene.page.id}/${item.id}`))
    if (wanted.length !== body.rasters.length || body.rasters.some(r => !wanted.includes(`${r.pageId}/${r.objectId}`))) throw fail('Faltan o sobran imágenes de elementos. Vuelve a preparar la conversión.', 422, 'rasters_mismatch')
    if (photoIds.size || wanted.length) assertWebsiteAccess(a.access, a.companyId, 'files.assets.create')
    if (photoIds.size) await designs.access.assets(prisma, a.companyId, a.access.actorId, { objects: [...photoIds].map(fileAssetId => ({ type: 'image', fileAssetId })) }, designId, fileContext)

    // Bytes: authorized originals and checked object images, each identified by its SHA-256.
    const assets = new Map(), refs = { photo: new Map(), raster: new Map() }
    let total = 0
    const keep = (bytes, mime, name) => { total += bytes.length; if (bytes.length > MAX_IMAGE || total > MAX_TOTAL) throw fail('Las imágenes superan el límite de Website (8 MB por imagen).', 413, 'asset_too_large'); const key = sha(bytes); if (!assets.has(key)) assets.set(key, { sha256: key, mime, data: bytes, name }); return key }
    for (const id of photoIds) {
      const file = await prisma.fileAsset.findFirst({ where: { id, entityId: a.companyId, enabled: true } })
      if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.mimeType)) throw new StudioError('Una imagen no está disponible o no está autorizada.', 403, 'STUDIO_ASSET_DENIED')
      const bytes = await download(file)
      await validateImage(bytes, file.mimeType, { entry: MAX_IMAGE, imageSide: 8192, imagePixels: 25_000_000 })
      refs.photo.set(id, keep(bytes, file.mimeType, file.originalName ?? 'foto'))
    }
    for (const raster of body.rasters) {
      const scene = scenes.find(entry => entry.scene.page.id === raster.pageId).scene, b = raster.box
      if (b.x < -1 || b.y < -1 || b.x + b.width > scene.page.width + 1 || b.y + b.height > scene.page.height + 1) throw fail('Una imagen de elemento está fuera de la página.', 422, 'rasters_mismatch')
      const bytes = Buffer.from(raster.base64, 'base64')
      if (bytes.toString('base64') !== raster.base64) throw fail('Imagen de elemento no válida.', 422, 'rasters_mismatch')
      await validateImage(bytes, 'image/png', { entry: MAX_IMAGE, imageSide: 8192, imagePixels: 25_000_000 })
      refs.raster.set(`${raster.pageId}/${raster.objectId}`, { key: keep(bytes, 'image/png', `${raster.objectId}.png`), box: raster.box })
    }

    // Job row: one active conversion per idempotency key, under the importers' quota.
    const source = { kind: 'studio', designId, designRevision: design.revision, releaseId: designId }
    const row = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${a.companyId}::text,31))::text`
      await drafts.lockSite(tx, a.companyId, body.siteId)
      const current = await tx.websiteSite.findFirst({ where: { id: body.siteId, companyId: a.companyId, enabled: true } })
      if (!current) throw notFound('Recurso'); drafts.expected(current.draftRevision, body.expectedRevision)
      if (await job(site, tx)) throw fail('La conversión sigue en curso.', 409, 'import_in_progress')
      const [quota] = await tx.$queryRaw`SELECT count(*) FILTER(WHERE state IN ('preparing','cleanup'))::int AS count,count(*) FILTER(WHERE actor_id=${a.access.actorId}::uuid AND created_at>now()-interval '1 hour')::int AS rate FROM website_template_job WHERE company_id=${a.companyId}::uuid`
      if (quota.count >= 4 || quota.rate >= 20) throw fail('Hay demasiadas importaciones en curso. Reintenta en unos minutos.', 429, 'import_quota')
      const [created] = await tx.$queryRaw`INSERT INTO website_template_job(company_id,site_id,actor_id,key_hash,request_hash,source) VALUES(${a.companyId}::uuid,${body.siteId}::uuid,${a.access.actorId}::uuid,${websiteDocumentHash(a.idempotencyKey)},${requestHash},${JSON.stringify(source)}::jsonb) RETURNING *`
      return created
    })
    const staged = [], fileIds = new Map(), reused = []
    const heartbeat = setInterval(() => { void prisma.$queryRaw`UPDATE website_template_job SET lease_until=now()+interval '2 minutes',next_cleanup_at=now()+interval '2 minutes' WHERE id=${row.id}::uuid AND state='preparing'`.catch(() => {}) }, 30000); heartbeat.unref?.()
    try {
      for (const asset of assets.values()) {
        const existing = await prisma.fileAsset.findFirst({ where: { entityId: body.siteId, moduleKey: 'runly.website', enabled: true, visibility: 'PRIVATE', uploadedById: a.access.actorId, checksum: `sha256:${asset.sha256}`, metadata: { path: ['companyId'], equals: a.companyId } } })
        if (existing) { const bytes = await jobs.readFile(existing); if (sha(bytes) === asset.sha256 && existing.mimeType === asset.mime) { fileIds.set(asset.sha256, existing.id); reused.push(existing); continue } }
        const result = await filesService.upload({ activeContext: { companyId: a.companyId, profileId: a.access.actorId, isAdmin: a.access.isAdmin }, file: new File([asset.data], asset.name, { type: asset.mime }),
          fields: { moduleKey: 'runly.website', entityType: 'WebsiteSite', entityId: body.siteId, visibility: 'PRIVATE', metadata: { studioWebsite: { sha256: asset.sha256, designId } } },
          staging: { beforeStorage: async location => {
            staged.push({ ...location, sha256: asset.sha256 })
            const changed = await prisma.$queryRaw`UPDATE website_template_job SET staged=${JSON.stringify(staged)}::jsonb,lease_until=now()+interval '2 minutes' WHERE id=${row.id}::uuid AND state='preparing' RETURNING id`
            if (!changed.length) throw fail('La conversión se canceló.', 409, 'import_cancelled')
          } } })
        staged.at(-1).asset = { ...result.staged, entityId: body.siteId, checksum: `sha256:${asset.sha256}` }
      }
      return await prisma.$transaction(async tx => {
        await drafts.lockSite(tx, a.companyId, body.siteId)
        const locked = await job(site, tx, true)
        if (locked?.state !== 'preparing' || locked.request_hash !== requestHash) throw fail('La conversión se canceló.', 409, 'import_cancelled')
        const [now] = await tx.$queryRaw`SELECT revision FROM studio_design WHERE id=${designId}::uuid AND company_id=${a.companyId}::uuid`
        if (!now || now.revision !== design.revision) throw fail('El diseño cambió durante la conversión.', 409, 'design_changed')
        for (const file of reused) { await tx.$queryRaw`SELECT id FROM file_asset WHERE id=${file.id}::uuid FOR UPDATE`; const latest = await tx.fileAsset.findUnique({ where: { id: file.id } }); if (!latest?.enabled || latest.contentRevision !== file.contentRevision || latest.checksum !== file.checksum) throw fail('Una imagen del sitio cambió.', 409, 'asset_changed') }
        for (const item of staged) { const file = await tx.fileAsset.create({ data: item.asset }); fileIds.set(item.sha256, file.id) }
        const losses = new Set(), counts = { text: 0, image: 0, box: 0, raster: 0, group: 0 }
        const pages = scenes.map(({ target, scene }) => {
          const converted = convertStudioPage(scene, {
            image: id => ({ src: `file:${fileIds.get(refs.photo.get(id))}` }),
            raster: id => { const ref = refs.raster.get(`${scene.page.id}/${id}`); return ref && { src: `file:${fileIds.get(ref.key)}`, box: ref.box } },
          })
          converted.losses.forEach(loss => losses.add(loss)); for (const key of Object.keys(counts)) counts[key] += converted.counts[key]
          return { id: target.routePath, label: target.title, routePath: target.routePath, document: buildStudioWebsitePage({ sections: converted.sections, routePath: target.routePath, title: target.title }) }
        })
        const applied = await templates.applyBundle({ ...site, includeTheme: false, replaceExisting: body.replaceExisting, formMode: 'disabled', pageIds: pages.map(p => p.id), expectedRevision: body.expectedRevision, templateId: designId },
          { source, title: design.name, pages, themeTokens: null }, tx)
        const result = { ...applied, source, losses: [...losses], counts, assets: [...fileIds.values()], jobId: row.id }
        await tx.$queryRaw`UPDATE website_template_job SET state='committed',result=${JSON.stringify(result)}::jsonb,next_cleanup_at=NULL WHERE id=${row.id}::uuid`
        await tx.auditLog.create({ data: { actorId: a.access.actorId, companyId: a.companyId, moduleKey: 'runly.website', entityType: 'website.site', entityId: body.siteId, action: 'studio.website.converted', metadata: { designId, designRevision: design.revision, pageIds: applied.pages.map(p => p.id), assetIds: result.assets } } })
        return result
      }, { timeout: 30000 })
    } catch (error) { await jobs.compensate(row.id).catch(() => {}); throw error } finally { clearInterval(heartbeat) }
  }
  return { convert }
}
