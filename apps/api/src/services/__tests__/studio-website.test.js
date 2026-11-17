import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateDocument } from '../../../../shared/studio/document.js'
import { documentPages } from '../../../../shared/studio/pages.js'
import { LOSSES, convertStudioPage, rasterObjects, websiteKind } from '../../../../shared/studio/website-conversion.js'
import { buildStudioWebsitePage } from '../studio-website/page-builder.js'

const PHOTO = '00000000-0000-4000-8000-0000000000aa', SITE_FILE = '00000000-0000-4000-8000-0000000000bb', RASTER_FILE = '00000000-0000-4000-8000-0000000000cc'
const document = validateDocument({ schemaVersion: 8, unit: 'px',
  page: { id: 'p1', width: 1920, height: 1080, background: '#0F172A', slide: { duration: 3000 } },
  objects: [
    { id: 'foto', type: 'image', fileAssetId: PHOTO, x: 1300, y: 600, width: 480, height: 360, rotation: 0, fill: '#000000' },
    { id: 'titulo', type: 'text', x: 120, y: 80, width: 1300, height: 140, rotation: 0, fill: '#ffffff', text: 'Studio Next', fontSize: 120, groupId: 'g', enter: { preset: 'fade', duration: 600, delay: 0, easing: 'linear' }, exit: { preset: 'fade', duration: 500, delay: 2400, easing: 'linear' } },
    { id: 'caja', type: 'rectangle', x: 120, y: 420, width: 400, height: 300, rotation: 30, fill: '#ef4444', opacity: 0.5, groupId: 'g', shape: { fillEnabled: true, strokeWidth: 4, strokeColor: '#111827', dash: 'dashed', strokeAlign: 'center', radius: 20 } },
    { id: 'circulo', type: 'ellipse', x: 900, y: 100, width: 200, height: 200, rotation: 0, fill: '#7c3aed', enter: { preset: 'pop', duration: 400, delay: 0, easing: 'linear' } },
    { id: 'linea', type: 'line', x: 100, y: 900, width: 600, height: 40, rotation: 0, fill: '#22c55e', points: [[0, 0.5], [1, 0.5]], strokeWidth: 6 },
    { id: 'oculto', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, rotation: 0, fill: '#000000', hidden: true },
  ] })
const [scene] = documentPages(document)
const find = (nodes, test) => { for (const node of nodes) { if (test(node)) return node; const inner = node.children && find(Object.values(node.children).flat(), test); if (inner) return inner } return null }
const refs = { image: () => ({ src: `file:${SITE_FILE}` }), raster: id => (id === 'linea' ? { src: `file:${RASTER_FILE}`, box: { x: 98, y: 898, width: 604, height: 44 } } : null) }

test('classification: editable equivalents first, an image only for what has none', () => {
  assert.deepEqual(scene.objects.map(item => websiteKind(item, scene.page).kind), ['image', 'text', 'box', 'box', 'raster', 'skip'])
  assert.deepEqual(rasterObjects(scene).map(item => item.id), ['linea'])
  assert.equal(websiteKind({ type: 'ellipse', width: 300, height: 200, x: 0, y: 0, rotation: 0, fill: '#000000' }, scene.page).reason, 'elipse no circular')
})

test('a page becomes one section with a free canvas: editable elements, layers, groups, effects and losses', () => {
  const { sections, losses, counts } = convertStudioPage(scene, refs)
  assert.deepEqual(counts, { text: 1, image: 1, box: 2, raster: 1, group: 1 })
  const [section] = sections, [canvas] = section.children.children
  assert.deepEqual(section.props.background, { kind: 'color', token: '', value: '#0f172a' })
  assert.deepEqual([canvas.props.layout, canvas.props.width, canvas.props.height, canvas.props.tabletLayout], ['free', 960, 540, 'column'])
  // Reading order for tablet/phone: group (top) first, then circle, photo and line.
  assert.equal(canvas.children.children.length, 4, 'group, circle, photo and line at the top level')
  assert.ok(canvas.children.children[0].children, 'reading order: the group (top of the page) first')
  const group = canvas.children.children.find(node => node.children)
  const [title, box] = group.children.children
  assert.equal(title.type, 'TextElementBlock'); assert.equal(title.props.text, 'Studio Next')
  assert.deepEqual([title.props.fontSize, title.props.textColor, title.props.position, title.props.tabletPosition, title.props.layer], [60, '#ffffff', 'absolute', 'flow', 1])
  assert.deepEqual(title.props._animation, { preset: 'fade-in', duration: 600, delay: 0, easing: 'linear' })
  assert.deepEqual([box.props.backgroundColor, box.props.rotation, box.props.cornerRadius, box.props.borderWidth, box.props._opacity, box.props.layer], ['#ef4444', 30, 10, 2, 0.5, 2])
  const photo = canvas.children.children.find(node => node.props.src === `file:${SITE_FILE}`)
  assert.deepEqual([photo.props.offsetX, photo.props.offsetY, photo.props.width, photo.props.height, photo.props.layer, photo.props.tabletWidthPercent, photo.props.mobileWidthPercent], [650, 300, 240, 180, 0, 50, 100])
  const circle = canvas.children.children.find(node => node.props.cornerRadius === 50)
  assert.equal(circle.props._animation, undefined, 'pop has no Atlas equivalent')
  const line = canvas.children.children.find(node => node.props.src === `file:${RASTER_FILE}`)
  assert.deepEqual([line.props.fit, line.props.width, line.props.height], ['contain', 302, 22])
  for (const loss of [LOSSES.motion, LOSSES.pop, LOSSES.dash, LOSSES.slide]) assert.ok(losses.includes(loss), loss)
})

test('the result passes the Website catalog, effects and draft checks; unsafe input does not', () => {
  const { sections } = convertStudioPage(scene, refs)
  const page = buildStudioWebsitePage({ sections, routePath: '/studio-next', title: 'Studio Next' })
  assert.equal(page.schemaVersion, 1)
  const blocks = Object.values(page.blocks)
  assert.equal(blocks.filter(block => block.type === 'TextElementBlock').length, 1)
  assert.ok(blocks.some(block => block.props.src === `file:${SITE_FILE}`), 'private site image reference kept')
  const broken = structuredClone(sections); find(broken, node => node.type === 'TextElementBlock').props._animation = { preset: 'explode' }
  assert.throws(() => buildStudioWebsitePage({ sections: broken, routePath: '/x', title: 'x' }), /efecto no válido/)
  const link = structuredClone(sections); find(link, node => node.type === 'TextElementBlock').props.text = 'javascript:alert(1)'
  assert.throws(() => buildStudioWebsitePage({ sections: link, routePath: '/x', title: 'x' }), /contenido no permitido/)
  const foreign = structuredClone(sections); find(foreign, node => node.props.src).props.src = 'file:../../etc'
  assert.throws(() => buildStudioWebsitePage({ sections: foreign, routePath: '/x', title: 'x' }), /referencia de imagen no válida/)
  assert.throws(() => convertStudioPage(scene, { ...refs, raster: () => null }), /RASTER_MISSING:linea/)
})
