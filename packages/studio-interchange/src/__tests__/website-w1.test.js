import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import JSZip from 'jszip'
import { validateWebsiteTemplate, inspectWebsiteTemplate, WEBSITE_ASSET_POLICY } from '../website-template.js'
import { exportWebsiteTemplate } from '../website-write.js'
import { sectionsToAtlasPage, atlasPageToSections, mapWebsiteImages, websiteThemeToAtlasTokens } from '../website-document.js'
import { readZip } from '../zip-reader.js'
import { writePackageZip } from '../write.js'
import { WEBSITE_TEMPLATE } from '../website-template.js'
import { blockCatalog, builderCatalogs, section, websiteCorpus } from './corpus.js'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
export async function rasterTemplate(mime = 'image/png') {
  const format = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' }[mime]
  const data = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#17243c' } }).toFormat(format).toBuffer()
  return exportWebsiteTemplate({ title: 'Ejemplo W1', catalog: blockCatalog(), pages: [{ path: '/', title: 'Inicio', isHome: true, sections: [section('SectionBlock', {}, { children: [section('ImageBlock', { src: `asset:${sha(data)}`, alt: 'Imagen original' }), section('TextBlock', { text: 'Texto editable' })] })] }], theme: { colors: { primary: '#17243c', bg: '#efebea' }, fonts: { heading: 'Lato', body: 'Lato' }, radius: 12, spacing: 4 }, assets: [{ data, mime, license: 'original' }], licenses: [{ id: 'original', redistribution: 'allowed', notice: 'Imagen sintética de prueba. Redistribución permitida por su autor.' }] })
}

export async function editWebsiteZip(bytes, edit) {
  const entries = await readZip(bytes, { mimetype: WEBSITE_TEMPLATE.mime, folders: ['assets', 'previews', 'licenses', 'pages'] })
  const manifest = JSON.parse(entries.get('manifest.json'))
  await edit(manifest, entries)
  manifest.document.files = [...entries].filter(([name]) => !['mimetype', 'manifest.json'].includes(name)).map(([path, data]) => ({ path, bytes: data.length, sha256: sha(data) }))
  entries.set('manifest.json', Buffer.from(JSON.stringify(manifest)))
  return writePackageZip([...entries])
}

test('W1: PNG/JPEG/WebP v2 inspection keeps editable content, theme and exact bytes', async () => {
  for (const mime of ['image/png', 'image/jpeg', 'image/webp']) {
    const { bytes, validation } = await rasterTemplate(mime)
    assert.equal(validation.ok, true)
    assert.equal(validation.manifest.formatVersion, 2)
    assert.equal(validation.report.assetPolicy, WEBSITE_ASSET_POLICY.name)
    assert.equal('content' in validation, false)
    const inspected = await inspectWebsiteTemplate(bytes, { builderCatalogs: builderCatalogs() })
    assert.equal(inspected.ok, true)
    assert.equal(sha(inspected.content.assets[0].data), inspected.manifest.assets[0].sha256)
    assert.equal(inspected.content.theme.colors.bg, '#efebea')
    assert.equal(inspected.content.pages[0].sections[0].children.children[1].props.text, 'Texto editable')
  }
})

test('W1: hostile asset identity, MIME, dimensions, license and references fail closed', async () => {
  const { bytes } = await rasterTemplate()
  const cases = [
    ['checksum_mismatch', m => { m.assets[0].bytes-- }],
    ['undeclared_entry', m => { m.assets[0].sha256 = 'a'.repeat(64); m.assets[0].id = `asset-${m.assets[0].sha256}`; m.assets[0].path = `assets/${m.assets[0].sha256}.png` }],
    ['image_invalid', m => { m.assets[0].width++ }],
    ['manifest_invalid', m => { m.assets.push(m.assets[0]) }],
    ['license_missing', m => { m.assets[0].license = 'missing' }],
    ['license_forbidden', m => { m.licenses[0].redistribution = 'forbidden' }],
    ['license_missing', (m, f) => { f.set(m.licenses[0].path, Buffer.from(' ')) }],
    ['asset_missing', (m, f) => { const p = JSON.parse(f.get(m.pages[0].file)); p[0].children.children[0].props.src = `asset:${'a'.repeat(64)}`; f.set(m.pages[0].file, Buffer.from(JSON.stringify(p))) }],
    ['prop_invalid', (m, f) => { const p = JSON.parse(f.get(m.pages[0].file)); p[0].children.children[0].props.src = 'https://images.example.test/x.png'; f.set(m.pages[0].file, Buffer.from(JSON.stringify(p))) }],
    ['asset_missing', (m, f) => { f.delete(m.assets[0].path) }],
    ['image_invalid', (m, f) => { const a=m.assets[0], data=Buffer.from('<svg onload="alert(1)"></svg>'), h=sha(data); f.delete(a.path); Object.assign(a,{sha256:h,id:`asset-${h}`,path:`assets/${h}.png`,bytes:data.length}); f.set(a.path,data) }],
  ]
  for (const [expected, edit] of cases) {
    const r = await inspectWebsiteTemplate(await editWebsiteZip(bytes, edit), { builderCatalogs: builderCatalogs() })
    assert.equal(r.ok, false, expected)
    assert(r.errors.some(e => e.code === expected), JSON.stringify(r.errors))
    assert.equal('content' in r, false, 'hostile content never reaches a consumer')
  }
  const closed = await validateWebsiteTemplate(bytes, { builderCatalogs: builderCatalogs(), limits: { assets: 0 } })
  assert.equal(closed.errors[0].code, 'asset_limit')
  const limited = await validateWebsiteTemplate(bytes, { builderCatalogs: builderCatalogs(), limits: { assetBytes: 1 } })
  assert.equal(limited.errors[0].code, 'zip_limit_exceeded')
})

test('W1: unknown rights remain explicit review warnings; old v1 assets cannot be enabled', async () => {
  const { bytes } = await rasterTemplate()
  const unknown = await validateWebsiteTemplate(await editWebsiteZip(bytes, m => { m.licenses[0].redistribution = 'unknown' }), { builderCatalogs: builderCatalogs() })
  assert.equal(unknown.ok, true)
  assert(unknown.warnings.some(w => w.code === 'license_unknown'))
  const legacy = (await websiteCorpus())['website/assets-not-allowed.zip'].bytes
  assert.equal((await validateWebsiteTemplate(legacy, { builderCatalogs: builderCatalogs(), limits: { assets: 100 } })).errors[0].code, 'asset_limit')
})

test('W1: ZIP traversal, executable entries and compression bombs are rejected before consumption', async () => {
  const {bytes}=await rasterTemplate()
  for (const [path,expected] of [['assets/../escape.js','zip_unsafe_entry'],['pages/run.js','undeclared_entry']]) {
    const r=await inspectWebsiteTemplate(await editWebsiteZip(bytes,(_m,entries)=>entries.set(path,Buffer.from('throw Error("must not execute")'))),{builderCatalogs:builderCatalogs()})
    assert.equal(r.ok,false);assert.equal(r.errors[0].code,expected);assert.equal('content' in r,false)
  }
  const entries=await readZip(bytes,{mimetype:WEBSITE_TEMPLATE.mime,folders:['assets','previews','licenses','pages']})
  entries.set('licenses/bomb.txt',Buffer.alloc(100000,65))
  const zip=new JSZip()
  for(const [path,data] of entries)zip.file(path,data,{compression:path==='mimetype'?'STORE':'DEFLATE',createFolders:false,date:new Date('2000-01-01T00:00:00Z')})
  const bomb=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'})
  const r=await inspectWebsiteTemplate(bomb,{builderCatalogs:builderCatalogs()})
  assert.equal(r.ok,false);assert.equal(r.errors[0].code,'zip_limit_exceeded')
})

test('W1: Atlas 0.3.5 parses and round-trips portable sections; cycles, orphans and extra regions are rejected', async () => {
  const require = createRequire(new URL('../../../../apps/desktop/package.json', import.meta.url))
  const { parsePage, serializePage } = await import(pathToFileURL(require.resolve('@raulbellosom/atlas-web-builder')).href)
  const inspected = await inspectWebsiteTemplate((await rasterTemplate()).bytes, { builderCatalogs: builderCatalogs() })
  const source = inspected.content.pages[0]
  const page = sectionsToAtlasPage(source)
  assert.deepEqual(atlasPageToSections(parsePage(serializePage(page))).sections, source.sections)
  const before = structuredClone(page)
  const bound = mapWebsiteImages(page, blockCatalog(), ref => ref.replace('asset:', 'file:'))
  assert.notDeepEqual(bound, page)
  assert.deepEqual(page, before, 'binding must not mutate the portable reference')
  const cycle = structuredClone(page); cycle.blocks['block-1'].children.children.push('block-1')
  assert.throws(() => atlasPageToSections(cycle), /INVALID_ATLAS_TREE/)
  assert.throws(() => atlasPageToSections({ ...page, blocks: { ...page.blocks, orphan: { id:'orphan',type:'TextBlock',props:{} } } }), /ORPHAN/)
  assert.throws(() => atlasPageToSections({ ...page, regions: { ...page.regions, header: { children:[] } } }), /NOT_PORTABLE/)
  assert.throws(() => atlasPageToSections({ ...page, visibility:'private' }), /NOT_PORTABLE/)
  assert.throws(() => atlasPageToSections({ ...page, layoutId:'custom-layout' }), /NOT_PORTABLE/)
  const tokens=websiteThemeToAtlasTokens(inspected.content.theme)
  assert.equal(tokens.font.sans,'Lato'); assert.equal(tokens.color.bg,'#efebea'); assert.equal(tokens.spacing[4],'16px')
  const erp=blockCatalog(), hub=JSON.parse(readFileSync(new URL('../../../../../runly-developer-hub/packages/contracts/website-builder-catalogs/0.3.5.json',import.meta.url),'utf8'))
  assert.deepEqual(erp,hub,'W1 does not silently replace the pinned catalog')
})
