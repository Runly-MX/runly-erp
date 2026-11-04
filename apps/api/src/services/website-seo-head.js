import { renderSeoHead } from '@raulbellosom/atlas-web-builder'

// Public origin of the request (instance domain or a future custom domain), so canonical and og:url are absolute
// without storing a base URL. Responses are never cached (Cache-Control: no-store), so a spoofed Host only affects the
// spoofer's own response.
export function requestOrigin(c) {
  const first = (name) => c.req.header(name)?.split(',')[0].trim()
  const url = new URL(c.req.url)
  const proto = first('x-forwarded-proto') === 'https' ? 'https' : url.protocol.replace(':', '')
  const host = first('x-forwarded-host') || c.req.header('host') || url.host
  return /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? `${proto}://${host}` : url.origin
}

// <head> tags (title, description, robots, canonical, Open Graph, Twitter, JSON-LD) for a published page. All values
// are HTML-escaped by the package; `page.seo` is the per-page SEO sealed in the release.
export function websiteSeoHead({ page, identity, origin }) {
  const document = { ...(page.publishedBuilderData ?? {}), title: page.title, slug: page.routePath, visibility: 'public', seo: page.seo ?? page.publishedBuilderData?.seo ?? {} }
  const site = { name: identity?.name, locale: 'es-MX', settings: { ...(identity?.settings ?? {}), defaultSeo: identity?.seoDefaults ?? {} } }
  return renderSeoHead(document, site, { baseUrl: origin })
}
