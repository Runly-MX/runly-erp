import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { createRealtimeBroadcaster } from '../../../apps/api/src/services/realtime-broadcaster.js'
const require = createRequire(new URL('../../../apps/api/package.json', import.meta.url))
const { createClient } = require('@supabase/supabase-js')
const { PrismaClient } = require('@prisma/client'), { PrismaPg } = require('@prisma/adapter-pg')
const Y = require('yjs')
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
    return { status: response.status, body: await response.json() }
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
    const layer=(await stack.pool.query("INSERT INTO canvas_layer(page_id,name,position) VALUES($1,'Objects',0) RETURNING id",[page.id])).rows[0]
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
    assert.equal(objects.length,2)
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
    assert.ok((await relay(null,topics[1],'ydoc.update')).status>=400)
    await stack.pool.query('UPDATE notes SET is_public=false WHERE id=$1',[note.id])
    const unpublishedRevision=(await request('/realtime/revision')).body.revision
    assert.notEqual(unpublishedRevision,publishedRevision)
    const unpublished=await join(null,`${topics[1]}@${unpublishedRevision}`)
    assert.notEqual(unpublished.status,'SUBSCRIBED')
    checks.push('Real Realtime RLS denies private anonymous/foreign joins; public read-only joins and unpublication rotates topic')

    // Real concurrent API persistence and reopen. No mocked database or Auth.
    const a=new Y.Doc(),b=new Y.Doc()
    a.getText('benchmark').insert(0,'A'.repeat(128000));b.getText('benchmark').insert(0,'B')
    const save = (actor,doc) => request(`/notes/${note.id}/ydoc`,actor,{state:Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),stateVector:Buffer.from(Y.encodeStateVector(doc)).toString('base64')},'PUT')
    const saves=await Promise.all([save(actors[0],a),save(actors[1],b)])
    for(const saved of saves)assert.equal(saved.status,200)
    const persisted=await request(`/notes/${note.id}/ydoc`,actors[0])
    const reopened=new Y.Doc();Y.applyUpdate(reopened,new Uint8Array(Buffer.from(persisted.body.data.state,'base64')))
    assert.equal(reopened.getText('benchmark').length,128001)
    assert.ok((await save(viewer,b)).status>=400)
    a.destroy();b.destroy();reopened.destroy()
    checks.push('Large Y.Doc concurrent API saves merge without loss, reopen and read-only save denial')

    await stack.pool.query('UPDATE user_profile SET enabled=false WHERE id=$1',[viewer.id])
    assert.ok((await relay(viewer,topics[0],'cursor')).status>=400)
    await stack.pool.query('DELETE FROM canvas_collaborator WHERE board_id=$1 AND user_id=$2',[board.id,actors[1].id])
    assert.ok((await relay(actors[1],topics[0],'cursor')).status>=400)
    checks.push('Disabled profile and revoked Canvas collaborator cannot relay subsequent writes')

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
    return {checks,observations}
  } finally {for(const c of clients){await c.removeAllChannels();c.realtime.disconnect()}}
}
