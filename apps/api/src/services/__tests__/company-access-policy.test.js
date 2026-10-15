import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { createCompanyAccessPolicy } from '../company-access-policy.js'

function fixture() {
  let memberships = [], enabled = true, deleting = false
  const policy = createCompanyAccessPolicy({ prisma: {
    userProfile: { findUnique: async () => ({ enabled, memberships }) },
    $queryRawUnsafe: async () => [{found:deleting}],
  } })
  const app = new Hono()
  app.use('*', async (c,next) => await policy(c,'identity') ?? next())
  app.all('*', c => c.json({ok:true}))
  return { app, set: values => { memberships=values.memberships ?? memberships; enabled=values.enabled ?? enabled; deleting=values.deleting ?? deleting } }
}

test('removing the last membership denies business routes but preserves bootstrap and recovery', async () => {
  const f=fixture()
  assert.equal((await f.app.request('/runtime/modules')).status,403)
  assert.equal((await f.app.request('/profile/me')).status,403)
  for (const path of ['/user/me','/memberships/me','/companies/deletions','/companies/00000000-0000-4000-8000-000000000001/deletion/cancel']) {
    assert.equal((await f.app.request(path)).status,200,path)
  }
})

test('membership reactivation restores access without replacing the identity', async () => {
  const f=fixture()
  assert.equal((await f.app.request('/business')).status,403)
  f.set({memberships:[{companyId:'b',role:{key:'member',enabled:true,companyId:'b'}}]})
  assert.equal((await f.app.request('/business',{headers:{'X-Runly-Company-Id':'b'}})).status,200)
  assert.equal((await f.app.request('/business',{headers:{'X-Runly-Company-Id':'a'}})).status,403)
  f.set({memberships:[]})
  assert.equal((await f.app.request('/business')).status,403)
})

test('disabled accounts, disabled roles and roles belonging to another company do not authorize access', async () => {
  const f=fixture()
  for (const membership of [{companyId:'a',role:{enabled:false}}, {companyId:'a',role:{enabled:true,companyId:'b'}}]) {
    f.set({memberships:[membership]})
    assert.equal((await f.app.request('/business')).status,403)
  }
  f.set({enabled:false,memberships:[{companyId:'a',role:null}]})
  assert.equal((await f.app.request('/business')).status,403)
})

test('global module mutations are fenced during deletion while other-company business remains accessible', async () => {
  const f=fixture(); f.set({deleting:true,memberships:[{companyId:'b',role:null}]})
  assert.equal((await f.app.request('/modules/sync',{method:'POST'})).status,409)
  assert.equal((await f.app.request('/modules')).status,200)
  assert.equal((await f.app.request('/contacts',{method:'POST'})).status,200)
})
