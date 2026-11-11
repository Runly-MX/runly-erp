// Local acceptance artifact only. Reads the preserved prototype/proposal; never executes content.js.
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { exportWebsiteTemplate } from '../packages/studio-interchange/src/website-write.js'
import { sectionsToAtlasPage, atlasPageToSections } from '../packages/studio-interchange/src/website-document.js'

const arg = name => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? null : process.argv[i + 1] }
if (!arg('source')) throw new Error('Usage: node scripts/prepare-elevate-website-w1.mjs --source <preserved-delivery-folder> [--output <directory>]')
const source = resolve(arg('source')), output = resolve(arg('output') ?? '.artifacts/website-w1/final')
const proposal = JSON.parse(await readFile(join(source, 'audit/declarative-proposal.json'), 'utf8'))
const originalContent = JSON.parse(await readFile(join(source, 'audit/original-content.json'), 'utf8'))
const catalog = JSON.parse(await readFile(new URL('../apps/api/src/routes/website/block-catalog.json', import.meta.url), 'utf8'))
const require = createRequire(new URL('../packages/studio-interchange/package.json', import.meta.url))
const sharp = require('sharp'), assets = [], derivatives = []
const sha = data => createHash('sha256').update(data).digest('hex')
for (const original of proposal.assets) {
  if (!/^assets\/(?:images|icons)\/[a-z0-9-]+\.(?:webp|svg)$/.test(original.path)) throw new Error('Unsupported original asset path')
  let data = await readFile(join(source, 'prototype', original.path)), mime = 'image/webp'
  assert.equal(sha(data), original.sha256, original.path)
  if (original.path.endsWith('.svg')) {
    const svg = data.toString('utf8')
    if (/<\s*(?:script|image|foreignObject|use|style|iframe)\b|\bon[a-z]+\s*=|href\s*=|style\s*=|url\s*\(/i.test(svg) || [...svg.matchAll(/<[^>]*>/g)].some(([tag]) => !/^<\s*\/?(?:svg|path|rect)\b/i.test(tag))) throw new Error('Active SVG source refused')
    data = await sharp(data, { density: 192 }).png().toBuffer(); mime = 'image/png'
    derivatives.push({ original: original.path, originalSha256: original.sha256, rasterSha256: sha(data) })
  }
  assets.push({ data, mime, license: 'elevate-provenance' })
}
const sections = structuredClone(proposal.localeCandidates.en)
const logo = derivatives.find(d => d.original.endsWith('/brand-mark.svg'))
if (logo) sections.find(b => b.type === 'NavbarBlock').props.logoSrc = `asset:${logo.rasterSha256}`
const text = value => ({ type: 'TextBlock', props: { text: value } })
const wrap = children => ({ type: 'SectionBlock', props: {}, children: { children } })
const t = originalContent.en
sections.splice(2, 0, wrap([t.heroProof, t.heroCaption, t.progressTitle, t.progressPeriod, `${t.progressWorkout}: 12 / 16`, `${t.progressMinutes}: 480 min`, `${t.progressScore}: 8.6 / 10`, '72%'].map(text)))
sections[sections.length - 3].children.children.push(wrap([{ type: 'ImageBlock', props: { src: `asset:${proposal.assets.find(a => a.path === originalContent.images.hero).sha256}`, alt: 'Original mobile preview' } }, ...[t.phoneTitle,t.phoneDesc,t.phoneButton].map(text)]))
sections.at(-1).props.copyright = t.footerCopy
const strings = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : []
// Keep untranslated dialog labels as editable copy until W2/W3 supply its modal/field contract.
const missing = Object.entries(t).filter(([,value]) => typeof value === 'string' && !strings(sections).some(s => s.includes(value)))
sections.splice(sections.length - 2, 0, wrap(missing.map(([,value]) => text(value))))
const omittedTextKeys = Object.entries(t).filter(([,value]) => typeof value === 'string' && !strings(sections).some(s => s.includes(value))).map(([key]) => key)
assert.deepEqual(omittedTextKeys, [])
const pages = [{ path: '/', title: 'Elevate Wellness', isHome: true, sections }]
const provenance = await readFile(join(source, 'prototype/ASSET-PROVENANCE.md'), 'utf8')
const result = await exportWebsiteTemplate({ title: 'Elevate Wellness', summary: 'Candidato W1: contenido editable e imágenes locales; composición visual definitiva pendiente de W2.', pages, locale: 'en', catalog, theme: { colors: { primary: '#17243c', fg: '#17243c', bg: '#efebea' }, radius: 28 }, assets, licenses: [{ id: 'elevate-provenance', notice: `${provenance}\n\nW1 preserves this supplied declaration. Redistribution rights require human verification; this is not an institutional attestation.`, redistribution: 'unknown' }] })
const desktopRequire = createRequire(new URL('../apps/desktop/package.json', import.meta.url))
const { parsePage, serializePage } = await import(pathToFileURL(desktopRequire.resolve('@raulbellosom/atlas-web-builder')).href)
for (const page of pages) assert.deepEqual(atlasPageToSections(parsePage(serializePage(sectionsToAtlasPage(page)))).sections, page.sections)
await mkdir(output, { recursive: true })
const target = join(output, 'website.elevate-wellness-w1.zip')
try { await writeFile(target, result.bytes, { flag: 'wx' }) }
catch (error) { if (error.code !== 'EEXIST') throw error; assert.deepEqual(await readFile(target), result.bytes, 'Refusing to overwrite a different acceptance artifact') }
await writeFile(join(output, 'acceptance.json'), JSON.stringify({ resourceKey: 'website.elevate-wellness', formatVersion: 2, digest: result.validation.digest, bytes: result.bytes.length, validation: result.validation, atlasRoundTrip: true, omittedTextKeys, derivatives, remaining: proposal.requiredExtensions, installation: 'Not implemented (W3)', editor: 'Not implemented (W2)', visualFidelity: 'All EN copy retained as editable blocks; dialog labels static. Exact overlays/layout remain W2. ES copy remains in original prototype.', publication: 'Not requested; no official authority asserted' }, null, 2))
console.log(JSON.stringify({ output, digest: result.validation.digest, bytes: result.bytes.length, assets: assets.length, pages: pages.length, warnings: result.validation.warnings.map(w => w.code), atlasRoundTrip: true }))
