// Builder -> declarative converter: nothing disappears without a report entry,
// meaning changes are flagged, code is never executed, and classification is
// conservative.
import test from 'node:test'
import assert from 'node:assert/strict'
import { convertModuleDefinition, classifyWithoutDefinition } from '../converter.js'
import { BUILDER_TEMPLATE_KEYS, buildDefinitionFromTemplate } from '../../services/module-builder-templates.js'

const meta = (k) => ({ moduleKey: `custom.cv_${k.replace(/-/g, '_')}`, name: 'Conv', description: 'Conv', icon: 'Package', color: '#2563EB' })

test('every Builder template converts and every field is accounted for', () => {
  for (const key of BUILDER_TEMPLATE_KEYS.filter((k) => k !== 'blank')) {
    const def = buildDefinitionFromTemplate(key, meta(key))
    const r = convertModuleDefinition(def)
    assert.ok(['FULLY_DECLARATIVE', 'DECLARATIVE_WITH_REVIEW'].includes(r.classification), `${key}: ${r.classification}`)
    for (const entity of def.entities) for (const field of entity.fields) {
      const key2 = field.key ?? field.name
      const converted = r.declarative.entities.find((e) => e.key === entity.key)?.fields.some((f) => f.key === key2)
      const reported = r.report.some((e) => e.path === `entities.${entity.key}.fields.${key2}`)
      assert.ok(converted || reported, `${key}: field ${key2} vanished`)
      if (!converted) assert.ok(r.report.some((e) => e.path === `entities.${entity.key}.fields.${key2}` && e.kind === 'review'), `${key}: dropped field ${key2} must be a review item`)
    }
    assert.equal(r.declarative.entities[0].table, `${def.key.slice('custom.'.length)}_${def.entities[0].key}`)
  }
})

test('meaning changes are reported, never silent', () => {
  const def = buildDefinitionFromTemplate('simple-crud', meta('mc'))
  def.entities[0].fields.push({ key: 'tags', type: 'multiselect', label: 'Etiquetas', options: ['a', 'b'] }, { key: 'body', type: 'markdown', label: 'Cuerpo' }, { key: 'extra', type: 'json', label: 'Extra' })
  const r = convertModuleDefinition(def)
  const kind = (k) => r.report.find((e) => e.path.endsWith(`.fields.${k}`))?.kind
  assert.equal(kind('tags'), 'review'); assert.equal(kind('extra'), 'review'); assert.equal(kind('body'), 'transformed')
  assert.equal(r.classification, 'DECLARATIVE_WITH_REVIEW')
})

test('custom code makes it hybrid; global (non company-scoped) entities are unsupported', () => {
  const withCode = buildDefinitionFromTemplate('simple-crud', meta('hy'))
  withCode.extensions = { files: [{ path: 'components/index.js', content: 'globalThis.__converterRan = true' }], views: [] }
  assert.equal(convertModuleDefinition(withCode).classification, 'HYBRID_REQUIRED')
  assert.equal(globalThis.__converterRan, undefined, 'the converter never executes module code')
  const global = buildDefinitionFromTemplate('simple-crud', meta('gl'))
  global.entities[0].companyScoped = false
  assert.equal(convertModuleDefinition(global).classification, 'UNSUPPORTED')
})

test('modules without a Builder definition are classified only by trust', () => {
  assert.equal(classifyWithoutDefinition({ trustState: 'trusted' }), 'LEGACY_TRUSTED')
  assert.equal(classifyWithoutDefinition({ trustState: 'quarantined' }), 'QUARANTINED')
})
