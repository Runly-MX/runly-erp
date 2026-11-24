import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { exportWebsiteTemplate } from '../website-write.js'
import { inspectWebsiteTemplate } from '../website-template.js'
import { describeRequirements, requirementsSentence } from '../website-requirements.js'
import { section } from './corpus.js'

// The ERP catalog is the one that knows the commerce blocks.
const catalog = JSON.parse(readFileSync(new URL('../../../../apps/api/src/routes/website/block-catalog.json', import.meta.url), 'utf8'))
const theme = { colors: { primary: '#17243c', bg: '#efebea' }, fonts: { heading: 'Lato', body: 'Lato' }, radius: 12, spacing: 4 }
const pages = (sections, extra = []) => [{ path: '/', title: 'Inicio', isHome: true, sections }, ...extra]
const build = (sections, siteKind = 'ecommerce') => exportWebsiteTemplate({ title: 'Tienda', catalog, siteKind, builderVersion: '0.9.3', theme, pages: pages(sections, [{ path: '/cuenta', title: 'Cuenta', isHome: false, sections: [section('AccountPortalBlock', {})] }]) })
const inspect = (bytes) => inspectWebsiteTemplate(bytes, { builderCatalogs: { '0.9.3': catalog } })

test('commerce: cart, cart page and account portal travel in a template as markers', async () => {
  const { bytes, validation } = await build([section('CartBlock', {}), section('CartPageBlock', {}), section('TextBlock', { text: 'Hola' })])
  assert.equal(validation.ok, true, JSON.stringify(validation.errors))
  const opened = await inspect(bytes)
  assert.equal(opened.ok, true)
  assert.deepEqual(opened.report.requirements.features.map((f) => f.id), ['commerce', 'accounts'])
  assert.equal(opened.report.blockTypes.CartBlock, 1)
  assert.equal(opened.report.blockTypes.AccountPortalBlock, 1)
})

test('commerce: a cart bound to a site id is rejected so a template never carries a destination', async () => {
  await assert.rejects(build([section('CartBlock', { siteId: '00000000-0000-4000-8000-000000000001' })]), (error) => error.reason === 'prop_invalid' && /carrito se vincula al sitio/.test(error.message))
})

test('commerce: the account portal works on any site kind, the cart needs a store site', async () => {
  const accounts = await exportWebsiteTemplate({ title: 'Blog con cuentas', catalog, siteKind: 'blog', builderVersion: '0.9.3', theme, pages: pages([section('AccountPortalBlock', {})]) })
  assert.equal(accounts.validation.ok, true, JSON.stringify(accounts.validation.errors))
  await assert.rejects(exportWebsiteTemplate({ title: 'Blog con carrito', catalog, siteKind: 'blog', builderVersion: '0.9.3', theme, pages: pages([section('CartBlock', {})]) }), { reason: 'block_unknown' })
})

test('commerce: embedded video stays excluded from templates; VideoBlock travels only with a packaged file', async () => {
  // Atlas >= 0.11 catalogs know VideoBlock (with `file`); a third-party URL is still never portable.
  await assert.rejects(exportWebsiteTemplate({ title: 'Video', catalog, siteKind: 'website', builderVersion: '0.9.3', theme, pages: pages([section('VideoBlock', { src: 'https://youtu.be/abc' })]) }), { reason: 'prop_invalid' })
})

test('commerce: requirement sentences name the cart and the accounts for installations that cannot open the template', () => {
  const requirements = describeRequirements({ manifest: { builder: { min: '0.9.3' }, assets: [] }, pages: [[{ type: 'CartPageBlock', props: {} }, { type: 'AccountPortalBlock', props: {}, children: {} }]] })
  assert.deepEqual(requirements.features.map((f) => f.id), ['commerce', 'accounts'])
  assert.match(requirementsSentence(requirements), /Usa carrito y pagos, cuentas de clientes\./)
  assert.deepEqual(describeRequirements({ manifest: {}, pages: [[{ type: 'ProductsGridBlock', props: {} }]] }).features, [])
})
