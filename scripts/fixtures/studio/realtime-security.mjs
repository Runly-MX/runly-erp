import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createEphemeralKey } from '../../../apps/shared/studio/realtime.js'
const {createClient}=createRequire(new URL('../../../apps/api/package.json',import.meta.url))('@supabase/supabase-js')
const wait=ms=>new Promise(r=>setTimeout(r,ms))
export async function verifyStudioRealtimeSecurity(stack,{users,companies},tokens,design) {
  const company=companies[0],clients=[],checks=[]
  const request=async(path,actor=0,body,method=body?'POST':'GET')=>{
    const r=await fetch(stack.urls.api+path,{method,headers:{Authorization:`Bearer ${tokens[actor]}`,'X-Runly-Company-Id':company.id,'X-Runly-Studio-Protocol':'3','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
    return {status:r.status,data:(await r.json()).data}
  }
  const context=async actor=>{const key=await createEphemeralKey();const r=await request(`/studio/designs/${design.id}/collaboration`,actor,{version:1,sessionId:Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),publicKey:key.publicKey});return {...r,key}}
  function client(token){const c=createClient(stack.urls.kong,stack.secret.SUPABASE_ANON_KEY,{accessToken:async()=>token,auth:{persistSession:false,autoRefreshToken:false}});clients.push(c);return c}
  async function join(c,topic,token){await c.realtime.setAuth(token);const channel=c.channel(topic,{config:{private:true,broadcast:{ack:true},presence:{key:'test',enabled:true}}});const status=await new Promise(resolve=>{const timer=setTimeout(()=>resolve('TIMEOUT'),12000);channel.subscribe(s=>{if(s==='SUBSCRIBED'||s==='CHANNEL_ERROR'||s==='TIMED_OUT'){clearTimeout(timer);resolve(s)}})});return {channel,status}}
  try{
    const owner=await context(0);assert.equal(owner.status,200)
    assert.equal((await context(1)).status,403);assert.equal((await context(3)).status,403)
    const ownerSocket=client(owner.data.socketToken),authorized=await join(ownerSocket,owner.data.topic,owner.data.socketToken)
    assert.equal(authorized.status,'SUBSCRIBED')
    for(const [topic,token]of [[owner.data.documentTopic,owner.data.socketToken],[owner.data.topic,tokens[0]],[owner.data.topic,stack.secret.SUPABASE_ANON_KEY],[owner.data.topic.replace(design.id,company.id),owner.data.socketToken]]){
      const c=client(token),r=await join(c,topic,token);assert.notEqual(r.status,'SUBSCRIBED');await c.removeChannel(r.channel)
    }
    for(const path of ['/studio/designs','/auth/me'])assert.ok((await fetch(stack.urls.api+path,{headers:{Authorization:`Bearer ${owner.data.socketToken}`,'X-Runly-Company-Id':company.id}})).status>=400)
    assert.ok((await fetch(stack.urls.kong+'/rest/v1/studio_design?select=id',{headers:{apikey:stack.secret.SUPABASE_ANON_KEY,Authorization:`Bearer ${owner.data.socketToken}`}})).status>=400)
    const policy=(await stack.pool.query("SELECT array_to_json(roles) roles,with_check FROM pg_policies WHERE schemaname='realtime' AND policyname='runly_realtime_server_writes'")).rows[0]
    assert.deepEqual([...policy.roles].sort(),['anon','authenticated']);assert.equal(policy.with_check,'false')
    const privileges=(await stack.pool.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND c.relkind IN ('r','p') AND has_table_privilege('runly_studio_socket',c.oid,'SELECT,INSERT,UPDATE,DELETE')")).rows[0]
    assert.equal(privileges.n,0,'Socket role inherited business table privileges')
    assert.equal((await stack.pool.query("SELECT count(*)::int n FROM pg_auth_members WHERE roleid='runly_studio_socket'::regrole OR member='runly_studio_socket'::regrole")).rows[0].n,0)
    checks.push('Real socket role joins only its exact private ephemeral scope; Auth/anon/cross-design and API/Data API token reuse denied; global restrictive policy unchanged')
    const legacy=await request(`/studio/designs/${design.id}/live`,0,{sessionId:'legacy-compatible-session',peek:true});assert.equal(legacy.status,200);assert.ok(legacy.data.topic.startsWith('studio:design:'))
    await stack.pool.query('UPDATE membership SET role_id=$1 WHERE company_id=$2 AND user_id=$3',[company.roleId,company.id,users[1].id])
    assert.equal((await request(`/studio/designs/${design.id}/collaborators`,0,{userId:users[1].id,role:'VIEWER'},'PUT')).status,200)
    const viewer=await context(1);assert.equal(viewer.status,200);assert.equal(viewer.data.canEdit,false)
    assert.equal((await request(`/studio/designs/${design.id}/changes`,1,{clientId:'viewer-attempt',batchId:1,ops:[]})).status,404)
    checks.push('Legacy live remains authorized and usable; VIEWER obtains ephemeral capability but cannot persist edits')
    // Fresh epoch after viewer grant. Test cached socket authorization explicitly.
    const peer=await context(2),observer=client(peer.data.socketToken),peerChannel=await join(observer,peer.data.topic,peer.data.socketToken)
    assert.equal(peerChannel.status,'SUBSCRIBED')
    const freshOwner=await context(0),ownerPeer=client(freshOwner.data.socketToken),ownerChannel=await join(ownerPeer,freshOwner.data.topic,freshOwner.data.socketToken)
    assert.equal(ownerChannel.status,'SUBSCRIBED')
    let received=0;ownerChannel.channel.on('broadcast',{event:'probe'},()=>received++)
    let publicReceived=0
    const publicClient=client(stack.secret.SUPABASE_ANON_KEY),publicChannel=publicClient.channel(peer.data.topic,{config:{private:false}}).on('broadcast',{event:'probe'},()=>publicReceived++)
    await new Promise((resolve,reject)=>publicChannel.subscribe(s=>{if(s==='SUBSCRIBED')resolve();else if(['CHANNEL_ERROR','TIMED_OUT'].includes(s))reject(Error('PUBLIC_PROBE_NOT_READY'))}))
    await peerChannel.channel.send({type:'broadcast',event:'probe',payload:{v:1}});await wait(200);assert.equal(received,1);assert.equal(publicReceived,0,'Public topic received a private broadcast')
    await publicClient.removeAllChannels();publicClient.realtime.disconnect()
    const revokedAt=Date.now()
    assert.equal((await request(`/studio/designs/${design.id}/collaborators`,0,{userId:users[2].id,role:null},'PUT')).status,200)
    assert.equal((await context(2)).status,404)
    assert.equal((await request(`/studio/designs/${design.id}/changes`,2,{clientId:'revoked-attempt',batchId:1,ops:[]})).status,404)
    const retry=client(peer.data.socketToken),newJoin=await join(retry,peer.data.topic,peer.data.socketToken);assert.notEqual(newJoin.status,'SUBSCRIBED');await retry.removeChannel(newJoin.channel)
    await peerChannel.channel.send({type:'broadcast',event:'probe',payload:{v:1}});await wait(200)
    const cachedDelivery=received>1
    while(Date.now()<peer.data.expiresAt+1500)await wait(250)
    const joinedAfterExpiry=peerChannel.channel.state==='joined'
    assert.equal(joinedAfterExpiry,false,'An expired socket capability remained joined')
    checks.push('Revocation denies new grants/subscriptions and all subsequent changes; cached channel behavior measured through real JWT expiry')
    await request(`/studio/designs/${design.id}/collaborators`,0,{userId:users[2].id,role:'EDITOR'},'PUT')
    return {checks,cachedDeliveryAfterRevocation:cachedDelivery,rawSocketJoinedAfterExpiry:joinedAfterExpiry,observedMs:Date.now()-revokedAt,leaseMs:peer.data.expiresAt-peer.data.certificate.issuedAt}
  }finally{for(const c of clients){await c.removeAllChannels();c.realtime.disconnect()}}
}
