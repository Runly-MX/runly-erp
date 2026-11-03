import test from 'node:test'
import assert from 'node:assert/strict'
import { isPathAllowedByNavigation, resolveScreen } from '../module-screen-resolver.js'

// The real manifest (backend-owned) lists these entries for runly.website.
const website = {
  key: 'runly.website',
  manifest: { authorizedRoutes: ['/sites', '/sites/:siteId/pages', '/sites/:siteId/pages/:pageId/editor'] },
  navigation: [
    { path: '/', permissionKey: 'website.access' },
    { label: 'Contenido', children: [{ path: '/pages' }, { path: '/blog' }] },
  ],
}

test('website routes require exact server-authorized route patterns', () => {
  assert.equal(isPathAllowedByNavigation(website, '/sites'), true)
  assert.equal(isPathAllowedByNavigation(website, '/sites/abc/pages'), true)
  assert.equal(isPathAllowedByNavigation(website, '/sites/abc/pages/p1/editor'), true)
  assert.equal(isPathAllowedByNavigation(website, '/sites/new'), false)
  assert.equal(isPathAllowedByNavigation(website, '/sites/abc/settings'), false)
  assert.equal(isPathAllowedByNavigation(website, '/sites/abc/pages/p1/editor/extra'), false)
  assert.equal(isPathAllowedByNavigation({ ...website, manifest: {} }, '/sites/abc/pages'), false)
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

test('website sub-sections missing from the manifest inherit their parent policy', () => {
  const manifest = (paths) => ({ key: 'runly.website', manifest: { authorizedRoutes: paths }, navigation: [] })
  const reader = manifest(['/sites/:siteId', '/sites/:siteId/blog'])
  assert.equal(isPathAllowedByNavigation(reader, '/sites/s1/catalog'), true)
  assert.equal(isPathAllowedByNavigation(reader, '/sites/s1/blog/post1'), true)
  assert.equal(isPathAllowedByNavigation(reader, '/sites/s1/payments'), false)
  assert.equal(isPathAllowedByNavigation(reader, '/sites/s1/advanced'), false)
  const editor = manifest(['/sites/:siteId', '/sites/:siteId/settings'])
  assert.equal(isPathAllowedByNavigation(editor, '/sites/s1/payments'), true)
  assert.equal(isPathAllowedByNavigation(editor, '/sites/s1/blog/post1'), false)
  assert.equal(isPathAllowedByNavigation(manifest([]), '/sites/s1/catalog'), false)
})
