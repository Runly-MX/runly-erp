import { createHash } from 'node:crypto'
import { writePackageZip } from './write.js'
import { validateImage } from './inspect.js'
import { packageError } from './errors.js'
import { WEBSITE_TEMPLATE, WEBSITE_ASSET_POLICY, WEBSITE_LIMITS, catalogDigest, validateWebsiteTemplate } from './website-template.js'

// Same format, same ZIP writer, same validator. No filesystem, network or template execution.
export async function exportWebsiteTemplate({ title, summary = '', locale = 'en', siteKind = 'website', pages, theme, assets = [], licenses = [], catalog, builderVersion = '0.3.5' }) {
  const entries = new Map(), records = []
  const sha = data => createHash('sha256').update(data).digest('hex')
  const definitions = new Map(catalog.blocks.map(block => [block.type, block]))
  function portableDefaults(sections) {
    return sections.map(section => {
      const definition = definitions.get(section.type), props = { ...section.props }
      // Atlas initializes optional selects to ''. Omission restores that exact
      // renderer default without admitting an unsupported explicit option in v2.
      for (const [key, value] of Object.entries(props)) {
        const field = definition?.fields[key]
        if (value === '' && definition?.defaultProps?.[key] === '' && field?.type === 'select' && !field.options?.includes('')) delete props[key]
      }
      return { ...section, props, ...(section.children ? { children: Object.fromEntries(Object.entries(section.children).map(([slot, nodes]) => [slot, portableDefaults(nodes)])) } : {}) }
    })
  }
  for (const [index, page] of pages.entries()) entries.set(`pages/page-${index + 1}.json`, Buffer.from(JSON.stringify(portableDefaults(page.sections))))
  if (theme) entries.set('theme.json', Buffer.from(JSON.stringify(theme)))
  for (const asset of assets) {
    const data = Buffer.from(asset.data), sha256 = sha(data), size = await validateImage(data, asset.mime)
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[asset.mime]
    const path = `assets/${sha256}.${ext}`
    if (records.some(a => a.sha256 === sha256)) throw packageError('manifest_invalid', 'El exportador recibió un activo duplicado.')
    records.push({ id: `asset-${sha256}`, path, mime: asset.mime, ...size, bytes: data.length, sha256, license: asset.license })
    entries.set(path, data)
  }
  for (const license of licenses) {
    if (!/^[a-z0-9_-]{1,60}$/.test(license.id) || entries.has(`licenses/${license.id}.txt`)) throw packageError('manifest_invalid', 'Identificador de licencia inválido o repetido.')
    entries.set(`licenses/${license.id}.txt`, Buffer.from(license.notice))
  }
  const manifest = {
    format: WEBSITE_TEMPLATE.format, formatVersion: 2, minReaderVersion: 2, assetPolicy: WEBSITE_ASSET_POLICY.name,
    builder: { name: WEBSITE_TEMPLATE.builder, min: builderVersion, catalogDigest: catalogDigest(catalog) },
    title, summary, locale, siteKind,
    pages: pages.map((page, index) => ({ path: page.path, title: page.title, isHome: page.isHome, file: `pages/page-${index + 1}.json` })),
    assets: records, forms: [], licenses: licenses.map(l => ({ id: l.id, path: `licenses/${l.id}.txt`, redistribution: l.redistribution })),
    document: { files: [...entries].map(([path, data]) => ({ path, bytes: data.length, sha256: sha(data) })) },
  }
  function forms(sections) {
    for (const section of sections) {
      if (['@contact', '@newsletter'].includes(section.props?.formId) && !manifest.forms.includes(section.props.formId)) manifest.forms.push(section.props.formId)
      for (const children of Object.values(section.children ?? {})) forms(children)
    }
  }
  for (const page of pages) forms(page.sections)
  const bytes = await writePackageZip([['mimetype', Buffer.from(WEBSITE_TEMPLATE.mime)], ['manifest.json', Buffer.from(JSON.stringify(manifest))], ...entries], { limit: WEBSITE_LIMITS.compressed })
  const validation = await validateWebsiteTemplate(bytes, { builderCatalogs: { [builderVersion]: catalog } })
  if (!validation.ok) throw packageError(validation.errors[0].code, validation.errors[0].message)
  return { bytes, validation }
}
