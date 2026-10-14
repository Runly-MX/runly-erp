import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSinabe } from '../source.mjs'
import { generateSynthetic } from '../synthetic.mjs'
import { buildModel } from '../mapping/index.mjs'
import { pickPilot, pilotFileKeys } from '../pilot.mjs'

test('pilot: representative size, whole custody records, and the files it needs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sinabe-pilot-'))
  try {
    await generateSynthetic({ out: dir, items: 300, seed: 7, bytesScale: 0.0001 })
    const model = buildModel(await loadSinabe(join(dir, 'sinabe-synthetic.sql')))
    const ids = pickPilot(model, 50)
    assert.equal(ids.length, 50)
    assert.equal(new Set(ids).size, 50)
    const picked = new Set(ids)
    // The pilot carries whole completed custody records, so they can really be imported.
    const whole = model.custodyRecords.filter((r) => r.status === 'COMPLETADO' && (model.custodyItemsByRecord.get(r.id) ?? []).length && (model.custodyItemsByRecord.get(r.id) ?? []).every((row) => picked.has(row.inventoryId)))
    assert.ok(whole.length >= 3, `whole custody records in pilot: ${whole.length}`)
    const keys = pilotFileKeys(model, ids)
    assert.ok(keys.length > 0)
    assert.ok(keys.every((k) => !k.startsWith('/') && !k.includes('..')))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
