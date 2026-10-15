import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCompanyDeletionRouter } from '../company-deletion-routes.js'

const companyId='00000000-0000-4000-8000-000000000001'
function fixture() {
  const calls=[]
  let accepted=false
  const app=createCompanyDeletionRouter({
    authMiddleware:async(c,next)=>{c.set('authUserId','actor');await next()},
    service:{
      request:async args=>{calls.push(args);return {companyId}},
      cancel:async args=>{calls.push(args);return {companyId}},
      list:async()=>[],
    },
    supabaseAnon:{auth:{
      getUser:async()=>({data:{user:{id:'actor',email:'actor@example.test'}},error:null}),
      signInWithPassword:async()=>accepted ? {data:{user:{id:'actor'}},error:null} : {data:{user:null},error:new Error('denied')},
    }},
  })
  const post=(path,body)=>app.request(path,{method:'POST',headers:{Authorization:'Bearer test-token','Content-Type':'application/json'},body:JSON.stringify(body)})
  return {app,calls,post,accept:()=>{accepted=true}}
}

test('scheduling requires a verified password and never forwards it to deletion storage',async()=>{
  const f=fixture(), path=`/companies/${companyId}/deletion`
  assert.equal((await f.post(path,{confirmation:'Empresa'})).status,401)
  assert.equal((await f.post(path,{confirmation:'Empresa',password:'fixture-only'})).status,401)
  assert.equal(f.calls.length,0)
  f.accept()
  const response=await f.post(path,{confirmation:'Empresa',password:'fixture-only'})
  assert.equal(response.status,200)
  assert.deepEqual(f.calls,[{companyId,authUserId:'actor',confirmation:'Empresa'}])
  assert.equal((await response.text()).includes('fixture-only'),false)
})

test('recovery remains reachable and invalid deletion requests fail validation',async()=>{
  const f=fixture()
  assert.equal((await f.app.request('/companies/deletions')).status,200)
  assert.equal((await f.post(`/companies/${companyId}/deletion/cancel`,{})).status,200)
  assert.equal((await f.post('/companies/invalid/deletion',{})).status,422)
  assert.equal((await f.post(`/companies/${companyId}/deletion`,null)).status,422)
})
