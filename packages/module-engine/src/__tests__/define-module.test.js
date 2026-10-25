import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defineRunlyModule, validateManifest } from '../define-module.js'
import { ModuleEngineError } from '../errors.js'

const VALID = {
  key: 'custom.fleet',
  name: 'Flota',
  version: '0.1.0',
  kind: 'FEATURE',
  icon: 'Truck',
  color: '#2563eb',
  pwa: {
    shortName: 'Flota',
    startPath: '/vehicles',
  },
}

test('defineRunlyModule - returns manifest with key preserved', () => {
  const r = defineRunlyModule(VALID)
  assert.equal(r.key, 'custom.fleet')
  assert.equal(r.name, 'Flota')
  assert.equal(r.version, '0.1.0')
})

test('defineRunlyModule - applies default kind when omitted', () => {
  const r = defineRunlyModule({ key: 'custom.demo', name: 'Demo', version: '0.1.0' })
  assert.equal(r.kind, 'FEATURE')
})

test('defineRunlyModule - applies empty permissions and navigation by default', () => {
  const r = defineRunlyModule(VALID)
  assert.deepEqual(r.permissions, [])
  assert.deepEqual(r.navigation, [])
  assert.deepEqual(r.migrations, [])
})

test('defineRunlyModule - accepts manifest migrations with checksum', () => {
  const r = defineRunlyModule({
    ...VALID,
    migrations: [
      {
        path: './migrations/V001.sql',
        checksum: '6fb977adcf2206dc43f6d8a3ec4ce6e9de8ef20db1917cacc39cbf403a8f4f16',
      },
    ],
  })
  assert.equal(r.migrations.length, 1)
})

test('defineRunlyModule - throws for invalid migrations checksum', () => {
  assert.throws(
    () =>
      defineRunlyModule({
        ...VALID,
        migrations: [{ path: './migrations/V001.sql', checksum: 'abc' }],
      }),
    (err) => err instanceof ModuleEngineError && err.message.includes('checksum')
  )
})

test('defineRunlyModule - throws ModuleEngineError (not plain Error) when key is missing', () => {
  assert.throws(
    () => defineRunlyModule({ name: 'Flota', version: '0.1.0' }),
    (err) => err instanceof ModuleEngineError && err.message.includes('key')
  )
})

test('defineRunlyModule - throws when name is missing', () => {
  assert.throws(
    () => defineRunlyModule({ key: 'custom.fleet', version: '0.1.0' }),
    (err) => err instanceof ModuleEngineError && err.message.includes('name')
  )
})

test('defineRunlyModule - throws when version is missing', () => {
  assert.throws(
    () => defineRunlyModule({ key: 'custom.fleet', name: 'Flota' }),
    (err) => err instanceof ModuleEngineError && err.message.includes('version')
  )
})

test('defineRunlyModule - throws when version is not semver', () => {
  assert.throws(
    () => defineRunlyModule({ key: 'custom.fleet', name: 'Flota', version: 'latest' }),
    (err) => err instanceof ModuleEngineError && err.message.includes('version')
  )
})

test('defineRunlyModule - throws when kind is invalid', () => {
  assert.throws(
    () => defineRunlyModule({ ...VALID, kind: 'UNKNOWN' }),
    (err) => err instanceof ModuleEngineError && err.message.includes('kind')
  )
})

test('defineRunlyModule - throws when key has path traversal', () => {
  assert.throws(
    () => defineRunlyModule({ ...VALID, key: '../evil' }),
    (err) => err instanceof ModuleEngineError && err.message.includes('key')
  )
})

test('defineRunlyModule - throws when key has no dot separator', () => {
  assert.throws(
    () => defineRunlyModule({ ...VALID, key: 'fleet' }),
    (err) => err instanceof ModuleEngineError && err.message.includes('key')
  )
})

test('defineRunlyModule - throws when navigation item lacks permissionKey', () => {
  assert.throws(
    () => defineRunlyModule({ ...VALID, navigation: [{ label: 'X', path: '/x' }] }),
    (err) => err instanceof ModuleEngineError && err.message.includes('permissionKey')
  )
})

test('validateManifest - returns valid:true for correct manifest', () => {
  const r = validateManifest(VALID)
  assert.equal(r.valid, true)
  assert.deepEqual(r.errors, [])
})

test('validateManifest - returns valid:false without throwing for empty object', () => {
  const r = validateManifest({})
  assert.equal(r.valid, false)
  assert.ok(r.errors.some((e) => e.includes('key')))
  assert.ok(r.errors.some((e) => e.includes('name')))
  assert.ok(r.errors.some((e) => e.includes('version')))
})

test('validateManifest - handles null without throwing', () => {
  assert.equal(validateManifest(null).valid, false)
})

test('validateManifest - handles non-object without throwing', () => {
  assert.equal(validateManifest('bad').valid, false)
})

test('validateManifest - requires explicit PWA identity for custom modules', () => {
  const result = validateManifest({
    key: 'custom.demo',
    name: 'Demo',
    version: '0.1.0',
  })

  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => error.includes('icon')))
  assert.ok(result.errors.some((error) => error.includes('color')))
  assert.ok(result.errors.some((error) => error.includes('pwa.shortName')))
  assert.ok(result.errors.some((error) => error.includes('pwa.startPath')))
})

test('validateManifest - rejects unsafe PWA start paths', () => {
  const result = validateManifest({
    ...VALID,
    pwa: { ...VALID.pwa, startPath: '/../admin' },
  })

  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => error.includes('pwa.startPath')))
})

test('validateManifest - rejects non-hex module colors', () => {
  const result = validateManifest({
    ...VALID,
    color: 'purple',
  })

  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => error.includes('color')))
})

test('defineRunlyModule - derives a relative start path for legacy modules', () => {
  const module = defineRunlyModule({
    key: 'custom.legacy',
    name: 'Legacy',
    version: '1.0.0',
    navigation: [
      {
        label: 'Inicio',
        path: '/app/m/custom.legacy/dashboard',
        permissionKey: 'legacy.read',
      },
    ],
  })

  assert.equal(module.pwa.startPath, '/dashboard')
})

test('defineRunlyModule - falls back safely for unsupported legacy icons', () => {
  const module = defineRunlyModule({
    key: 'custom.legacy',
    name: 'Legacy',
    version: '1.0.0',
    icon: 'OldPrivateIcon',
    color: 'purple',
  })

  assert.equal(module.icon, 'Box')
  assert.equal(module.color, '#6366f1')
  assert.equal(module.pwa.legacyDerived, true)
})

const KIND = { name: 'invoice', label: 'Factura', model: 'invoice', permission: 'custom_fleet.invoice.read', fields: [{ tag: 'number', label: 'Número', type: 'text' }, { tag: 'total', label: 'Total', type: 'number' }] }

test('defineRunlyModule - accepts documentKinds and keeps them in the manifest', () => {
  const r = defineRunlyModule({ ...VALID, documentKinds: [KIND] })
  assert.deepEqual(r.documentKinds, [KIND])
})

test('validateManifest - documentKinds rejects bad names, duplicate tags, unknown types and formats', () => {
  const bad = { ...KIND, name: 'Bad Name', formats: ['txt'], fields: [{ tag: 'a', label: 'A', type: 'text' }, { tag: 'a', label: 'B', type: 'list' }] }
  const { valid, errors } = validateManifest({ ...VALID, documentKinds: [bad, { ...KIND, permission: '' }] })
  assert.equal(valid, false)
  const text = errors.join('|')
  assert.match(text, /name must be snake_case/)
  assert.match(text, /formats must be/)
  assert.match(text, /"a" is duplicated/)
  assert.match(text, /type must be one of/)
  assert.match(text, /permission is required/)
})
