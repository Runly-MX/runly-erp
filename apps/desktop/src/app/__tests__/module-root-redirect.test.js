import test from 'node:test'
import assert from 'node:assert/strict'
import { moduleRootRedirect } from '../moduleRootRedirect.js'

const notes = { key: 'runly.notes', navigation: [{ path: '/notes' }, { path: '/shared' }] }

test('the module root redirect keeps the deep-link query string and hash', () => {
  assert.equal(moduleRootRedirect(notes, '/', { search: '?note=0192-abc', hash: '#top' }), '/app/m/runly.notes/notes?note=0192-abc#top')
  assert.equal(moduleRootRedirect(notes, '/', { search: '?folder=f1&note=n1' }), '/app/m/runly.notes/notes?folder=f1&note=n1')
})

test('the module root redirect without parameters is unchanged', () => {
  assert.equal(moduleRootRedirect(notes, '/'), '/app/m/runly.notes/notes')
  assert.equal(moduleRootRedirect({ key: 'x', navigation: [{ path: '/app/m/other/list' }] }, '/'), '/app/m/other/list')
})

test('a navigation item that already has a query merges the incoming parameters', () => {
  assert.equal(moduleRootRedirect({ key: 'x', navigation: [{ path: '/list?view=all' }] }, '/', { search: '?id=1' }), '/app/m/x/list?view=all&id=1')
})

test('no redirect for sub-paths, a root navigation item, or an empty navigation', () => {
  assert.equal(moduleRootRedirect(notes, '/notes', { search: '?note=1' }), null)
  assert.equal(moduleRootRedirect({ key: 'x', navigation: [{ path: '/' }, { path: '/a' }] }, '/'), null)
  assert.equal(moduleRootRedirect({ key: 'x', navigation: [] }, '/'), null)
})
