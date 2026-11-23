import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { exportWebsiteTemplate } from '../website-write.js'
import { inspectWebsiteTemplate, validateWebsiteTemplate, WEBSITE_COMPONENTS } from '../website-template.js'
import { readZip } from '../zip-reader.js'
import { writePackageZip } from '../write.js'
import { WEBSITE_TEMPLATE } from '../website-template.js'
import { COMPONENT_REF_TYPE } from '../website-components.js'
import { blockCatalog, builderCatalogs, section } from './corpus.js'

const sha = (b) => createHash('sha256').update(b).digest('hex')
const theme = { colors: { primary: '#17243c', bg: '#efebea' }, fonts: { heading: 'Lato', body: 'Lato' }, radius: 12, spacing: 4 }
const footer = { name: 'Pie', section: section('SectionBlock', {}, { children: [section('TextBlock', { text: 'Hecho en Runly' }), section('TextBlock', { text: 'Contacto' })] }) }
const ref = (props) => section(COMPONENT_REF_TYPE, props)
const page = (path, title, sections, isHome = false) => ({ path, title, isHome, sections })

const build = (extra = {}) => exportWebsiteTemplate({
  title: 'Con componentes', catalog: blockCatalog(), theme, components: { footer },
  pages: [page('/', 'Inicio', [section('TextBlock', { text: 'Inicio' }), ref({ componentId: 'footer' })], true), page('/contacto', 'Contacto', [ref({ componentId: 'footer', overrides: { 'root/children/0': { text: 'Escríbenos' } } })])],
  ...extra,
})
const open = (bytes) => inspectWebsiteTemplate(bytes, { builderCatalogs: builderCatalogs() })
async function edit(bytes, change) {
  const entries = await readZip(bytes, { mimetype: WEBSITE_TEMPLATE.mime, folders: ['assets', 'previews', 'licenses', 'pages'] })
  const manifest = JSON.parse(entries.get('manifest.json'))
  await change(manifest, entries)
  manifest.document.files = [...entries].filter(([name]) => !['mimetype', 'manifest.json'].includes(name)).map(([path, data]) => ({ path, bytes: data.length, sha256: sha(data) }))
  entries.set('manifest.json', Buffer.from(JSON.stringify(manifest)))
  return writePackageZip([...entries])
}
const codes = async (bytes) => (await validateWebsiteTemplate(bytes, { builderCatalogs: builderCatalogs() })).errors.map((e) => e.code)

test('components package: shared definitions round-trip, pages keep references, validation sees expanded content', async () => {
  const { bytes, validation } = await build()
  assert.equal(validation.ok, true, JSON.stringify(validation.errors))
  const opened = await open(bytes)
  assert.equal(opened.ok, true)
  assert.deepEqual(opened.content.components, { footer })
  const [home, contact] = opened.content.pages
  assert.equal(home.sections[1].type, COMPONENT_REF_TYPE, 'pages keep the reference')
  assert.equal(home.resolved[1].type, 'SectionBlock', 'resolved copy is expanded')
  assert.equal(contact.resolved[0].children.children[0].props.text, 'Escríbenos')
  assert.equal(footer.section.children.children[0].props.text, 'Hecho en Runly')
  assert.deepEqual(opened.report.components, [{ id: 'footer', name: 'Pie', uses: 2 }])
  assert.equal(opened.report.pages[0].blocks, 4, 'block counts are of the expanded page')
  assert.equal(WEBSITE_COMPONENTS.file, 'components.json')
})

test('components package: no components keeps historical bytes and report shape', async () => {
  const plain = { title: 'Sin componentes', catalog: blockCatalog(), theme, pages: [page('/', 'Inicio', [section('TextBlock', { text: 'Hola' })], true)] }
  const a = await exportWebsiteTemplate(plain), b = await exportWebsiteTemplate({ ...plain, components: {} })
  assert.deepEqual(a.bytes, b.bytes)
  const opened = await open(a.bytes)
  assert.equal(opened.content.components, null)
  assert.deepEqual(opened.report.components, [])
  assert.ok(!(await readZip(a.bytes, { mimetype: WEBSITE_TEMPLATE.mime, folders: ['assets', 'previews', 'licenses', 'pages'] })).has('components.json'))
})

test('components package: unused definitions warn; bad references and definitions fail closed', async () => {
  const unused = await exportWebsiteTemplate({ title: 'x', catalog: blockCatalog(), theme, components: { footer }, pages: [page('/', 'Inicio', [section('TextBlock', { text: 'Hola' })], true)] })
  assert.ok(unused.validation.warnings.some((w) => w.code === 'component_unused'))
  await assert.rejects(build({ pages: [page('/', 'Inicio', [ref({ componentId: 'nope' })], true)] }), { reason: 'component_missing' })
  await assert.rejects(build({ pages: [page('/', 'Inicio', [ref({ componentId: 'footer', overrides: { 'root/children/0': { align: 'left' } } })], true)] }), { reason: 'component_override_invalid' })
  await assert.rejects(build({ components: { footer: { name: 'Pie', section: section('SectionBlock', {}, { children: [ref({ componentId: 'footer' })] }) } } }), { reason: 'component_ref_nested' })
  await assert.rejects(build({ components: { footer: { name: 'Pie', section: section('NoSuchBlock', {}) } } }), { reason: 'block_unknown' })
})

test('components package: tampering with components.json fails closed with stable codes', async () => {
  const { bytes } = await build()
  const withComponents = (json) => edit(bytes, (m, f) => { f.set('components.json', Buffer.from(typeof json === 'string' ? json : JSON.stringify(json))) })
  const broken = await validateWebsiteTemplate(await withComponents('not json'), { builderCatalogs: builderCatalogs() })
  assert.equal(broken.ok, false)
  assert.equal(broken.errors[0].code, 'components_invalid')
  assert.ok((await codes(await withComponents({ footer: { name: 'Pie', section: section('TextBlock', { text: '<script>alert(1)</script>' }) } }))).includes('prop_invalid'), 'definition props are validated through the pages that use them')
  assert.ok((await codes(await withComponents({}))).includes('component_missing'), 'removing a used definition breaks its references')
  assert.ok((await codes(await withComponents({ 'Bad Id': footer }))).includes('component_id_invalid'))
  assert.ok((await codes(await withComponents({ footer: { name: 'Pie', section: section('SectionBlock', {}, { children: [ref({ componentId: 'footer' })] }) } }))).includes('component_ref_nested'))
})

test('components package: the file is declared in the inventory, so readers that predate it reject the package', async () => {
  const { bytes } = await build()
  const entries = await readZip(bytes, { mimetype: WEBSITE_TEMPLATE.mime, folders: ['assets', 'previews', 'licenses', 'pages'] })
  const manifest = JSON.parse(entries.get('manifest.json'))
  assert.ok(manifest.document.files.some((f) => f.path === 'components.json'))
  assert.ok(manifest.pages.every((p) => p.file !== 'components.json'))
})
