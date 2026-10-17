import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { BLOCK_CATALOG, blocksForSite, documentToSections, sectionsToDocument, PageDocumentError } from '../page-document.js'

test('catálogo: incluye todos los bloques declarados en runlyBlocks (regenerar si falla)', () => {
  const dir = new URL('../../../../../desktop/src/website/runlyBlocks/', import.meta.url)
  const declared = readdirSync(dir).filter(name => name.endsWith('Block.jsx'))
    .map(name => readFileSync(new URL(name, dir), 'utf8').match(/defineBlock\(\{\s*type:\s*'(\w+)'/)?.[1]).filter(Boolean)
  const known = new Set(BLOCK_CATALOG.blocks.map(block => block.type))
  for (const type of declared) assert.ok(known.has(type), `${type}: node scripts/generate-website-block-catalog.mjs`)
  assert.ok(known.has('HeroBlock') && known.has('SectionBlock'))
  assert.ok(!blocksForSite('website').some(block => block.group === 'ecommerce'))
  assert.ok(blocksForSite('ecommerce').some(block => block.type === 'ProductsGridBlock'))
})

test('sections -> documento determinista, con defaults y slots; ida y vuelta', () => {
  const sections = [
    { type: 'HeroBlock', props: { title: 'Tacos', ctaHref: '/menu', imageSrc: 'https://img.example.com/a.jpg', background: { kind: 'color', token: 'muted' } } },
    { type: 'SectionBlock', children: { children: [{ type: 'HeadingBlock', props: { text: 'Hola', level: 'h2' } }] } },
  ]
  const doc = sectionsToDocument({ id: 'inicio', slug: 'inicio', title: 'Inicio', sections })
  assert.deepEqual(doc, sectionsToDocument({ id: 'inicio', slug: 'inicio', title: 'Inicio', sections }))
  assert.deepEqual(doc.regions.main.children, ['b1', 'b2'])
  assert.deepEqual(doc.blocks.b2.children.children, ['b3'])
  assert.equal(doc.blocks.b1.props.title, 'Tacos')
  assert.ok('subtitle' in doc.blocks.b1.props, 'completa defaultProps')
  const back = documentToSections(JSON.stringify(doc))
  assert.equal(back[1].children.children[0].props.text, 'Hola')
  assert.ok(!('subtitle' in back[0].props), 'omite props iguales al default')
  // Every block with all its defaults (some outside their options, e.g. size: '') resends unchanged.
  const all = BLOCK_CATALOG.blocks.map(block => ({ type: block.type, props: block.defaultProps }))
  assert.doesNotThrow(() => sectionsToDocument({ id: 'x', slug: 'x', title: 'X', sections: all }))
})

test('rechaza tipos, props, opciones, enlaces e HTML inseguros con rutas precisas', () => {
  const bad = [
    { type: 'NopeBlock' },
    { type: 'HeroBlock', props: { foo: 1, variant: 'zigzag', ctaHref: 'javascript:alert(1)', imageSrc: 'http://x.example.com/a.png' } },
    { type: 'RichTextBlock', props: { html: '<p onclick="x()">hi</p>' } },
    { type: 'HeadingBlock', children: { children: [{ type: 'TextBlock' }] } },
  ]
  assert.throws(() => sectionsToDocument({ id: 'p', slug: 'p', title: 'P', sections: bad }), error => {
    assert.ok(error instanceof PageDocumentError)
    const text = error.problems.join('\n')
    for (const fragment of ['sections[0].type', 'props.foo', 'props.variant', 'props.ctaHref', 'props.imageSrc', 'props.html', 'no admite bloques hijos']) assert.match(text, new RegExp(fragment.replace(/[.[\]]/g, '\\$&')))
    return true
  })
  assert.throws(() => sectionsToDocument({ id: 'p', slug: 'p', title: 'P', sections: [] }), PageDocumentError)
})
