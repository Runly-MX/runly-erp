import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { sanitizeSvg, validateSvg, looksLikeSvg } from '../svg.js'
import { validateWebsiteTemplate, inspectWebsiteTemplate, WEBSITE_ASSET_POLICY, WEBSITE_MEDIA_POLICY } from '../website-template.js'
import { exportWebsiteTemplate } from '../website-write.js'
import { blockCatalog, builderCatalogs, section } from './corpus.js'
import sharp from 'sharp'
import { readZip } from '../zip-reader.js'
import { writePackageZip } from '../write.js'
import { WEBSITE_TEMPLATE } from '../website-template.js'

const sha = (b) => createHash('sha256').update(b).digest('hex')
async function rasterTemplate() {
  const data = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#17243c' } }).png().toBuffer()
  return exportWebsiteTemplate({ title: 'Raster', catalog: blockCatalog(), pages: [{ path: '/', title: 'Inicio', isHome: true, sections: [section('SectionBlock', {}, { children: [section('ImageBlock', { src: `asset:${sha(data)}`, alt: 'x' })] })] }], theme: { colors: { primary: '#17243c', bg: '#efebea' }, fonts: { heading: 'Lato', body: 'Lato' }, radius: 12, spacing: 4 }, assets: [{ data, mime: 'image/png', license: 'original' }], licenses: [{ id: 'original', redistribution: 'allowed', notice: 'Sintética.' }] })
}
async function editWebsiteZip(bytes, edit) {
  const entries = await readZip(bytes, { mimetype: WEBSITE_TEMPLATE.mime, folders: ['assets', 'previews', 'licenses', 'pages'] })
  const manifest = JSON.parse(entries.get('manifest.json'))
  await edit(manifest, entries)
  manifest.document.files = [...entries].filter(([name]) => !['mimetype', 'manifest.json'].includes(name)).map(([path, data]) => ({ path, bytes: data.length, sha256: sha(data) }))
  entries.set('manifest.json', Buffer.from(JSON.stringify(manifest)))
  return writePackageZip([...entries])
}
const CLEAN = '<?xml version="1.0" encoding="UTF-8"?><!-- c --><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" width="48" height="48"><metadata><rdf:RDF><dc:title>x</dc:title></rdf:RDF></metadata><defs><linearGradient id="g"><stop offset="0" style="stop-color:#fff;unknown:1"/></linearGradient></defs><path d="M0 0h24v24H0z" style="fill:currentColor" class="a" inkscape:label="p"/><circle cx="12" cy="12" r="4" fill="url(#g)"/></svg>'

test('SVG: clean export is canonical, sized by viewBox, recolorable and idempotent', () => {
  const r = sanitizeSvg(Buffer.from(CLEAN))
  const text = r.data.toString()
  assert.deepEqual([r.width, r.height, r.recolorable], [24, 24, true])
  assert.ok(!/width=|height=|metadata|class=|inkscape|<!--|<\?xml/.test(text.replace(/stroke-width|<svg[^>]*/g, '')), text)
  assert.ok(text.includes('fill="currentColor"') && text.includes('stop-color="#fff"'))
  assert.ok(r.warnings.includes('metadata-dropped') && r.warnings.includes('attribute-dropped'))
  assert.deepEqual(validateSvg(r.data).data, r.data) // sanitizing twice changes nothing
  assert.throws(() => validateSvg(Buffer.from(CLEAN)), { reason: 'svg_forbidden_content' })
  assert.ok(looksLikeSvg(Buffer.from(CLEAN)) && !looksLikeSvg(Buffer.from([137, 80, 78, 71])))
})

const wrap = (inner, attrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"${attrs}>${inner}</svg>`
const HOSTILE = [
  ['svg_forbidden_content', 'script', wrap('<script>alert(1)</script>')],
  ['svg_forbidden_content', 'onload', wrap('<rect/>', ' onload="alert(1)"')],
  ['svg_forbidden_content', 'onclick', wrap('<rect onclick="x()"/>')],
  ['svg_forbidden_content', 'foreignObject', wrap('<foreignObject><div/></foreignObject>')],
  ['svg_forbidden_content', 'external href', wrap('<use href="https://evil.test/a.svg#x"/>')],
  ['svg_forbidden_content', 'xlink external', wrap('<use xlink:href="//evil.test/a.svg#x"/>')],
  ['svg_forbidden_content', 'javascript href', wrap('<use href="javascript:alert(1)"/>')],
  ['svg_forbidden_content', 'data href', wrap('<use href="data:image/svg+xml;base64,AAAA"/>')],
  ['svg_forbidden_content', 'image element', wrap('<image href="x.png"/>')],
  ['svg_forbidden_content', 'anchor', wrap('<a href="https://x.test"><rect/></a>')],
  ['svg_forbidden_content', 'animate', wrap('<rect><animate attributeName="x" to="1"/></rect>')],
  ['svg_forbidden_content', 'style element', wrap('<style>@import url(https://evil.test/x.css);</style>')],
  ['svg_forbidden_content', 'external url()', wrap('<rect fill="url(https://evil.test/x)"/>')],
  ['svg_forbidden_content', 'style url', wrap('<rect style="fill:url(https://evil.test/x)"/>')],
  ['svg_forbidden_content', 'doctype/entity', `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]>${wrap('<text>&b;</text>')}`],
  ['svg_forbidden_content', 'CDATA', wrap('<text><![CDATA[x]]></text>')],
  ['svg_forbidden_content', 'processing instruction', wrap('<?php echo 1 ?>')],
  ['svg_forbidden_content', 'unknown entity', wrap('<text>&xxe;</text>')],
  ['svg_forbidden_content', 'unknown element', wrap('<blink/>')],
  ['svg_forbidden_content', 'bad xmlns', wrap('<rect/>').replace('http://www.w3.org/2000/svg', 'javascript:1')],
  ['svg_too_complex', 'nested use bomb', wrap('<g id="a"><rect/></g><g id="b"><use href="#a"/><use href="#a"/></g><use href="#b"/>')],
  ['svg_too_complex', 'self use', wrap('<g id="a"><use href="#a"/></g>')],
  ['svg_too_complex', 'too many elements', wrap('<rect/>'.repeat(5001))],
  ['svg_too_complex', 'too deep', wrap('<g>'.repeat(40) + '</g>'.repeat(40))],
  ['svg_too_complex', 'too big', wrap(`<path d="${'M0 0 '.repeat(60000)}"/>`)],
  ['svg_too_complex', 'huge viewBox', wrap('<rect/>').replace('0 0 10 10', '0 0 90000 10')],
  ['svg_no_viewbox', 'no viewBox', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'],
  ['svg_no_viewbox', 'zero viewBox', wrap('<rect/>').replace('0 0 10 10', '0 0 0 0')],
  ['svg_invalid_xml', 'not svg root', '<g></g>'],
  ['svg_invalid_xml', 'unclosed', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><g></svg>'],
  ['svg_invalid_xml', 'two roots', wrap('') + wrap('')],
  ['svg_invalid_xml', 'duplicate attribute', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" viewBox="0 0 2 2"></svg>'],
  ['svg_invalid_xml', 'stray text', wrap('hello')],
  ['svg_invalid_xml', 'not utf8', Buffer.from([0x3c, 0x73, 0xff, 0xfe])],
  ['svg_too_complex', 'empty', Buffer.alloc(0)],
]
for (const [reason, name, input] of HOSTILE) {
  test(`SVG hostile: ${name} -> ${reason}`, () => {
    assert.throws(() => sanitizeSvg(Buffer.from(input)), (error) => error.reason === reason)
  })
}

async function svgTemplate(data) {
  const ref = `asset:${sha(data)}`
  return exportWebsiteTemplate({ title: 'Con SVG', catalog: blockCatalog(), pages: [{ path: '/', title: 'Inicio', isHome: true, sections: [section('SectionBlock', {}, { children: [section('ImageBlock', { src: ref, alt: 'Logotipo' })] })] }], theme: { colors: { primary: '#17243c', bg: '#efebea' }, fonts: { heading: 'Lato', body: 'Lato' }, radius: 12, spacing: 4 }, assets: [{ data, mime: 'image/svg+xml', license: 'original' }], licenses: [{ id: 'original', redistribution: 'allowed', notice: 'Logotipo propio.' }] })
}

test('SVG website: v2 policy round-trips the exact vector master; raster-only keeps policy v1', async () => {
  const master = sanitizeSvg(Buffer.from(CLEAN)).data
  const { bytes, validation } = await svgTemplate(master)
  assert.equal(validation.ok, true, JSON.stringify(validation.errors))
  assert.equal(validation.report.assetPolicy, WEBSITE_MEDIA_POLICY.name)
  const inspected = await inspectWebsiteTemplate(bytes, { builderCatalogs: builderCatalogs() })
  assert.equal(inspected.ok, true)
  assert.deepEqual(inspected.content.assets[0].data, master)
  assert.equal(inspected.manifest.assets[0].mime, 'image/svg+xml')
  assert.equal(inspected.manifest.assets[0].path, `assets/${sha(master)}.svg`)
  const raster = await rasterTemplate()
  assert.equal(raster.validation.report.assetPolicy, WEBSITE_ASSET_POLICY.name)
})

test('SVG website: unsanitized SVG, policy mismatch and tampering fail closed', async () => {
  await assert.rejects(svgTemplate(Buffer.from(CLEAN)), { reason: 'svg_forbidden_content' })
  const { bytes } = await svgTemplate(sanitizeSvg(Buffer.from(CLEAN)).data)
  const down = await editWebsiteZip(bytes, (m) => { m.assetPolicy = WEBSITE_ASSET_POLICY.name })
  assert.equal((await validateWebsiteTemplate(down, { builderCatalogs: builderCatalogs() })).errors[0].code, 'manifest_invalid')
  const swapped = await editWebsiteZip(bytes, (m, f) => {
    const a = m.assets[0], evil = Buffer.from(wrap('<script>alert(1)</script>')), h = sha(evil)
    f.delete(a.path); Object.assign(a, { sha256: h, id: `asset-${h}`, path: `assets/${h}.svg`, bytes: evil.length }); f.set(a.path, evil)
  })
  assert.equal((await validateWebsiteTemplate(swapped, { builderCatalogs: builderCatalogs() })).errors[0].code, 'svg_forbidden_content')
  const newPolicyOnRaster = await editWebsiteZip((await rasterTemplate()).bytes, (m) => { m.assetPolicy = WEBSITE_MEDIA_POLICY.name })
  assert.equal((await validateWebsiteTemplate(newPolicyOnRaster, { builderCatalogs: builderCatalogs() })).errors[0].code, 'manifest_invalid')
  const unknownPolicy = await editWebsiteZip(bytes, (m) => { m.assetPolicy = 'packaged-media-v9' })
  assert.equal((await validateWebsiteTemplate(unknownPolicy, { builderCatalogs: builderCatalogs() })).errors[0].code, 'format_unsupported')
})
