import { createHash } from 'node:crypto'
import { inspectWebsiteTemplate } from '@runly/studio-interchange/website-template'
import { sectionsToAtlasPage, mapWebsiteImages, websiteThemeToAtlasTokens } from '@runly/studio-interchange/website-document'
import { normalizeWebsiteDocument } from './website-draft-service.js'
import { assertWebsiteAccess } from './website-authorization-service.js'
import { WebsiteServiceError, notFound } from '../routes/website/service-helpers.js'

// W1 preparation only: no route, installer, writes or publication. W3 persists via Files
// and supplies same-site bindings; the existing release service snapshots file:<id> privately.
export function createWebsiteTemplatePreparationService({ prisma, files, readFile, builderCatalogs }) {
  async function prepare({ bytes, companyId, siteId, access, bindings = {} }) {
    assertWebsiteAccess(access, companyId, 'website.pages.create')
    const site = await prisma.websiteSite.findFirst({ where: { id: siteId, companyId, enabled: true } })
    if (!site) throw notFound('Recurso')
    const inspected = await inspectWebsiteTemplate(bytes, { builderCatalogs })
    if (!inspected.ok) return { readyForDraft: false, validation: inspected }
    const { content, ...validation } = inspected
    const mapped = new Map(), missingAssets = [], assetBindings = []
    for (const key of Object.keys(bindings)) if (!content.assets.some(a => a.sha256 === key)) throw new WebsiteServiceError('Binding de imagen desconocido.', 422, 'asset_missing')
    for (const asset of content.assets) {
      const fileId = bindings[asset.sha256]
      if (!fileId) { missingAssets.push(asset.sha256); continue }
      if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(fileId)) throw notFound('Recurso')
      const file = await prisma.fileAsset.findFirst({ where: { id: fileId, entityId: siteId, moduleKey: 'runly.website', enabled: true } })
      if (!file || !files?.assertAccess || !readFile) throw notFound('Recurso')
      await files.assertAccess(file, { profileId: access.actorId, admin: access.isAdmin })
      if (file.mimeType !== asset.mime || file.sizeBytes !== asset.bytes || file.sizeBytes > 8 * 1024 * 1024 || file.checksum?.replace(/^sha256:/, '') !== asset.sha256) throw new WebsiteServiceError('El archivo no coincide con la imagen de la plantilla.', 422, 'asset_checksum_mismatch')
      const data = await readFile(file)
      if (data.length !== asset.bytes || createHash('sha256').update(data).digest('hex') !== asset.sha256) throw new WebsiteServiceError('El archivo cambió.', 409, 'asset_changed')
      const latest = await prisma.fileAsset.findFirst({ where: { id: fileId, entityId: siteId, moduleKey: 'runly.website', enabled: true } })
      if (!latest || latest.contentRevision !== file.contentRevision || latest.objectKey !== file.objectKey || latest.checksum !== file.checksum) throw new WebsiteServiceError('El archivo cambió.', 409, 'asset_changed')
      mapped.set(`asset:${asset.sha256}`, `file:${file.id}`)
      assetBindings.push({ sha256: asset.sha256, fileId: file.id, contentRevision: file.contentRevision })
    }
    const catalog = builderCatalogs[inspected.manifest.builder.min]
    const pages = content.pages.map(page => ({ path: page.path, title: page.title, isHome: page.isHome, document: normalizeWebsiteDocument(mapWebsiteImages(sectionsToAtlasPage(page), catalog, ref => mapped.get(ref) ?? ref), { strict: true }) }))
    // W3 pins background.url in releases and consumes font.heading in the trusted renderer stylesheet.
    return { validation, pages, portableTheme: content.theme, themeTokens: websiteThemeToAtlasTokens(content.theme ?? {}), assets: inspected.manifest.assets, assetBindings, missingAssets, requiredForms: inspected.manifest.forms, requiredCapabilities: [], readyForDraft: missingAssets.length === 0 && inspected.manifest.forms.length === 0, expectedRevision: site.draftRevision }
  }
  return { prepare }
}
