import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { createRealtimeBroadcaster } from '../../../apps/api/src/services/realtime-broadcaster.js'
import { signHs256Jwt } from '../../../apps/api/src/services/jwt-verification.js'
const require = createRequire(new URL('../../../apps/api/package.json', import.meta.url))
const { createClient } = require('@supabase/supabase-js')
const { PrismaClient } = require('@prisma/client'), { PrismaPg } = require('@prisma/adapter-pg')
const Y = require('yjs')
const awarenessProtocol = require('y-protocols/awareness')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

// Must only be called with the verified, newly-created fixture. No environment URLs.
export async function verifyRealtimeSecurity(stack, { actors, data, board, note, conversation, phase }) {
  assert.equal((await stack.pool.query('SELECT id FROM runly_studio_test.environment')).rows[0]?.id, stack.name)
  const checks = [], observations = {}, clients = []
  const request = async (path, actor, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(stack.urls.api + path, { method, headers: {
      ...(actor?.session ? { Authorization: `Bearer ${actor.session.access_token}` } : {}),
      'X-Runly-Company-Id': data.companies[0].id, 'Content-Type': 'application/json',
    }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const text=await response.text()
    let result=null
    if(text)try{result=JSON.parse(text)}catch{result={error:'Non-JSON response'}}
    return { status: response.status, body: result }
  }
  const login = async person => {
    const c = createClient(stack.urls.kong, stack.secret.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: signed, error } = await c.auth.signInWithPassword(person)
    if(error) throw error
    return { ...person, session: signed.session }
  }
  const join = async (actor, topic) => {
    const token = actor?.session.access_token ?? stack.secret.SUPABASE_ANON_KEY
    const c = createClient(stack.urls.kong, stack.secret.SUPABASE_ANON_KEY, { accessToken: async () => token, auth: { persistSession: false, autoRefreshToken: false } })
    clients.push(c); await c.realtime.setAuth(token)
    let channel
    const status = await new Promise(resolve => {
      const timer = setTimeout(() => resolve('TIMEOUT'), 12000)
      channel = c.channel(topic, { config: { private: true, broadcast: { ack: true } } })
      channel.subscribe(value => { if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT'].includes(value)){clearTimeout(timer);resolve(value)} })
    })
    return { c, channel, status }
  }
  const relay = (actor, topic, event, payload={}) => request('/realtime/broadcast',actor,{topic,event,payload})
  try {
    const foreign = await login(data.users[3]), viewer = await login(data.users[1])
    await stack.pool.query('UPDATE membership SET role_id=$1 WHERE user_id=$2 AND company_id=$3',[data.companies[0].roleId,viewer.id,data.companies[0].id])
    await stack.pool.query("INSERT INTO canvas_collaborator(board_id,user_id,role,created_by) VALUES($1,$2,'VIEWER',$3)",[board.id,viewer.id,actors[0].id])
    await stack.pool.query("INSERT INTO note_shares(note_id,shared_with_user_id,shared_by_user_id,permission) VALUES($1,$2,$3,'read')",[note.id,viewer.id,actors[0].id])
    const topics = [`canvas:board:${board.id}`, `note:ydoc:${note.id}`, `chat:presence:${conversation.id}`]
    for (const topic of topics) {
      const event = topic.startsWith('canvas') ? 'cursor' : topic.startsWith('note') ? 'ydoc.update' : 'typing'
      assert.ok((await relay(foreign,topic,event)).status>=400)
      assert.ok((await relay(null,topic,event)).status>=400)
    }
    assert.ok((await relay(viewer,topics[0],'cursor')).status>=400)
    assert.ok((await relay(viewer,topics[1],'ydoc.update')).status>=400)
    checks.push('Foreign company, anonymous and read-only writes denied by real API/Auth')

    const revision = (await request('/realtime/revision')).body.revision
    const canvas = await join(actors[0],`${topics[0]}@${revision}`)
    assert.equal(canvas.status,'SUBSCRIBED')
    let cursor
    canvas.channel.on('broadcast',{event:'cursor'},message=>{cursor=message.payload})
    assert.equal((await relay(actors[0],topics[0],'cursor',{actorId:foreign.id,x:1,y:2})).status,200)
    for(let i=0;i<40&&!cursor;i++)await wait(50)
    assert.equal(cursor?.actorId,actors[0].id)
    const forgery = await relay(actors[0],topics[0],'canvas.changed',{action:'board.deleted'})
    observations.clientCanForgeCanvasChanged = forgery.status===200
    if(phase==='after')assert.equal(observations.clientCanForgeCanvasChanged,false)
    checks.push('Canvas cursor attribution is authenticated; authoritative-event forgery measured')

    const page=(await stack.pool.query('SELECT id FROM canvas_page WHERE board_id=$1 ORDER BY position LIMIT 1',[board.id])).rows[0]
    const layer=(await stack.pool.query("INSERT INTO canvas_layer(page_id,name,position) SELECT $1,'Objects',COALESCE(max(position),-1)+1 FROM canvas_layer WHERE page_id=$1 RETURNING id",[page.id])).rows[0]
    const previousObjects=Number((await stack.pool.query('SELECT count(*) AS count FROM canvas_object WHERE board_id=$1 AND deleted_at IS NULL',[board.id])).rows[0].count)
    const batch=async(actor,operations)=>{
      const result=await request(`/canvas/boards/${board.id}/objects/batch`,actor,{operations})
      assert.equal(result.status,200,JSON.stringify(result.body))
      return result.body.data
    }
    const created=await batch(actors[0],[0,1].map(index=>({op:'create',clientId:`shape-${index}`,data:{type:'rectangle',pageId:page.id,layerId:layer.id,geometry:{width:20,height:20},transform:{x:index*30,y:0}}})))
    const moved=await Promise.all(created.map((row,index)=>batch(actors[index],[{op:'update',id:row.object.id,expectedRevision:1,data:{transform:{x:100+index,y:10}}}])))
    assert.ok(moved.every(rows=>rows[0].op==='update'))
    const same=await Promise.all(actors.slice(0,2).map((actor,index)=>batch(actor,[{op:'update',id:created[0].object.id,expectedRevision:2,data:{transform:{x:200+index,y:20}}}])))
    assert.deepEqual(same.map(rows=>rows[0].op).sort(),['conflict','update'])
    await batch(actors[0],[{op:'delete',id:created[1].object.id,expectedRevision:2}])
    const restored=await batch(actors[1],[{op:'restore',id:created[1].object.id}])
    assert.equal(restored[0].object.id,created[1].object.id)
    const persistedObjects=await request(`/canvas/boards/${board.id}/objects`,actors[0])
    const objects=persistedObjects.body.data??persistedObjects.body
    assert.equal(objects.length,previousObjects+2)
    assert.equal(objects.find(row=>row.id===created[0].object.id).revision,3)
    assert.ok((await request(`/canvas/boards/${board.id}/objects/batch`,viewer,{operations:[{op:'delete',id:created[0].object.id}]})).status>=400)
    checks.push('Canvas real API: independent concurrent object edits, same-object revision conflict, deletion/restore identity and reader denial')

    for(const topic of topics.slice(0,2)) {
      const denied=await join(foreign,`${topic}@${revision}`)
      assert.notEqual(denied.status,'SUBSCRIBED')
    }
    const privateAnonymous=await join(null,`${topics[1]}@${revision}`)
    assert.notEqual(privateAnonymous.status,'SUBSCRIBED')
    await stack.pool.query("UPDATE notes SET is_public=true,public_slug='realtime-benchmark-public' WHERE id=$1",[note.id])
    const publishedRevision=(await request('/realtime/revision')).body.revision
    const publicReader=await join(null,`${topics[1]}@${publishedRevision}`)
    assert.equal(publicReader.status,'SUBSCRIBED')
    let latePublicUpdates=0
    publicReader.channel.on('broadcast',{event:'ydoc.update'},()=>{latePublicUpdates++})
    assert.ok((await relay(null,topics[1],'ydoc.update')).status>=400)
    await stack.pool.query('UPDATE notes SET is_public=false WHERE id=$1',[note.id])
    const unpublishedRevision=(await request('/realtime/revision')).body.revision
    assert.notEqual(unpublishedRevision,publishedRevision)
    const unpublished=await join(null,`${topics[1]}@${unpublishedRevision}`)
    assert.notEqual(unpublished.status,'SUBSCRIBED')
    const emptyDoc=new Y.Doc()
    try {
      assert.equal((await relay(actors[0],topics[1],'ydoc.update',{update:Buffer.from(Y.encodeStateAsUpdate(emptyDoc)).toString('base64')})).status,200)
      await wait(1000)
      observations.revokedPublicSocket={stillJoined:publicReader.channel.state==='joined',observationMs:1000,postRevocationUpdates:latePublicUpdates}
      assert.equal(latePublicUpdates,0,'Unpublished note delivered a new update to its old public topic')
    } finally {emptyDoc.destroy()}
    checks.push('Real Realtime RLS denies private anonymous/foreign joins; public read-only joins and unpublication rotates topic')

    const noteChannel=await join(actors[0],`${topics[1]}@${unpublishedRevision}`)
    assert.equal(noteChannel.status,'SUBSCRIBED')
    const identityDoc=new Y.Doc(),observedDoc=new Y.Doc(),identityAwareness=new awarenessProtocol.Awareness(identityDoc),observedAwareness=new awarenessProtocol.Awareness(observedDoc)
    let identityReceived=false
    noteChannel.channel.on('broadcast',{event:'awareness.update'},({payload})=>{
      awarenessProtocol.applyAwarenessUpdate(observedAwareness,new Uint8Array(Buffer.from(payload.update,'base64')),'server')
      identityReceived=true
    })
    try {
      identityAwareness.setLocalState({user:{id:actors[0].session.user.id,name:'Forged name',avatarUrl:'https://avatar.example.test/fake'},cursor:{anchor:1,head:2}})
      const sendIdentity=()=>relay(actors[0],topics[1],'awareness.update',{update:Buffer.from(awarenessProtocol.encodeAwarenessUpdate(identityAwareness,[identityDoc.clientID])).toString('base64')})
      assert.equal((await sendIdentity()).status,200)
      for(let i=0;i<50&&!identityReceived;i++)await wait(50)
      assert.equal(identityReceived,true)
      const state=observedAwareness.getStates().get(identityDoc.clientID)
      observations.awarenessNameVerified=state?.user?.name!=='Forged name'
      if(phase==='after'){assert.equal(observations.awarenessNameVerified,true);assert.equal(state.user.id,actors[0].session.user.id);assert.equal(state.user.avatarUrl,null);assert.deepEqual(state.cursor,{anchor:1,head:2})}
      identityAwareness.setLocalStateField('user',{id:foreign.session.user.id,name:'Foreign'})
      observations.awarenessIdentitySpoofRejected=(await sendIdentity()).status>=400
      if(phase==='after')assert.equal(observations.awarenessIdentitySpoofRejected,true)
    } finally {identityAwareness.destroy();observedAwareness.destroy();identityDoc.destroy();observedDoc.destroy()}
    checks.push('Y.js awareness attribution tested through real HTTP relay and private Realtime delivery')

    // Real concurrent API persistence and reopen. No mocked database or Auth.
    const beforeSave=await request(`/notes/${note.id}/ydoc`,actors[0])
    const previousDoc=new Y.Doc()
    if(beforeSave.body.data?.state)Y.applyUpdate(previousDoc,new Uint8Array(Buffer.from(beforeSave.body.data.state,'base64')))
    const previousCharacters=previousDoc.getText('benchmark').length
    previousDoc.destroy()
    const a=new Y.Doc(),b=new Y.Doc()
    a.getText('benchmark').insert(0,'A'.repeat(128000));b.getText('benchmark').insert(0,'B')
    const save = (actor,doc) => request(`/notes/${note.id}/ydoc`,actor,{state:Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),stateVector:Buffer.from(Y.encodeStateVector(doc)).toString('base64')},'PUT')
    const saves=await Promise.all([save(actors[0],a),save(actors[1],b)])
    for(const saved of saves)assert.equal(saved.status,200)
    const persisted=await request(`/notes/${note.id}/ydoc`,actors[0])
    const reopened=new Y.Doc();Y.applyUpdate(reopened,new Uint8Array(Buffer.from(persisted.body.data.state,'base64')))
    assert.equal(reopened.getText('benchmark').length,previousCharacters+128001)
    assert.ok((await save(viewer,b)).status>=400)
    a.destroy();b.destroy();reopened.destroy()
    checks.push('Large Y.Doc concurrent API saves merge without loss, reopen and read-only save denial')

    await stack.pool.query('UPDATE user_profile SET enabled=false WHERE id=$1',[viewer.id])
    assert.ok((await relay(viewer,topics[0],'cursor')).status>=400)
    await stack.pool.query('DELETE FROM canvas_collaborator WHERE board_id=$1 AND user_id=$2',[board.id,actors[1].id])
    assert.ok((await relay(actors[1],topics[0],'cursor')).status>=400)
    checks.push('Disabled profile and revoked Canvas collaborator cannot relay subsequent writes')

    const claims=JSON.parse(Buffer.from(actors[0].session.access_token.split('.')[1],'base64url'))
    const expired=signHs256Jwt({...claims,exp:Math.floor(Date.now()/1000)-60},stack.secret.SUPABASE_JWT_SECRET,-60)
    assert.ok((await relay({...actors[0],session:{access_token:expired}},topics[0],'cursor')).status>=400)
    const refreshing=createClient(stack.urls.kong,stack.secret.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
    const refreshed=await refreshing.auth.refreshSession({refresh_token:actors[0].session.refresh_token})
    assert.equal(refreshed.error,null)
    assert.equal(refreshed.data.user.id,actors[0].session.user.id)
    assert.equal((await relay({...actors[0],session:refreshed.data.session},topics[0],'cursor')).status,200)
    checks.push('Expired token for a real Auth identity denied; real Auth refresh preserves authorized relay access')

    const messagePath=`/chat/conversations/${conversation.id}/messages`
    const original=await request(messagePath,actors[0],{body:'Original'})
    assert.equal(original.status,201)
    const messageId=original.body.data.id
    const reply=await request(messagePath,actors[1],{body:'Respuesta',replyToMessageId:messageId})
    assert.equal(reply.status,201)
    assert.equal((await request(`/chat/messages/${messageId}`,actors[0],{body:'Editado'},'PATCH')).status,200)
    assert.equal((await request(`/chat/messages/${messageId}/reactions`,actors[1],{emoji:'👍',attachmentId:null})).status,200)
    const listed=await request(messagePath,actors[0])
    const messages=listed.body.data
    assert.equal(messages.find(message=>message.id===messageId).body,'Editado')
    assert.equal(messages.find(message=>message.id===reply.body.data.id).reply_to.id,messageId)
    assert.ok(JSON.stringify(messages.find(message=>message.id===messageId).reactions).includes('👍'))
    assert.ok((await request(messagePath,foreign)).status>=400)
    assert.ok((await request(`/chat/conversations/${conversation.id}/read`,actors[1],{})).status<300)
    assert.ok((await stack.pool.query('SELECT last_read_at FROM chat_conversation_members WHERE conversation_id=$1 AND user_id=$2',[conversation.id,actors[1].id])).rows[0].last_read_at)
    assert.ok((await request(`/chat/messages/${messageId}`,actors[0],undefined,'DELETE')).status<300)
    const deleted=await request(messagePath,actors[0])
    assert.ok(deleted.body.data.find(message=>message.id===messageId)?.deleted_at)
    checks.push('Real Chat API: send, quoted reply, edit, reaction, read receipt, soft deletion and foreign-company denial')

    const slug=(await stack.pool.query('SELECT slug FROM company WHERE id=$1',[data.companies[0].id])).rows[0].slug
    const guestRequest=async(path,body)=>{
      const response=await fetch(stack.urls.api+'/public/chat'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Runly-Company':slug},...(body?{body:JSON.stringify(body)}:{})})
      const text=await response.text()
      return {status:response.status,body:text?JSON.parse(text):null}
    }
    const guestA=await guestRequest('/session',{email:'guest-a@realtime.example.test',name:'Guest A'})
    const guestB=await guestRequest('/session',{email:'guest-b@realtime.example.test',name:'Guest B'})
    assert.equal(guestA.status,201);assert.equal(guestB.status,201)
    const guestDataA=guestA.body.data,guestDataB=guestB.body.data
    const guestActor={session:{access_token:guestDataA.realtimeToken}}
    const guestRevision=(await request('/realtime/revision')).body.revision
    const ownGuest=await join(guestActor,`chat:conv:${guestDataA.conversationId}@${guestRevision}`)
    assert.equal(ownGuest.status,'SUBSCRIBED')
    for(const topic of [`chat:conv:${guestDataB.conversationId}`,topics[0],`user:${actors[0].id}:events`])assert.notEqual((await join(guestActor,`${topic}@${guestRevision}`)).status,'SUBSCRIBED')
    assert.ok((await request('/chat/conversations',guestActor)).status>=400)
    assert.equal((await guestRequest(`/session/${guestDataA.token}/messages`,{body:'Guest message'})).status,201)
    const guestMessages=await guestRequest(`/session/${guestDataA.token}/messages`)
    const otherMessages=await guestRequest(`/session/${guestDataB.token}/messages`)
    assert.equal(guestMessages.status,200);assert.equal(otherMessages.status,200)
    assert.ok(guestMessages.body.data.some(message=>message.body==='Guest message'))
    assert.ok(!otherMessages.body.data.some(message=>message.body==='Guest message'))
    assert.ok((await guestRequest(`/session/${guestDataA.token}/close`,{})).status<300)
    assert.ok((await guestRequest(`/session/${guestDataA.token}/messages`,{body:'After close'})).status>=400)
    const closedRevision=(await request('/realtime/revision')).body.revision
    assert.notEqual(closedRevision,guestRevision)
    assert.notEqual((await join(guestActor,`chat:conv:${guestDataA.conversationId}@${closedRevision}`)).status,'SUBSCRIBED')
    observations.closedGuestSocketStillJoined=ownGuest.channel.state==='joined'
    await stack.pool.query("UPDATE chat_guest_sessions SET idle_expires_at=now()-interval '1 second',absolute_expires_at=now()-interval '1 second' WHERE id=$1",[guestDataB.sessionId])
    assert.ok((await guestRequest(`/session/${guestDataB.token}/messages`)).status>=400)
    checks.push('Real guest API/token: own private conversation only, internal API denied, message isolation, close/revocation and expiry denial; cached socket state recorded')

    const privateNote=(await stack.pool.query('SELECT is_public FROM notes WHERE id=$1',[note.id])).rows[0]
    assert.equal(privateNote.is_public,false)
    const presign=await request('/notes/presign-image',actors[0],{noteId:note.id,fileName:'private-fixture.png',mimeType:'image/png'})
    assert.equal(presign.status,201)
    const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS3sAAAAASUVORK5CYII=','base64')
    const uploadClient=createClient(stack.urls.kong,stack.secret.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
    const uploaded=await uploadClient.storage.from('runly-notes').uploadToSignedUrl(presign.body.objectKey,presign.body.uploadToken,image,{contentType:'image/png'})
    assert.equal(uploaded.error,null)
    // Resolve only this disposable gateway, even if an older API returns its
    // container-internal origin. Never contact infrastructure from .env.
    const publicObjectPath=new URL(presign.body.publicUrl).pathname
    const anonymousImage=await fetch(stack.urls.kong+publicObjectPath)
    observations.privateNoteImagePubliclyReadable=anonymousImage.status===200
    if(anonymousImage.ok)assert.equal((await anonymousImage.arrayBuffer()).byteLength,image.length)
    checks.push('Private-note image uploaded to real disposable Storage; anonymous object read probed separately from Realtime RLS')

    // Measure transaction lock time against a real local HTTP server and PG.
    const prisma = new PrismaClient({adapter:new PrismaPg({connectionString:stack.pool.options.connectionString})})
    let reached
    const arrived=new Promise(resolve=>{reached=resolve})
    const proxy=createServer(async(req,res)=>{
      const chunks=[];for await(const chunk of req)chunks.push(chunk)
      reached();await wait(750)
      const response=await fetch(stack.urls.kong+req.url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${stack.secret.SUPABASE_SERVICE_ROLE_KEY}`,apikey:stack.secret.SUPABASE_SERVICE_ROLE_KEY},body:Buffer.concat(chunks)})
      res.writeHead(response.status);res.end(await response.text())
    })
    await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve))
    try {
      const broadcaster=createRealtimeBroadcaster({prisma,supabaseUrl:`http://127.0.0.1:${proxy.address().port}`,serviceRoleKey:stack.secret.SUPABASE_SERVICE_ROLE_KEY})
      const send=broadcaster.broadcastToChannel(topics[0],'cursor',{actorId:actors[0].id,x:2,y:2})
      await Promise.race([arrived,wait(10000).then(()=>{throw Error('BROADCAST_PROXY_NOT_REACHED')})])
      const start=performance.now()
      await stack.pool.query('UPDATE realtime_authorization_revision SET revision=revision+1 WHERE id')
      observations.authorizationRotationBlockedMs=performance.now()-start
      await send
      assert.ok(observations.authorizationRotationBlockedMs>=600)
      checks.push('Real PG revocation lock held through injected 750 ms Broadcast network latency')
    } finally {await prisma.$disconnect();await new Promise(resolve=>proxy.close(resolve))}
    const releaseBlockers=observations.privateNoteImagePubliclyReadable?['PRIVATE_NOTE_IMAGES_PUBLIC']:[]
    return {checks,observations,releaseBlockers,passed:releaseBlockers.length===0}
  } finally {for(const c of clients){await c.removeAllChannels();c.realtime.disconnect()}}
}
