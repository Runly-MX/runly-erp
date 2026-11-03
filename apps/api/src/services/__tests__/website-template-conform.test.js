import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { conformTemplateDocument, nearestOption } from '../website-template-conform.js'
import { allTemplates } from '../../../../desktop/src/website/runlyTemplates/index.js'
import { normalizeWebsiteDocument } from '../website-draft-service.js'

const definitions = new Map(createRequire(import.meta.url)('../../routes/website/block-catalog.json').blocks.map((b) => [b.type, b]))

test('nearestOption snaps across units and ignores unparsable input', () => {
  assert.equal(nearestOption('72', ['48', '56', '64', '80']), '64')
  assert.equal(nearestOption('90vh', ['', '200px', '360px', '480px', '600px', '100vh']), '100vh')
  assert.equal(nearestOption('60ch', ['', '40ch', '65ch', '768px']), '65ch')
  assert.equal(nearestOption('abc', ['1', '2']), null)
})

// Same rule the release service enforces on publish (website-release-service.js).
test('every built-in template page passes the publish rules for block props once conformed', () => {
  let checked = 0
  for (const template of allTemplates) for (const page of template.pages) {
    const document = conformTemplateDocument(normalizeWebsiteDocument(page.page, { strict: true }))
    for (const block of Object.values(document.blocks)) {
      const definition = definitions.get(block.type)
      for (const [name, value] of Object.entries(block.props ?? {})) {
        const field = definition.fields[name]
        assert.ok(field, `${template.id}/${page.id} ${block.type}.${name} is unknown`)
        if (value == null || JSON.stringify(value) === JSON.stringify(definition.defaultProps?.[name])) continue
        if (field.type === 'select') assert.ok(field.options.includes(value), `${template.id}/${page.id} ${block.type}.${name}=${value}`)
        checked += 1
      }
    }
  }
  assert.ok(checked > 100)
})
