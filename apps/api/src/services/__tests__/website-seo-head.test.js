import test from 'node:test'
import assert from 'node:assert/strict'
import { websiteSeoHead, requestOrigin } from '../website-seo-head.js'

const page = { id: 'p1', title: 'Servicios', routePath: '/servicios', publishedBuilderData: { blocks: {}, regions: { main: { children: [] } } }, seo: { description: 'Lo que hacemos', ogTitle: 'Servicios <b>', robots: { index: false, follow: true } } }

test('published head carries absolute canonical, Open Graph and robots, all escaped', () => {
  const head = websiteSeoHead({ page, identity: { name: 'Maya "Studio"', seoDefaults: {} }, origin: 'https://sitio.example.com' })
  assert.match(head, /<title>Servicios<\/title>/)
  assert.match(head, /rel="canonical" href="https:\/\/sitio\.example\.com\/servicios"/)
  assert.match(head, /property="og:title" content="Servicios &lt;b&gt;"/)
  assert.match(head, /name="robots" content="noindex,follow"/)
  assert.doesNotMatch(head, /<b>/)
})

const request = (headers, url = 'http://internal:4010/x') => ({ req: { url, header: (name) => headers[name] } })

test('request origin follows the proxy headers and ignores malformed hosts', () => {
  assert.equal(requestOrigin(request({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'app.example.com' })), 'https://app.example.com')
  assert.equal(requestOrigin(request({ host: 'a.example.com' })), 'http://a.example.com')
  assert.equal(requestOrigin(request({ host: 'evil.com/<script>' })), 'http://internal:4010')
})
