// F1A section D: authentication must not be skippable through path variants.
// Mirrors index.js mountWithAuth() (not importable: index.js boots the server)
// with the same Hono version and default router, plus a param route, a
// wildcard route and a nested router like the real ones.
import test from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'

function mountWithAuth(baseApp, router, auth) {
  const secured = new Hono()
  secured.use('*', auth)
  secured.route('/', router)
  baseApp.route('/', secured)
}

function buildApp() {
  const reached = []
  const auth = async (c, next) => (c.req.header('Authorization') === 'Bearer ok' ? next() : c.json({ error: 'unauthorized' }, 401))
  const app = new Hono()
  // Public routes must be registered before the first mountWithAuth (see last test).
  app.get('/health', (c) => c.json({ ok: true }))
  const modules = new Hono()
  modules.get('/modules', (c) => { reached.push(c.req.path); return c.json({ ok: true }) })
  modules.post('/modules/:key/upload', (c) => { reached.push(c.req.path); return c.json({ ok: true }) })
  modules.get('/files/*', (c) => { reached.push(c.req.path); return c.json({ ok: true }) })
  const nested = new Hono()
  nested.get('/:id', (c) => { reached.push(c.req.path); return c.json({ ok: true }) })
  modules.route('/identity/users', nested)
  mountWithAuth(app, modules, auth)
  app.get('/late-public', (c) => { reached.push(c.req.path); return c.json({ ok: true }) })
  return { app, reached }
}

const VARIANTS = [
  ['GET', '/modules'], ['GET', '/modules/'], ['GET', '//modules'], ['GET', '/MODULES'], ['GET', '/%6Dodules'],
  ['GET', '/modules%0A'], ['GET', '/modules%0D'], ['GET', '/modules%E2%80%A8'], ['GET', '/./modules'], ['GET', '/x/../modules'],
  ['GET', '/modules;x'], ['GET', '/modules%2F'], ['GET', '/%2Fmodules'], ['GET', '/modules?x=1'], ['GET', '/modules#x'],
  ['POST', '/modules/custom.x/upload'], ['POST', '/modules/custom.x%2Fupload'], ['POST', '/modules/custom.x/upload/'],
  ['POST', '/modules//custom.x/upload'], ['POST', '/modules/custom.x/%75pload'], ['POST', '/modules/custom.x/upload%0A'],
  ['GET', '/files/a'], ['GET', '/files/a/b'], ['GET', '/files/%2e%2e/modules'], ['GET', '/files\\a'],
  ['GET', '/identity/users/1'], ['GET', '/identity/users/1/'], ['GET', '/identity//users/1'], ['GET', '/identity/users/%31'],
]

test('no path variant reaches an authenticated handler without credentials', async () => {
  const { app, reached } = buildApp()
  for (const [method, path] of VARIANTS) {
    const res = await app.request(`http://localhost${path}`, { method })
    assert.ok([401, 404].includes(res.status), `${method} ${path} -> ${res.status}`)
  }
  assert.deepEqual(reached, [], 'a handler ran without authentication')
})

test('the same routes work with credentials and public routes stay public', async () => {
  const { app } = buildApp()
  const ok = { headers: { Authorization: 'Bearer ok' } }
  assert.equal((await app.request('http://localhost/modules', ok)).status, 200)
  assert.equal((await app.request('http://localhost/modules/custom.x/upload', { ...ok, method: 'POST' })).status, 200)
  assert.equal((await app.request('http://localhost/identity/users/1', ok)).status, 200)
  assert.equal((await app.request('http://localhost/health')).status, 200)
})

// Hono turns the secured sub-app's use('*') into a parent-level '/*' middleware:
// a route registered after mountWithAuth is gated too. Fail-safe, but a public
// route added below the first mountWithAuth in index.js silently needs a token.
test('routes registered after mountWithAuth inherit its authentication', async () => {
  const { app, reached } = buildApp()
  assert.equal((await app.request('http://localhost/late-public')).status, 401)
  assert.deepEqual(reached, [])
})
