import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { exportWebsiteTemplate } from '../website-write.js'
import { inspectWebsiteTemplate, validateWebsiteTemplate, catalogDigest } from '../website-template.js'
import { readZip } from '../zip-reader.js'
import { writePackageZip } from '../write.js'
import { WEBSITE_TEMPLATE } from '../website-template.js'
import { validateEffectProp, isEffectProp, catalogCapabilities } from '../website-effects.js'
import { websiteThemeToAtlasTokens } from '../website-document.js'
import { blockCatalog, section } from './corpus.js'

const contract = JSON.parse(readFileSync(new URL('./universal-props.fixture.json', import.meta.url), 'utf8'))
const sha = (b) => createHash('sha256').update(b).digest('hex')
const withContract = () => ({ ...blockCatalog(), capabilities: contract.capabilities, universalProps: contract.universalProps })
const theme = { colors: { primary: '#17243c', bg: '#efebea' }, fonts: { heading: 'Lato', body: 'Lato' }, radius: 12, spacing: 4 }
const everyEffect = {
  _animation: { preset: 'slide-up', duration: 700, delay: 100, easing: 'ease-out', distance: 60, once: false }, _scrollReveal: true, _stagger: 100,
  _kenburns: { zoom: 1.2, direction: 'in', pan: 'left', duration: 9000, easing: 'ease-in-out' }, _pressed: { scale: 0.96, brightness: 90 },
  _parallax: { speed: 0.2 }, _hover: { scale: '1.05', shadow: 'md', brightness: 105, duration: 150, easing: 'ease' },
  _transform: { rotate: 2, skewX: 0, skewY: 0 }, _filter: { blur: 0, brightness: 100, contrast: 100, grayscale: 0, sepia: 0 }, _opacity: 0.95, _cursor: 'pointer', _zIndex: 2, _sticky: false, _lazy: true, _lazyMinHeight: 240,
}
const build = (props = everyEffect, catalog = withContract(), extra = {}) => exportWebsiteTemplate({ title: 'Efectos', catalog, theme, pages: [{ path: '/', title: 'Inicio', isHome: true, sections: [section('TextBlock', { text: 'Hola', ...props })] }], ...extra })
const open = (bytes, catalog = withContract()) => inspectWebsiteTemplate(bytes, { builderCatalogs: { '0.3.5': catalog } })
async function edit(bytes, change) {
  const entries = await readZip(bytes, { mimetype: WEBSITE_TEMPLATE.mime, folders: ['assets', 'previews', 'licenses', 'pages'] })
  const manifest = JSON.parse(entries.get('manifest.json'))
  await change(manifest, entries)
  manifest.document.files = [...entries].filter(([name]) => !['mimetype', 'manifest.json'].includes(name)).map(([path, data]) => ({ path, bytes: data.length, sha256: sha(data) }))
  entries.set('manifest.json', Buffer.from(JSON.stringify(manifest)))
  return writePackageZip([...entries])
}

test('effects: every universal prop survives export, inspect, import and re-export byte for byte', async () => {
  const first = await build()
  assert.equal(first.validation.ok, true, JSON.stringify(first.validation.errors))
  const opened = await open(first.bytes)
  assert.equal(opened.ok, true, JSON.stringify(opened.errors))
  const props = opened.content.pages[0].sections[0].props
  assert.deepEqual(Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith('_'))), everyEffect)
  const second = await build(Object.fromEntries(Object.entries(props).filter(([key]) => key !== 'text')))
  assert.deepEqual(second.bytes, first.bytes, 'export -> inspect -> export is byte-identical')
})

test('effects: values outside the contract are rejected with the exact path and code', async () => {
  const cases = [
    [{ _animation: { preset: 'slide-up', duration: 99999 } }, 'effect_invalid', '._animation.duration'],
    [{ _animation: { preset: 'explode' } }, 'effect_invalid', '._animation.preset'],
    [{ _kenburns: { zoom: 3 } }, 'effect_invalid', '._kenburns.zoom'],
    [{ _pressed: { scale: 0.1 } }, 'effect_invalid', '._pressed.scale'],
    [{ _hover: { scale: 'javascript:1' } }, 'effect_invalid', '._hover.scale'],
    [{ _opacity: 4 }, 'effect_invalid', '._opacity'],
    [{ _nope: 1 }, 'effect_unknown', '._nope'],
  ]
  for (const [props, code, path] of cases) {
    await assert.rejects(build(props), (error) => error.reason === code && String(error.message).includes(path.slice(1)), JSON.stringify(props))
  }
})

test('effects: a catalog without the contract keeps rejecting `_` props (older readers fail closed)', async () => {
  await assert.rejects(build(everyEffect, blockCatalog()), { reason: 'prop_unknown' })
  assert.equal(catalogCapabilities(blockCatalog()), null)
  assert.deepEqual(catalogCapabilities(withContract()), { motion: 1, responsive: 1 })
})

test('effects: tampering after export is caught by the reader', async () => {
  const { bytes } = await build({ _opacity: 0.5 })
  const tampered = await edit(bytes, (manifest, files) => {
    const page = JSON.parse(files.get(manifest.pages[0].file)); page[0].props._animation = { preset: 'slide-up', duration: 1e9 }; page[0].props._evil = true
    files.set(manifest.pages[0].file, Buffer.from(JSON.stringify(page)))
  })
  const result = await validateWebsiteTemplate(tampered, { builderCatalogs: { '0.3.5': withContract() } })
  assert.equal(result.ok, false)
  assert.deepEqual(result.errors.map((e) => e.code).sort(), ['effect_invalid', 'effect_unknown'])
})

test('effects: pre-Phase-3 documents are untouched and the catalog digest covers the contract', async () => {
  const plain = await exportWebsiteTemplate({ title: 'Sin efectos', catalog: blockCatalog(), theme, pages: [{ path: '/', title: 'Inicio', isHome: true, sections: [section('TextBlock', { text: 'Hola' })] }] })
  const plainAgain = await exportWebsiteTemplate({ title: 'Sin efectos', catalog: withContract(), theme, pages: [{ path: '/', title: 'Inicio', isHome: true, sections: [section('TextBlock', { text: 'Hola' })] }] })
  assert.equal(plain.validation.ok, true)
  assert.notEqual(catalogDigest(blockCatalog()), catalogDigest(withContract()), 'the contract is part of the catalog identity')
  assert.equal((await open(plainAgain.bytes)).ok, true)
})

test('effects: grammar errors, prototype keys and hostile specs never throw', () => {
  const specs = contract.universalProps
  assert.equal(isEffectProp('_animation'), true); assert.equal(isEffectProp('text'), false); assert.equal(isEffectProp(5), false)
  for (const name of ['__proto__', 'constructor', 'toString', '_missing', '']) assert.equal(validateEffectProp(name, {}, specs).ok, false)
  assert.equal(validateEffectProp('_animation', { preset: 'fade-in', __proto__x: 1 }, specs).ok, false)
  assert.equal(validateEffectProp('_opacity', 0.5, null).errors[0].code, 'effect_unknown')
  assert.equal(validateEffectProp('_opacity', 0.5, { _opacity: { type: 'weird' } }).errors[0].code, 'effect_invalid')
  assert.equal(validateEffectProp('_hover', { scale: 'x'.repeat(100) }, specs).ok, false)
})

test('effects: the shipped contract matches the Atlas package when it exposes one (drift guard)', () => {
  let atlas
  try { atlas = createRequire(import.meta.url)('@raulbellosom/atlas-web-builder') } catch { atlas = null }
  if (!atlas?.UNIVERSAL_PROPS) return // Atlas older than 0.10.0 has no contract yet
  assert.deepEqual(JSON.parse(JSON.stringify(atlas.UNIVERSAL_PROPS)), contract.universalProps)
  assert.deepEqual(JSON.parse(JSON.stringify(atlas.UNIVERSAL_CAPABILITIES)), contract.capabilities)
  // Parity: the grammar implemented here accepts and rejects exactly what Atlas does, including boundary values.
  const probes = [0, 1, -1, 0.5, 0.9, 1.5, 1.51, 5000, 5001, 400, 401, 40, 41, 30000, 2999, NaN, Infinity, '1', '', true, null, undefined, 'slide-up', 'ease', '1.05', 'x']
  for (const name of Object.keys(contract.universalProps)) {
    for (const probe of probes) assert.equal(validateEffectProp(name, probe, contract.universalProps).ok, atlas.validateUniversalProp(name, probe).ok, `${name} <- ${String(probe)}`)
    for (const key of Object.keys(contract.universalProps[name].keys ?? {})) for (const probe of probes) assert.equal(validateEffectProp(name, { [key]: probe }, contract.universalProps).ok, atlas.validateUniversalProp(name, { [key]: probe }).ok, `${name}.${key} <- ${String(probe)}`)
  }
})

test('effects: the theme carries the fluid scale to Atlas tokens and rejects bad ranges', async () => {
  const { bytes, validation } = await build({}, withContract(), { theme: { ...theme, fluid: { enabled: true, minViewport: 360, maxViewport: 1280 } } })
  assert.equal(validation.ok, true, JSON.stringify(validation.errors))
  const opened = await open(bytes)
  assert.deepEqual(websiteThemeToAtlasTokens(opened.content.theme).fluid, { enabled: true, minViewport: 360, maxViewport: 1280 })
  const bad = await edit(bytes, (m, f) => { f.set('theme.json', Buffer.from(JSON.stringify({ ...theme, fluid: { enabled: true, minViewport: 5 } }))) })
  assert.ok((await validateWebsiteTemplate(bad, { builderCatalogs: { '0.3.5': withContract() } })).errors.some((e) => e.code === 'theme_invalid'))
})

test('effects: capability descriptors are exported for hosts', async () => {
  const { WEBSITE_EFFECTS, WEBSITE_RESPONSIVE } = await import('../website-template.js')
  assert.equal(WEBSITE_EFFECTS.table, 'catalog.universalProps')
  assert.deepEqual(WEBSITE_EFFECTS.errors, ['effect_invalid', 'effect_unknown'])
  assert.deepEqual(WEBSITE_RESPONSIVE.overflowAudit.widths, [320, 375, 414, 768, 1024, 1280, 1440, 1920])
  assert.equal(Object.isFrozen(WEBSITE_RESPONSIVE.fluidType.props), true)
})
