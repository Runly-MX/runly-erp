import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const helpDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../manifests/official/help')
const capabilities = JSON.parse(fs.readFileSync(path.join(helpDir, 'capabilities.json'), 'utf8'))
const moduleKeys = fs.readdirSync(helpDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)

describe('help capabilities.json (public "Lo que puedes hacer" section)', () => {
  it('has an entry for every module with help and no orphans', () => {
    assert.deepEqual(Object.keys(capabilities).sort(), moduleKeys.sort())
  })

  it('every highlight has icon, title and text', () => {
    for (const [key, entry] of Object.entries(capabilities)) {
      assert.ok(entry.highlights.length >= 3, `${key} needs at least 3 highlights`)
      for (const h of entry.highlights) {
        assert.ok(h.icon && h.title && h.text, `${key}: incomplete highlight ${JSON.stringify(h)}`)
      }
      for (const c of entry.compat ?? []) assert.equal(typeof c, 'string', `${key}: compat must be strings`)
    }
  })
})
