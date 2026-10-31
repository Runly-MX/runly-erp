import test from 'node:test'
import assert from 'node:assert/strict'
import { EVENT_CATALOG } from '../event-catalog.js'
import { render } from '../automation-runtime.js'

test('every record link is an app route built only from fields its event carries', () => {
  for (const [key, entry] of Object.entries(EVENT_CATALOG)) {
    if (!entry.link) continue
    assert.match(entry.link, /^\/app\/m\/runly\.[a-z]+/, key)
    const keys = new Set(entry.fields.map((field) => field.key))
    for (const [, name] of entry.link.matchAll(/\{\{(\w+)\}\}/g)) assert.ok(keys.has(name), `${key}: ${name}`)
  }
})

test('deleted records have no screen to open', () => {
  for (const [key, entry] of Object.entries(EVENT_CATALOG)) if (/\.deleted$/.test(key)) assert.equal(entry.link, undefined, key)
})

test('a record link renders to the record screen', () => {
  assert.equal(render(EVENT_CATALOG['inventory.item.created'].link, { id: 'abc' }), '/app/m/runly.inventory/inventory/abc')
})
