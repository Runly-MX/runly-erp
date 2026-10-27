import test from 'node:test'
import assert from 'node:assert/strict'
import { EVENT_CATALOG } from '../event-catalog.js'

test('every catalog event and field is fully documented', () => {
  for (const [key, event] of Object.entries(EVENT_CATALOG)) {
    for (const prop of ['module', 'label', 'description']) assert.ok(event[prop], `${key}.${prop}`)
    assert.ok(event.fields.length > 0, `${key} has fields`)
    const seen = new Set()
    for (const f of event.fields) {
      for (const prop of ['key', 'label', 'type', 'description', 'example']) assert.ok(f[prop], `${key}.${f.key}.${prop}`)
      assert.ok(!seen.has(f.key), `${key} repeats ${f.key}`)
      seen.add(f.key)
    }
  }
})
