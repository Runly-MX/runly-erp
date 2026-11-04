// Puts the person's brand into a template document: the navbar gets the name and (when given) the logo,
// the footer the name. Logo is a `file:<id>` reference, the form the release pipeline pins and publishes.
export const LOGO_HEIGHTS = ['24', '32', '40', '48', '64']
const nearestHeight = (value) => LOGO_HEIGHTS.reduce((best, h) => (Math.abs(h - value) < Math.abs(best - value) ? h : best), LOGO_HEIGHTS[2])

export function applyTemplateBranding(document, { name, logoFileId, logoHeight } = {}) {
  for (const block of Object.values(document?.blocks ?? {})) {
    if (!['NavbarBlock', 'StoreNavbarBlock', 'FooterBlock', 'SiteFooterBlock'].includes(block.type)) continue
    const previous = block.props.brand
    if (name) {
      block.props.brand = name
      // Templates repeat the placeholder brand in the copyright line.
      if (previous && typeof block.props.copyright === 'string') block.props.copyright = block.props.copyright.replaceAll(previous, name)
    }
    if (block.type === 'NavbarBlock' && logoFileId) {
      block.props.logoSrc = `file:${logoFileId}`
      block.props.logoHeight = nearestHeight(Number(logoHeight) || 40)
    }
  }
  return document
}
