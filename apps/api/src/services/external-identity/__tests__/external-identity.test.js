import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { createExternalIdentity, createExternalAuthRouter, createExternalFiles } from '../index.js'

// Minimal in-memory stand-in for the four Prisma delegates the engine uses.
function fakePrisma() {
  const t = { realm: [], account: [], session: [], token: [], file: [] }
  const match = (row, where = {}) => Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return v.some((w) => match(row, w))
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('not' in v) return row[k] !== v.not
      if ('contains' in v) return String(row[k]).toLowerCase().includes(v.contains.toLowerCase())
    }
    return row[k] === v
  })
  // Mirrors the ON DELETE CASCADE chain realm -> account -> session/token/file.
  const cascade = (name, id) => {
    const drop = (table, key, value) => { for (let i = t[table].length - 1; i >= 0; i -= 1) if (t[table][i][key] === value) { const [r] = t[table].splice(i, 1); if (table === 'account') cascade('account', r.id) } }
    if (name === 'realm') drop('account', 'realmId', id)
    if (name === 'account') { drop('session', 'accountId', id); drop('token', 'accountId', id); drop('file', 'accountId', id) }
  }
  const delegate = (name, keys, include) => {
    const rows = t[name]
    const unique = (where) => { const [k, v] = Object.entries(where)[0]; return rows.find((r) => typeof v === 'object' ? match(r, v) : r[k] === v) }
    const withInc = (r) => r && (include ? { ...r, account: t.account.find((a) => a.id === r.accountId) } : r)
    return {
      findUnique: async ({ where }) => withInc(unique(where)) ?? null,
      findFirst: async ({ where }) => rows.find((r) => match(r, where)) ?? null,
      findMany: async ({ where, take }) => rows.filter((r) => match(r, where)).slice(0, take ?? Infinity),
      delete: async ({ where }) => { const i = rows.findIndex((r) => r.id === where.id); const [row] = rows.splice(i, 1); cascade(name, row.id); return row },
      count: async ({ where }) => rows.filter((r) => match(r, where)).length,
      create: async ({ data }) => {
        if (keys.some((ks) => rows.some((r) => ks.every((k) => r[k] === data[k])))) throw Object.assign(new Error('dup'), { code: 'P2002' })
        const row = { id: randomUUID(), createdAt: new Date(), revokedAt: null, usedAt: null, emailVerifiedAt: null, failedLogins: 0, lockedUntil: null, status: 'active', enabled: false, allowSignup: true, requireEmailVerification: true, sessionDays: 30, ...data }
        rows.push(row); return row
      },
      update: async ({ where, data }) => Object.assign(rows.find((r) => r.id === where.id), data),
      updateMany: async ({ where, data }) => { const hit = rows.filter((r) => match(r, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length } },
      deleteMany: async ({ where }) => { const before = rows.length; for (let i = rows.length - 1; i >= 0; i -= 1) if (where.id.in.includes(rows[i].id)) rows.splice(i, 1); return { count: before - rows.length } },
      aggregate: async ({ where }) => ({ _sum: { sizeBytes: rows.filter((r) => match(r, where)).reduce((n, r) => n + r.sizeBytes, 0) } }),
      upsert: async ({ where, create }) => unique(where) ?? delegate(name, keys).create({ data: create }),
    }
  }
  return {
    tables: t,
    externalRealm: delegate('realm', [['moduleKey', 'ownerId']]),
    externalAccount: delegate('account', [['realmId', 'email']]),
    externalSession: delegate('session', [['tokenHash']], true),
    externalAccountToken: delegate('token', [['tokenHash']], true),
    externalFile: delegate('file', [['objectKey']]),
  }
}

async function setup(realmPatch = {}) {
  const prisma = fakePrisma(), mail = []
  const identity = createExternalIdentity({ prisma, notify: async (m) => mail.push(m) })
  const companyId = randomUUID()
  const realmA = Object.assign(await identity.ensureRealm({ companyId, moduleKey: 'runly.website', ownerId: randomUUID() }), { enabled: true, ...realmPatch })
  const realmB = Object.assign(await identity.ensureRealm({ companyId, moduleKey: 'runly.website', ownerId: randomUUID() }), { enabled: true, ...realmPatch })
  const byHost = { 'a.test': realmA, 'b.test': realmB }
  const app = createExternalAuthRouter({ identity, resolveRealm: (c) => byHost[c.req.header('host')] ?? null })
  const call = (host, method, path, json, cookie) => app.request(path, { method, headers: { host, ...(json ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: json ? JSON.stringify(json) : undefined })
  return { prisma, identity, mail, realmA, realmB, call }
}
const cookieOf = (res) => res.headers.get('set-cookie')?.split(';')[0]

test('same email holds independent accounts per realm; a session never crosses realms', async () => {
  const { call } = await setup({ requireEmailVerification: false })
  const a = await call('a.test', 'POST', '/register', { email: 'Ana@X.com', password: 'password-aaaa', displayName: 'Ana' })
  assert.equal(a.status, 201)
  const b = await call('b.test', 'POST', '/register', { email: 'ana@x.com', password: 'password-bbbb', displayName: 'Ana B' })
  assert.equal(b.status, 201)
  assert.equal((await call('b.test', 'POST', '/login', { email: 'ana@x.com', password: 'password-aaaa' })).status, 401)
  const cookieA = cookieOf(a)
  assert.equal((await call('a.test', 'GET', '/me', null, cookieA)).status, 200)
  assert.equal((await call('b.test', 'GET', '/me', null, cookieA)).status, 401)
  assert.equal((await call('c.test', 'GET', '/me', null, cookieA)).status, 404)
})

test('verification required: unverified login is refused until the emailed link is used', async () => {
  const { call, mail } = await setup()
  const r = await call('a.test', 'POST', '/register', { email: 'v@x.com', password: 'password-1234', displayName: 'V' })
  assert.deepEqual(await r.json(), { verificationRequired: true })
  assert.equal(cookieOf(r), undefined)
  assert.equal((await call('a.test', 'POST', '/login', { email: 'v@x.com', password: 'password-1234' })).status, 403)
  const { token } = mail.find((m) => m.kind === 'verify_email')
  assert.equal((await call('b.test', 'POST', '/verify-email', { token })).status, 400)
  assert.equal((await call('a.test', 'POST', '/verify-email', { token })).status, 200)
  assert.equal((await call('a.test', 'POST', '/verify-email', { token })).status, 400)
  assert.equal((await call('a.test', 'POST', '/login', { email: 'v@x.com', password: 'password-1234' })).status, 200)
  // Registering again answers the same and only tells the inbox owner.
  const again = await call('a.test', 'POST', '/register', { email: 'v@x.com', password: 'password-9999', displayName: 'V' })
  assert.deepEqual(await again.json(), { verificationRequired: true })
  assert.ok(mail.some((m) => m.kind === 'already_registered'))
})

test('lockout after repeated failures, password reset revokes sessions and is single use', async () => {
  const { identity, realmA, mail } = await setup({ requireEmailVerification: false })
  const { session } = await identity.register({ realm: realmA, email: 'l@x.com', password: 'password-1234', displayName: 'L' })
  for (let i = 0; i < 10; i += 1) await assert.rejects(identity.login({ realm: realmA, email: 'l@x.com', password: 'wrong-password' }), { code: 'INVALID_CREDENTIALS' })
  await assert.rejects(identity.login({ realm: realmA, email: 'l@x.com', password: 'password-1234' }), { code: 'LOCKED' })
  await identity.requestPasswordReset({ realm: realmA, email: 'l@x.com' })
  const { token } = mail.find((m) => m.kind === 'reset_password')
  await identity.resetPassword({ realm: realmA, token, password: 'new-password-1' })
  assert.equal(await identity.sessionFromToken({ realm: realmA, token: session.token }), null)
  await assert.rejects(identity.resetPassword({ realm: realmA, token, password: 'another-pass-1' }), { code: 'TOKEN_INVALID' })
  assert.ok((await identity.login({ realm: realmA, email: 'l@x.com', password: 'new-password-1' })).session.token)
})

test('disabled account loses its session; cross-site JSON-less posts are refused', async () => {
  const { identity, realmA, call } = await setup({ requireEmailVerification: false })
  const r = await call('a.test', 'POST', '/register', { email: 'd@x.com', password: 'password-1234', displayName: 'D' })
  const { account } = await r.json()
  await identity.setAccountStatus({ realm: realmA, accountId: account.id, status: 'disabled' })
  assert.equal((await call('a.test', 'GET', '/me', null, cookieOf(r))).status, 401)
  const form = await call('a.test', 'POST', '/login', null)
  assert.equal(form.status, 415)
})

test('uploads are re-encoded, private to their owner and the avatar replaces the previous one', async () => {
  const prisma = fakePrisma(), objects = new Map()
  const storage = { put: async (k, b) => { objects.set(k, b) }, get: async (k) => objects.get(k), remove: async (ks) => ks.forEach((k) => objects.delete(k)) }
  const identity = createExternalIdentity({ prisma })
  const files = createExternalFiles({ prisma, storage })
  const realm = Object.assign(await identity.ensureRealm({ companyId: randomUUID(), moduleKey: 'runly.website', ownerId: randomUUID() }), { enabled: true, requireEmailVerification: false })
  const app = createExternalAuthRouter({ identity, resolveRealm: () => realm, files })
  const reg = async (email) => cookieOf(await app.request('/register', { method: 'POST', headers: { host: 'a.test', 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'password-1234', displayName: 'X' }) }))
  const ana = await reg('ana@x.com'), bob = await reg('bob@x.com')
  const png = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#c33' } }).png().toBuffer()
  const up = (cookie, body, type = 'image/png') => app.request('/files?purpose=avatar', { method: 'POST', headers: { host: 'a.test', 'content-type': type, cookie }, body })
  const first = await (await up(ana, png)).json()
  const meta = await sharp(objects.values().next().value).metadata()
  assert.equal(meta.format, 'webp'); assert.ok(meta.width <= 512)
  assert.equal((await app.request(`/files/${first.data.id}`, { headers: { host: 'a.test', cookie: ana } })).status, 200)
  assert.equal((await app.request(`/files/${first.data.id}`, { headers: { host: 'a.test', cookie: bob } })).status, 404)
  assert.equal((await up(ana, Buffer.from('<svg onload=alert(1)>'), 'image/svg+xml')).status, 415)
  const second = await (await up(ana, png)).json()
  assert.equal(objects.size, 1, 'previous avatar removed')
  const me = await (await app.request('/me', { headers: { host: 'a.test', cookie: ana } })).json()
  assert.equal(me.account.avatarFileId, second.data.id)
})

test('closing an account needs the password and erases its files; purging a realm erases everything under it', async () => {
  const prisma = fakePrisma(), objects = new Map()
  const storage = { put: async (k, b) => { objects.set(k, b) }, get: async (k) => objects.get(k), remove: async (ks) => ks.forEach((k) => objects.delete(k)) }
  const identity = createExternalIdentity({ prisma })
  const files = createExternalFiles({ prisma, storage })
  const ownerId = randomUUID()
  const realm = Object.assign(await identity.ensureRealm({ companyId: randomUUID(), moduleKey: 'runly.website', ownerId }), { enabled: true, requireEmailVerification: false })
  const app = createExternalAuthRouter({ identity, resolveRealm: () => realm, files })
  const json = (path, body, cookie) => app.request(path, { method: 'POST', headers: { host: 'a.test', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) })
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#000' } }).png().toBuffer()
  const signUp = async (email) => {
    const cookie = cookieOf(await json('/register', { email, password: 'password-1234', displayName: 'X' }))
    await app.request('/files?purpose=image', { method: 'POST', headers: { host: 'a.test', 'content-type': 'image/png', cookie }, body: png })
    return cookie
  }
  const ana = await signUp('ana@x.com'); await signUp('bob@x.com')
  assert.equal(objects.size, 2)
  assert.equal((await json('/me/delete', { password: 'wrong-password' }, ana)).status, 422)
  assert.equal((await json('/me/delete', { password: 'password-1234' }, ana)).status, 204)
  assert.equal(objects.size, 1); assert.equal(prisma.tables.account.length, 1)
  assert.equal((await app.request('/me', { headers: { host: 'a.test', cookie: ana } })).status, 401)
  assert.deepEqual(await files.purgeRealm({ moduleKey: 'runly.website', ownerId }), { accounts: 1 })
  assert.equal(objects.size, 0)
  for (const table of ['realm', 'account', 'session', 'token', 'file']) assert.equal(prisma.tables[table].length, 0, table)
  assert.deepEqual(await files.purgeRealm({ moduleKey: 'runly.website', ownerId }), { accounts: 0 }, 'retry is a no-op')
})

test('a storage failure during a purge keeps the rows so it can be retried', async () => {
  const prisma = fakePrisma()
  let failing = true
  const objects = new Map()
  const storage = { put: async (k, b) => { objects.set(k, b) }, get: async () => null, remove: async (ks) => { if (failing) throw new Error('down'); ks.forEach((k) => objects.delete(k)) } }
  const identity = createExternalIdentity({ prisma }), files = createExternalFiles({ prisma, storage })
  const ownerId = randomUUID()
  const realm = Object.assign(await identity.ensureRealm({ companyId: randomUUID(), moduleKey: 'runly.website', ownerId }), { requireEmailVerification: false })
  const { account } = await identity.register({ realm, email: 'f@x.com', password: 'password-1234', displayName: 'F' })
  await files.upload({ realm, account: prisma.tables.account[0], purpose: 'image', bytes: await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer() })
  await assert.rejects(files.purgeRealm({ moduleKey: 'runly.website', ownerId }), { code: 'STORAGE_UNAVAILABLE' })
  assert.equal(prisma.tables.file.length, 1); assert.equal(prisma.tables.realm.length, 1); assert.ok(account.id)
  failing = false
  await files.purgeRealm({ moduleKey: 'runly.website', ownerId })
  assert.equal(objects.size, 0); assert.equal(prisma.tables.realm.length, 0)
})
