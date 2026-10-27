import test from 'node:test'
import assert from 'node:assert/strict'
import { createStudioRealtime } from './studio-realtime.js'
import { createEphemeralKey, verifyAttestation } from '../../../../shared/studio/realtime.js'
import { blankDocument } from '../../../../shared/studio/document.js'
import { signHs256Jwt, verifySupabaseJwt } from '../../services/jwt-verification.js'
const secret='isolated-test-signing-secret-0123456789-only',company='00000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-000000000002',design='00000000-0000-4000-8000-000000000003',auth='00000000-0000-4000-8000-000000000004',authSession='00000000-0000-4000-8000-000000000005'
function fixture(overrides={}){
  const queries=[];const prisma={$transaction:fn=>fn({$queryRaw:async strings=>{const sql=strings.join('?');queries.push(sql);return sql.includes('FOR SHARE')?[{revision:'4',socketReady:true}]:[{name:'Verified name'}]}})}
  const service=createStudioRealtime({prisma,access:{get:async()=>({document:blankDocument(320,240),role:'EDITOR',revision:2,canEdit:true}),...overrides.access},env:{SUPABASE_JWT_SECRET:secret},...overrides})
  const token=signHs256Jwt({sub:auth,role:'authenticated',session_id:authSession},secret,3600)
  return {service,token,queries}
}
test('context issues only a scoped socket credential and public signed identity; no presence writes',async()=>{
  const {service,token,queries}=fixture(),key=await createEphemeralKey(),input={version:1,sessionId:'a'.repeat(32),publicKey:key.publicKey}
  const result=await service.context(company,actor,design,input,auth,token),jwt=verifySupabaseJwt(result.socketToken,secret)
  assert.equal(jwt.role,'runly_studio_socket');assert.equal(jwt.sub,undefined);assert.equal(jwt.studio_design_id,design);assert.equal(jwt.exp-jwt.iat,30)
  assert.notEqual(result.certificate.sessionId,input.sessionId);assert.equal(result.certificate.name,'Verified name')
  assert.ok(await verifyAttestation(result.certificate,result.certificateSignature,result.verificationKey))
  assert.equal(queries.length,2);assert.ok(queries.every(q=>!q.includes('studio_presence')&&!/INSERT|UPDATE|DELETE/.test(q)))
})
test('API denial, unknown input and expired Auth never produce a grant',async()=>{
  const key=await createEphemeralKey(),input={version:1,sessionId:'b'.repeat(32),publicKey:key.publicKey}
  const {service,token}=fixture()
  await assert.rejects(service.context(company,actor,design,{...input,userId:actor},auth,token))
  await assert.rejects(service.context(company,actor,design,input,auth,signHs256Jwt({sub:auth,role:'authenticated',session_id:authSession},secret,-20)))
  const denied=fixture({access:{get:async()=>{throw Object.assign(Error('Denied'),{status:403})}}})
  await assert.rejects(denied.service.context(company,actor,design,input,auth,denied.token),/Denied/)
})
