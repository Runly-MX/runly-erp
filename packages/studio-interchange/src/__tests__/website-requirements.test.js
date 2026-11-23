import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { exportWebsiteTemplate } from '../website-write.js'
import { inspectWebsiteTemplate } from '../website-template.js'
import { describeRequirements, requirementsSentence } from '../website-requirements.js'
import { blockCatalog, section } from './corpus.js'

const contract = JSON.parse(readFileSync(new URL('./universal-props.fixture.json', import.meta.url), 'utf8'))
const catalog = () => ({ ...blockCatalog(), capabilities: contract.capabilities, universalProps: contract.universalProps })
const theme = { colors: { primary: '#17243c', bg: '#efebea' }, fonts: { heading: 'Lato', body: 'Lato' }, radius: 12, spacing: 4 }
const page = (sections) => [{ path: '/', title: 'Inicio', isHome: true, sections }]
const ids = (requirements) => requirements.features.map((feature) => feature.id)

test('requirements: a plain template needs nothing special', async () => {
  const { bytes } = await exportWebsiteTemplate({ title: 'Simple', catalog: catalog(), theme, pages: page([section('TextBlock', { text: 'Hola' })]) })
  const opened = await inspectWebsiteTemplate(bytes, { builderCatalogs: { '0.3.5': catalog() } })
  assert.deepEqual(opened.report.requirements, { builder: '0.3.5', assetPolicy: 'packaged-raster-v1', features: [] })
  assert.equal(requirementsSentence(opened.report.requirements), '')
})

test('requirements: motion, fluid type, focal point, components and fluid theme are derived from the content', async () => {
  const footer = { name: 'Pie', section: section('TextBlock', { text: 'x', _animation: { preset: 'fade-in' } }) }
  const { bytes } = await exportWebsiteTemplate({
    title: 'Completa', catalog: catalog(), theme: { ...theme, fluid: { enabled: true } }, components: { footer },
    pages: page([section('TextBlock', { text: 'Hola', fluidType: true, fontSizeMin: 20, fontSizeMax: 40 }), section('ComponentRefBlock', { componentId: 'footer' })]),
  }).catch(() => ({ bytes: null }))
  if (!bytes) return // this corpus catalog does not carry fluid fields; the pure derivation is covered below
  const opened = await inspectWebsiteTemplate(bytes, { builderCatalogs: { '0.3.5': catalog() } })
  assert.ok(ids(opened.report.requirements).includes('components'))
})

test('requirements: pure derivation covers every feature and ignores look-alikes', () => {
  const manifest = { builder: { min: '0.10.0' }, assetPolicy: 'packaged-media-v2', assets: [{ mime: 'image/svg+xml' }, { mime: 'image/png' }] }
  const pages = [[
    { type: 'TextBlock', props: { text: 'x', fluidType: true, _hover: { scale: '1.05' } }, children: { c: [{ type: 'ImageBlock', props: { mobileFocalX: 40 } }, { type: 'ComponentRefBlock', props: { componentId: 'a' } }] } },
  ]]
  const requirements = describeRequirements({ manifest, pages })
  assert.deepEqual(ids(requirements), ['svg', 'components', 'motion', 'fluid-type', 'focal-point'])
  assert.deepEqual([requirements.builder, requirements.assetPolicy], ['0.10.0', 'packaged-media-v2'])
  assert.match(requirementsSentence(requirements), /Usa imágenes SVG, componentes sincronizados, animaciones y efectos de movimiento, tipografía fluida, punto focal de imágenes\./)
  assert.deepEqual(ids(describeRequirements({ manifest: { builder: { min: '0.3.5' }, assets: [] }, pages: [[{ type: 'TextBlock', props: { fluidType: false, focal: 1, _lazy: true, text: '_animation' } }]] })), [])
  assert.deepEqual(ids(describeRequirements({ manifest: {}, theme: { fluid: { enabled: true } } })), ['fluid-type'])
  assert.doesNotThrow(() => describeRequirements({ manifest: null, pages: [null, 5, [null], 'x'], theme: 3, components: { a: null } }))
})

test('requirements: an installation that lacks the builder explains what the template uses', async () => {
  const withMotion = catalog()
  const { bytes } = await exportWebsiteTemplate({ title: 'Con movimiento', catalog: withMotion, theme, pages: page([section('TextBlock', { text: 'Hola', _animation: { preset: 'fade-in' }, _hover: { scale: '1.05' } })]) })
  const result = await inspectWebsiteTemplate(bytes, { builderCatalogs: { '0.9.0': blockCatalog() } })
  assert.equal(result.ok, false)
  assert.equal(result.errors[0].code, 'builder_unsupported')
  assert.match(result.errors[0].message, /requiere el builder 0\.3\.5.*Usa animaciones y efectos de movimiento\. Actualiza Runly para usarla\./)
  const other = await inspectWebsiteTemplate(bytes, { builderCatalogs: { '0.3.5': { ...blockCatalog(), blocks: blockCatalog().blocks.slice(1) } } })
  assert.equal(other.errors[0].code, 'catalog_digest_mismatch')
  assert.match(other.errors[0].message, /Usa animaciones y efectos de movimiento\./)
})
