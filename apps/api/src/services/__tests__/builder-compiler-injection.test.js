// F1B.0: the Builder compiler is a code authority ("builder-compiler"), so no
// value in a ModuleDefinition may escape into executable code. For every text
// value of every Builder template, the value is replaced by a payload that
// breaks any context except a quoted string literal or a line comment
// (backtick, double quote, braces, JSX "<", "*/", "${...}"); the definition
// must then be rejected by validation or compile into files that still parse.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { compileModule } from '@runly/module-compiler'
import { BUILDER_TEMPLATE_KEYS, buildDefinitionFromTemplate } from '../module-builder-templates.js'

const esbuild = createRequire(import.meta.url)('esbuild')
const PAYLOADS = [
  'Zq"`{<}>*/${globalThis.__f1b=1}Zq',
  "Zq'\\\n`{<}>*/${globalThis.__f1b=1}Zq",
]

function leaves(value, path = []) {
  if (typeof value === 'string') return [path]
  if (Array.isArray(value)) return value.flatMap((item, index) => leaves(item, [...path, index]))
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => leaves(item, [...path, key]))
  return []
}

function withValue(definition, path, payload) {
  const copy = structuredClone(definition)
  let node = copy
  for (const key of path.slice(0, -1)) node = node[key]
  node[path.at(-1)] = payload
  return copy
}

function parseError(file) {
  if (!/\.(m?js|jsx)$/.test(file.path)) return null
  try {
    esbuild.transformSync(file.content, { loader: 'jsx', format: 'esm', sourcefile: file.path, logLevel: 'silent' })
    return null
  } catch (error) {
    return error.errors?.[0]?.text ?? error.message
  }
}

// Regression for the two escapes F1B.0 found (field default, PWA short name):
// a value that keeps the file parseable but closes the quote must not run on import.
test('a quote-closing default or short name stays data in the emitted module', () => {
  const definition = buildDefinitionFromTemplate('simple-crud', { moduleKey: 'custom.f1b_fuzz', name: 'Fuzz', description: 'Fuzz', icon: 'Package', color: '#2563EB' })
  definition.entities[0].fields[0].default = "x' + String(globalThis.__f1b = 1) + '"
  definition.pwa.shortName = "'+(globalThis)+'".slice(0, 14)
  const { files } = compileModule(definition)
  const model = files.find((f) => f.path.startsWith('models/'))
  assert.match(model.content, /default: "x' \+ String\(globalThis\.__f1b = 1\) \+ '"/)
  assert.match(files.find((f) => f.path === 'module.manifest.js').content, /shortName: "'\+\(globalThis\)",/)
})

for (const templateKey of BUILDER_TEMPLATE_KEYS.filter((key) => key !== 'blank')) {
  test(`Builder template "${templateKey}": no definition value escapes a string literal`, () => {
    const definition = buildDefinitionFromTemplate(templateKey, { moduleKey: 'custom.f1b_fuzz', name: 'Fuzz', description: 'Fuzz', icon: 'Package', color: '#2563EB' })
    const baseline = compileModule(definition).files.map(parseError).filter(Boolean)
    assert.deepEqual(baseline, [], 'the unmodified template must compile to parseable code')
    const escapes = []
    let compiled = 0
    for (const path of leaves(definition)) {
      for (const payload of PAYLOADS) {
        let files
        try { files = compileModule(withValue(definition, path, payload)).files } catch { continue }
        compiled++
        for (const file of files) {
          const error = parseError(file)
          if (error) escapes.push(`${path.join('.')} -> ${file.path}: ${error}`)
        }
      }
    }
    assert.ok(compiled > 0, 'at least one mutated definition must be accepted, otherwise the fuzz proves nothing')
    assert.deepEqual(escapes, [])
  })
}
