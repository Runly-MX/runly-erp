import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { validateDocument } from '../../../../../shared/studio/document.js'
import { buildPptx } from './pptx-build.js'
import { classify, placement, pageFrame, presentationLayout, speedOf } from './pptx-mapping.js'

const require = createRequire(import.meta.url)
const PptxGenJS = require('pptxgenjs'), JSZip = require('jszip')
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
const FILE = '00000000-0000-4000-8000-000000000001'
const document = validateDocument({ schemaVersion: 8, unit: 'px',
  page: { id: 'page-1', width: 1920, height: 1080, background: '#0f172a', slide: { duration: 3000 } },
  objects: [
    { id: 't', type: 'text', x: 100, y: 100, width: 800, height: 120, rotation: 30, fill: '#ffffff', text: 'Hola\nStudio', fontSize: 80, fontFamily: 'sans-serif', textAlign: 'center', keyframes: [{ at: 0, x: 100 }, { at: 1000, x: 300 }] },
    { id: 'r', type: 'rectangle', x: 300, y: 400, width: 400, height: 200, rotation: 0, fill: '#ef4444', opacity: 0.5, shape: { fillEnabled: true, strokeWidth: 4, strokeColor: '#111827', dash: 'dashed', strokeAlign: 'center', radius: 20 } },
    { id: 'e', type: 'ellipse', x: 800, y: 400, width: 300, height: 300, rotation: 0, fill: '#3b82f6', groupId: 'g' },
    { id: 'e2', type: 'ellipse', x: 1150, y: 400, width: 300, height: 300, rotation: 0, fill: '#3b82f6', groupId: 'g' },
    { id: 'l', type: 'line', x: 100, y: 800, width: 600, height: 60, rotation: 0, fill: '#22c55e', points: [[0, 0.5], [0.5, 0], [1, 0.5]], strokeWidth: 6, startCap: 'square', endCap: 'arrow' },
    { id: 'p', type: 'image', x: 1500, y: 700, width: 300, height: 200, rotation: 0, fill: '#000000', fileAssetId: FILE },
    { id: 'm', type: 'image', x: 1500, y: 100, width: 200, height: 200, rotation: 0, fill: '#000000', fileAssetId: FILE, image: { mask: 'circle' } },
    { id: 'gr', type: 'rectangle', x: 50, y: 50, width: 40, height: 40, rotation: 0, fill: '#000000', fillPaint: { type: 'gradient', gradientType: 'linear', angle: 0, stops: [{ offset: 0, color: '#ff0000', opacity: 1 }, { offset: 1, color: '#0000ff', opacity: 1 }] } },
    { id: 'h', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, rotation: 0, fill: '#000000', hidden: true },
  ],
  additionalPages: [{ page: { id: 'page-2', width: 1080, height: 1080, background: '#fde68a', slide: { duration: 2000, transition: { type: 'slide-left', duration: 600, easing: 'linear' } } },
    objects: [{ id: 't2', type: 'text', x: 100, y: 900, width: 800, height: 100, rotation: 0, fill: '#111827', text: 'Cuadrada', fontSize: 72 }] }] })
const assets = { image: async () => PNG, raster: async item => ({ data: PNG, box: { x: item.x, y: item.y, width: item.width, height: item.height } }), background: async () => PNG }

test('geometry: layout from the first page, letterbox and centre-pivot rotation', () => {
  assert.deepEqual(presentationLayout({ width: 1920, height: 1080 }), { width: 13.333, height: 7.4998 })
  const frame = pageFrame({ width: 1080, height: 1080 }, { width: 13.333, height: 7.5 })
  assert.ok(frame.letterboxed && Math.abs(frame.width - 7.5) < 1e-9 && Math.abs(frame.x - 2.9165) < 1e-3)
  const box = placement({ type: 'rectangle', x: 0, y: 0, width: 100, height: 50, rotation: 90 }, { scale: 0.01, x: 0, y: 0 })
  assert.deepEqual([box.x, box.y, box.w, box.h, box.rotate], [-0.75, 0.25, 1, 0.5, 90], 'Studio corner pivot → PowerPoint centre pivot')
  assert.deepEqual(document.objects.map(item => classify(item).kind), ['text', 'shape', 'shape', 'shape', 'line', 'image', 'raster', 'raster', 'skip'])
  assert.deepEqual([speedOf(400), speedOf(750), speedOf(1500)], ['fast', 'med', 'slow'])
})

test('builds independent editable elements, transitions and a report', async () => {
  const { data, report } = await buildPptx({ PptxGenJS, JSZip, document, pageIds: ['page-1', 'page-2'], assets, output: 'nodebuffer' })
  const zip = await JSZip.loadAsync(data)
  const presentation = await zip.file('ppt/presentation.xml').async('string')
  assert.match(presentation, /<p:sldSz cx="1219\d{4}" cy="685\d{4}"/)
  assert.equal((presentation.match(/<p:sldId /g) ?? []).length, 2, 'one slide per page, in order')
  const first = await zip.file('ppt/slides/slide1.xml').async('string'), second = await zip.file('ppt/slides/slide2.xml').async('string')
  assert.match(first, /<a:t>Hola<\/a:t>[\s\S]*<a:t>Studio<\/a:t>/, 'text stays text, line break kept')
  assert.match(first, /<a:xfrm rot="1800000">/, '30° rotation')
  assert.equal((first.match(/<p:pic>/g) ?? []).length, 3, 'photo + masked photo + gradient as images')
  assert.equal((first.match(/prst="roundRect"/g) ?? []).length, 1); assert.equal((first.match(/prst="ellipse"/g) ?? []).length, 2)
  assert.match(first, /<a:custGeom>[\s\S]*<a:tailEnd type="triangle"/, 'polyline with arrow')
  assert.match(first, /<a:prstDash val="dash"\/>/); assert.match(first, /<a:alpha val="50000"\/>/)
  assert.match(first, /<p:transition advTm="3000"><p:cut\/><\/p:transition><\/p:sld>$/, 'first slide: autoplay time, no effect')
  assert.match(second, /<p:transition advTm="2000"><p:cut\/><\/p:transition>/, 'slide-left is not exported (reported)')
  assert.match(second, /<a:srgbClr val="FDE68A"\/>/, 'square page background as a rectangle inside black bars')
  assert.deepEqual(report.slides.map(({ text, shape, line, image, raster }) => [text, shape, line, image, raster]), [[1, 3, 1, 1, 2], [1, 0, 0, 0, 0]])
  assert.deepEqual(report.rasterized.map(entry => entry.reason), ['foto con máscara, encuadre, borde, sombra o ajustes', 'degradado'])
  for (const loss of ['grupos', 'animaciones', 'franjas negras', 'cuadrado', 'empujar']) assert.ok(report.losses.some(text => text.includes(loss)), loss)
  const all = (await Promise.all(Object.keys(zip.files).filter(name => /\.(xml|rels)$/.test(name)).map(name => zip.file(name).async('string')))).join('')
  assert.ok(!/https?:\/\/(?!schemas\.|purl\.org|www\.w3\.org)/.test(all), 'no external links or signed URLs')
})
