import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ADAPTER_HOOKS, asRows, assertInventoryAdapter, createInventoryDataContext, createdRow } from '../inventory-data-context.js'

const adapter = (tag) => Object.fromEntries(ADAPTER_HOOKS.map((key) => [key, () => `${tag}:${key}`]))

describe('inventory data adapter seam', () => {
  it('uses the default adapter without a provider and the injected one inside a provider', () => {
    const ctx = createInventoryDataContext(adapter('main'))
    const Probe = () => createElement('i', null, ctx.useData().useModelRows())
    assert.equal(renderToStaticMarkup(createElement(Probe)), '<i>main:useModelRows</i>')
    const html = renderToStaticMarkup(createElement(ctx.Provider, { value: adapter('guest') }, createElement(Probe)))
    assert.equal(html, '<i>guest:useModelRows</i>')
  })

  it('rejects an adapter that misses a hook', () => {
    assert.throws(() => assertInventoryAdapter({ useModelRows() {} }), /missing/)
    assert.doesNotThrow(() => assertInventoryAdapter(adapter('x')))
  })

  it('normalizes list and create responses of both data sources', () => {
    assert.deepEqual(asRows([{ id: 1 }]), [{ id: 1 }])
    assert.deepEqual(asRows({ data: [{ id: 2 }] }), [{ id: 2 }])
    assert.deepEqual(asRows(undefined), [])
    assert.deepEqual(createdRow({ data: { id: 'a' } }), { id: 'a' })
    assert.deepEqual(createdRow({ id: 'b', name: 'X', reused: true }), { id: 'b', name: 'X', reused: true })
  })
})
