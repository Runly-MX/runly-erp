import { createHash } from 'node:crypto'
import { inspectWebsiteTemplate, resolveWebsiteCatalog, WEBSITE_AV_MIMES } from '@runly/studio-interchange/website-template'
import { WEBSITE_AV_MAX_BYTES } from './files-service.js'
import { sectionsToAtlasPage, mapWebsiteImages, websiteThemeToAtlasTokens } from '@runly/studio-interchange/website-document'
import { normalizeWebsiteDocument } from './website-draft-service.js'
import { assertWebsiteAccess } from './website-authorization-service.js'
import { WebsiteServiceError, notFound } from '../routes/website/service-helpers.js'

// W1 preparation only: no route, installer, writes or publication. W3 persists via Files
// and supplies same-site bindings; the existing release service snapshots file:<id> privately.
export function createWebsiteTemplatePreparationService({ prisma, files, readFile, builderCatalogs, builderCatalogIdentities }) {
  async function prepare({ bytes, companyId, siteId, access, bindings = {} }) {
    assertWebsiteAccess(access, companyId, 'website.pages.create')
    const site = await prisma.websiteSite.findFirst({ where: { id: siteId, companyId, enabled: true } })
    if (!site) throw notFound('Recurso')
    const inspected = await inspectWebsiteTemplate(bytes, { builderCatalogs, builderCatalogIdentities })
    if (!inspected.ok) return { readyForDraft: false, validation: inspected }
    const { content, ...validation } = inspected
    const mapped = new Map(), missingAssets = [], assetBindings = []
    // A packaged video brings its WebP poster as a second file; both are bound like any other asset.
    const units = content.assets.flatMap(a => [a, ...(a.poster ? [{ ...a.poster, mime: 'image/webp' }] : [])])
    for (const key of Object.keys(bindings)) if (!units.some(a => a.sha256 === key)) throw new WebsiteServiceError('Binding de imagen desconocido.', 422, 'asset_missing')
    for (const asset of units) {
      const fileId = bindings[asset.sha256]
      if (!fileId) { missingAssets.push(asset.sha256); continue }
      if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(fileId)) throw notFound('Recurso')
      const file = await prisma.fileAsset.findFirst({ where: { id: fileId, entityId: siteId, moduleKey: 'runly.website', enabled: true } })
      if (!file || !files?.assertAccess || !readFile) throw notFound('Recurso')
      await files.assertAccess(file, { profileId: access.actorId, admin: access.isAdmin })
      if (file.mimeType !== asset.mime || file.sizeBytes !== asset.bytes || file.sizeBytes > (WEBSITE_AV_MIMES.includes(asset.mime) ? WEBSITE_AV_MAX_BYTES : 8 * 1024 * 1024) || file.checksum?.replace(/^sha256:/, '') !== asset.sha256) throw new WebsiteServiceError('El archivo no coincide con la imagen de la plantilla.', 422, 'asset_checksum_mismatch')
      const data = await readFile(file)
      if (data.length !== asset.bytes || createHash('sha256').update(data).digest('hex') !== asset.sha256) throw new WebsiteServiceError('El archivo cambió.', 409, 'asset_changed')
      const latest = await prisma.fileAsset.findFirst({ where: { id: fileId, entityId: siteId, moduleKey: 'runly.website', enabled: true } })
      if (!latest || latest.contentRevision !== file.contentRevision || latest.objectKey !== file.objectKey || latest.checksum !== file.checksum) throw new WebsiteServiceError('El archivo cambió.', 409, 'asset_changed')
      mapped.set(`asset:${asset.sha256}`, `file:${file.id}`)
      assetBindings.push({ sha256: asset.sha256, fileId: file.id, contentRevision: file.contentRevision })
    }
    const posters = new Map(content.assets.filter(a => a.poster && mapped.has(`asset:${a.poster.sha256}`)).map(a => [`asset:${a.sha256}`, mapped.get(`asset:${a.poster.sha256}`)]))
    const catalog = resolveWebsiteCatalog(builderCatalogs, builderCatalogIdentities, inspected.manifest.builder.min, inspected.manifest.builder.catalogDigest)
    const pages = content.pages.map(page => ({ path: page.path, title: page.title, isHome: page.isHome, document: normalizeWebsiteDocument(mapWebsiteImages(sectionsToAtlasPage({ ...page, sections: page.resolved ?? page.sections }), catalog, ref => mapped.get(ref) ?? ref, ref => posters.get(ref) ?? null), { strict: true }) }))
    // W3 pins background.url in releases and consumes font.heading in the trusted renderer stylesheet.
    return { validation, pages, portableTheme: content.theme, themeTokens: websiteThemeToAtlasTokens(content.theme ?? {}), assets: inspected.manifest.assets, assetBindings, missingAssets, requiredForms: inspected.manifest.forms, requiredCapabilities: [], readyForDraft: missingAssets.length === 0 && inspected.manifest.forms.length === 0, expectedRevision: site.draftRevision }
  }
  return { prepare }
}
