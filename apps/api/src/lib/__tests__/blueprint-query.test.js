import test from 'node:test'
import assert from 'node:assert/strict'
import { applyBlueprintQuery, parseBlueprintQuery } from '../blueprint-query.js'

const rows = [
  { key: 'a.form', moduleKey: 'a', kind: 'FORM', schema: { x: 1 }, module: { key: 'a', has_bundle: true, manifest: { big: true }, lifecycleConfig: { k: 1 } } },
  { key: 'a.help', kind: 'HELP', schema: { h: 1 }, module: { key: 'a', manifest: { big: true } } },
  { key: 'b.table', moduleKey: 'b', kind: 'TABLE', schema: { y: 1 }, module: { key: 'b', manifest: {} } },
]

test('without parameters the response is the same array', () => {
  assert.equal(applyBlueprintQuery(rows, {}), rows)
  assert.equal(applyBlueprintQuery(rows, { unknown: 'x' }), rows)
})

test('moduleKey and kind only remove rows; module comes from the row or its embedded module', () => {
  assert.deepEqual(applyBlueprintQuery(rows, { moduleKey: 'a' }).map((r) => r.key), ['a.form', 'a.help'])
  assert.deepEqual(applyBlueprintQuery(rows, { moduleKey: 'a,b', kind: 'form,table' }).map((r) => r.key), ['a.form', 'b.table'])
  assert.deepEqual(applyBlueprintQuery(rows, { moduleKey: 'zzz' }), [])
})

test('slim drops only manifest and lifecycleConfig; schema=0 drops only schema; originals are untouched', () => {
  const slim = applyBlueprintQuery(rows, { slim: '1' })
  assert.deepEqual(slim[0].module, { key: 'a', has_bundle: true })
  assert.deepEqual(slim[0].schema, { x: 1 })
  assert.ok('manifest' in rows[0].module)
  const meta = applyBlueprintQuery(rows, { schema: '0' })
  assert.ok(!('schema' in meta[0]) && meta[0].module.manifest)
})

test('the parser tolerates junk and caps the list length', () => {
  assert.equal(parseBlueprintQuery({ moduleKey: Array(200).fill('m').join(',') }).moduleKeys.size, 1)
  assert.equal(parseBlueprintQuery({ moduleKey: ['x'], kind: 5 }).moduleKeys.size, 0)
})
