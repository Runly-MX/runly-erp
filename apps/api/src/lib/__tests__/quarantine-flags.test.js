import test from 'node:test'
import assert from 'node:assert/strict'
import { flagQuarantinedModules } from '../quarantine-flags.js'

const rows = [
  { key: 'a.v', module: { key: 'custom.a', has_bundle: true } },
  { key: 'a.w', module: { key: 'custom.a', has_bundle: true } },
  { key: 'b.v', module: { key: 'custom.b', has_bundle: true } },
  { key: 'c.v', module: { key: 'runly.c', has_bundle: false } },
]

test('only quarantined bundled modules are flagged; others are returned untouched', async () => {
  const seen = []
  const out = await flagQuarantinedModules(rows, async (key) => { seen.push(key); return key === 'custom.a' })
  assert.deepEqual(out.map((r) => !!r.module.quarantined), [true, true, false, false])
  assert.deepEqual(seen.sort(), ['custom.a', 'custom.b'], 'one check per bundled module, none for modules without a bundle')
  assert.equal(out[2], rows[2])
  assert.ok(!('quarantined' in rows[0].module), 'input is not mutated')
})

test('a failing trust check does not flag (the server still refuses the bundle with 423)', async () => {
  const out = await flagQuarantinedModules(rows, async () => { throw new Error('boom') })
  assert.equal(out, rows)
})
