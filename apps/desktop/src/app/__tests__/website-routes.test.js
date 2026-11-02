import test from 'node:test'
import assert from 'node:assert/strict'
import { isPathAllowedByNavigation, resolveScreen } from '../module-screen-resolver.js'

// The real manifest (backend-owned) lists these entries for runly.website.
const website = {
  key: 'runly.website',
  navigation: [
    { path: '/', permissionKey: 'website.access' },
    { label: 'Contenido', children: [{ path: '/pages' }, { path: '/blog' }] },
  ],
}

test('website /sites/* routes are reachable when the root entry is visible', () => {
  assert.equal(isPathAllowedByNavigation(website, '/sites'), true)
  assert.equal(isPathAllowedByNavigation(website, '/sites/abc/pages'), true)
  assert.equal(isPathAllowedByNavigation(website, '/sites/abc/pages/p1/editor'), true)
})

test('website /sites/* routes stay closed without the root entry or in other modules', () => {
  const noRoot = { key: 'runly.website', navigation: [{ label: 'Contenido', children: [{ path: '/pages' }] }] }
  assert.equal(isPathAllowedByNavigation(noRoot, '/sites/abc/pages'), false)
  assert.equal(isPathAllowedByNavigation({ key: 'runly.notes', navigation: [{ path: '/' }] }, '/sites/abc'), false)
})

test('website screens: root and /sites/* share one router, legacy paths redirect', () => {
  const map = {
    'runly.website:/sites': 'ROUTER',
    'runly.website:/legacy/pages': 'LEGACY_PAGES',
    'runly.website:/legacy/settings': 'LEGACY_SETTINGS',
    'runly.website:/pages/:id/editor': 'LEGACY_EDITOR',
    'runly.website:/forms': 'FORMS',
  }
  assert.equal(resolveScreen(map, 'runly.website', '/', null), 'ROUTER')
  assert.equal(resolveScreen(map, 'runly.website', '/sites/s1/pages/p1/editor', null), 'ROUTER')
  assert.equal(resolveScreen(map, 'runly.website', '/pages', null), 'LEGACY_PAGES')
  assert.equal(resolveScreen(map, 'runly.website', '/settings', null), 'LEGACY_SETTINGS')
  assert.equal(resolveScreen(map, 'runly.website', '/pages/p1/editor', null), 'LEGACY_EDITOR')
  assert.equal(resolveScreen(map, 'runly.website', '/forms', null), 'FORMS')
})
