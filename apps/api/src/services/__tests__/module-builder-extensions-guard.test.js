// F1B.0: extension code (server-imported views/*.custom.js, browser components)
// cannot be added or changed through a Builder definition sent by the client.
import test from 'node:test'
import assert from 'node:assert/strict'
import { guardClientExtensions } from '../module-builder-service.js'

const stored = {
  files: [{ path: 'views/panel.custom.js', content: 'export default {}\n' }, { path: 'components/index.js', content: 'export {}\n' }],
  views: [{ file: 'views/panel.custom.js' }],
}
const denied = (fn) => assert.throws(fn, (error) => error.code === 'BUILDER_EXTENSIONS_READ_ONLY' && error.statusCode === 403)

test('a client cannot add extension code to a project', () => {
  denied(() => guardClientExtensions(stored, null))
  denied(() => guardClientExtensions({ files: [{ path: 'views/x.custom.js', content: "globalThis.x = 1\nexport default {}" }], views: [{ file: 'views/x.custom.js' }] }))
})

test('a client cannot change stored extension code', () => {
  denied(() => guardClientExtensions({ ...stored, files: [{ ...stored.files[0], content: 'globalThis.x = 1\nexport default {}\n' }, stored.files[1]] }, stored))
  denied(() => guardClientExtensions({ ...stored, files: [...stored.files, { path: 'components/Extra.jsx', content: 'x' }] }, stored))
})

test('keeping the stored extensions (any key order) or removing them is allowed', () => {
  assert.doesNotThrow(() => guardClientExtensions({ views: stored.views, files: stored.files.map(({ content, path }) => ({ content, path })) }, stored))
  assert.doesNotThrow(() => guardClientExtensions(null, stored))
  assert.doesNotThrow(() => guardClientExtensions({ files: [], views: [], navigation: [] }, stored))
  assert.doesNotThrow(() => guardClientExtensions(undefined, stored))
  // The editor removes screens one by one: a subset of the stored files is fine.
  assert.doesNotThrow(() => guardClientExtensions({ files: [stored.files[1]], views: [] }, stored))
})
