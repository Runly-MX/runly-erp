// Turns the sections produced by shared/studio/website-conversion.js into a stored Atlas
// draft page, through the same checks as any other Website page: catalog props (types,
// options, ranges, safe text) via sectionsToDocument, underscore effects via the effects
// whitelist, and the strict structural normalization of drafts.
import { sectionsToAtlasPage } from '@runly/studio-interchange/website-document'
import { PageDocumentError, sectionsToDocument } from '../../routes/website/page-document.js'
import { isValidEffect } from '../website-block-effects.js'
import { normalizeWebsiteDocument } from '../website-draft-service.js'

const FILE_REF = /^file:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

export function buildStudioWebsitePage({ sections, routePath, title }) {
  const problems = []
  // The catalog validator only knows https or /path images: file:<id> refs are checked here.
  function catalogView(node, path) {
    const props = {}
    for (const [key, value] of Object.entries(node.props ?? {})) {
      if (key.startsWith('_')) { if (!isValidEffect(key, value)) problems.push(`${path}.props.${key}: efecto no válido`); continue }
      if (typeof value === 'string' && value.startsWith('file:')) { if (!FILE_REF.test(value)) problems.push(`${path}.props.${key}: referencia de imagen no válida`); props[key] = '/studio-image.png'; continue }
      props[key] = value
    }
    const children = node.children && Object.fromEntries(Object.entries(node.children).map(([slot, list]) => [slot, list.map((child, index) => catalogView(child, `${path}.children.${slot}[${index}]`))]))
    return { type: node.type, props, ...(children ? { children } : {}) }
  }
  sectionsToDocument({ id: 'studio-check', slug: routePath, title, sections: sections.map((section, index) => catalogView(section, `sections[${index}]`)) })
  if (problems.length) throw new PageDocumentError(problems)
  return normalizeWebsiteDocument(sectionsToAtlasPage({ sections, path: routePath, title }, { id: 'studio-page' }), { strict: true })
}
