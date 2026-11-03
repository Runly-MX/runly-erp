import test from 'node:test'
import assert from 'node:assert/strict'
import { appendProductCard, gridsShowing, scanProductUsage } from '../catalogLink.js'

const products = [{ id: 'p1', slug: 'taza', category_slug: 'cocina' }, { id: 'p2', slug: 'mesa', category_slug: 'muebles' }]
const doc = (blocks) => ({ regions: { main: { children: Object.keys(blocks) } }, blocks })

test('scanProductUsage matches cards by id or slug and keeps grids', () => {
  const drafts = [
    { page: { id: 'a', title: 'Inicio' }, document: doc({ b1: { type: 'ProductCardBlock', props: { productId: 'taza' } }, b2: { type: 'ProductsGridBlock', props: { categorySlug: 'muebles' } } }) },
    { page: { id: 'b', title: 'Tienda' }, document: doc({ b1: { type: 'ProductCardBlock', props: { productId: 'p1' } }, b2: { type: 'ProductCardBlock', props: { productId: 'nope' } } }) },
  ]
  const usage = scanProductUsage(drafts, products)
  assert.deepEqual(usage.cards.get('p1').map((p) => p.id), ['a', 'b'])
  assert.equal(usage.cards.has('p2'), false)
  assert.deepEqual(gridsShowing(products[1], usage.grids).map((g) => g.page.id), ['a'])
  assert.equal(gridsShowing(products[0], usage.grids).length, 0)
})

test('appendProductCard adds one block at the end and never mutates', () => {
  const original = doc({ b1: { id: 'b1', type: 'HeroBlock', props: {} } })
  const next = appendProductCard(original, products[0])
  const last = next.regions.main.children.at(-1)
  assert.equal(last.startsWith('catalog_'), true)
  assert.equal(next.blocks[last].props.productId, 'taza')
  assert.equal(original.regions.main.children.length, 1)
  assert.equal(appendProductCard({}, products[0]), null)
})
