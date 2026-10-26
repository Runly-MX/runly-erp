import {openPanel,layer,selectLayer,insertText,insertShape,showFiles,createBlank,exportImage,shareDialog,properties,presenceNames} from './editor-controls.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { blankDocument, appendObject } from '../../../apps/shared/studio/document.js'
const require = createRequire(new URL('../../../apps/api/package.json', import.meta.url))
const { createClient } = require('@supabase/supabase-js'), sharp = require('sharp')

export async function verifyStudioCollaboration(stack, { users, companies }) {
  const [owner, , peer, foreign] = users, [a, b] = companies
  const browser = await chromium.launch({ channel: 'chrome', headless: true }), clients = [], checks = []
  const reportCheck=message=>{checks.push(message);console.log(`Studio regression: ${message}`)}
  async function api(path, token, body, company = a.id, method = body ? 'POST' : 'GET') {
    return fetch(`${stack.urls.api}${path}`, { method, signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, 'X-Runly-Company-Id': company, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) })
  }
  async function login(user) {
    const response = await fetch(`${stack.urls.api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: user.email, password: user.password }) })
    assert.equal(response.status, 200)
    return (await response.json()).data.access_token
  }
  async function open(user, id) {
    const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } }), page = await context.newPage(), frames = []
    page.on('websocket', socket => socket.on('framereceived', event => {
      try { const value = JSON.parse(String(event.payload)); if (JSON.stringify(value).includes('"changed"')) frames.push(value) } catch { /* ping */ }
    }))
    await page.goto(`${stack.urls.web}/app/login`)
    await page.locator('#identifier').fill(user.email); await page.locator('#password').fill(user.password)
    await page.getByRole('button', { name: 'Acceder al sistema', exact: true }).click()
    await page.waitForURL(url => !url.pathname.includes('/login'))
    await page.goto(`${stack.urls.web}/app/m/runly.studio/?design=${id}`)
    return { page, context, frames }
  }
  async function until(callback, message) {
    for (let n = 0; n < 80; n++) { if (await callback()) return; await new Promise(resolve => setTimeout(resolve, 250)) }
    assert.fail(message)
  }
  async function subscribe(token, topic, expectAllowed = true) {
    const client = createClient(stack.urls.kong, stack.secret.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    clients.push(client); await client.realtime.setAuth(token)
    const events = [], channel = client.channel(topic, { config: { private: true } }).on('broadcast', { event: 'changed' }, message => events.push(message.payload))
    const state = await new Promise(resolve => {
      const timeout = setTimeout(() => resolve('TIMED_OUT'), 12000)
      channel.subscribe(status => { if (['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) { clearTimeout(timeout); resolve(status) } })
    })
    assert.equal(state === 'SUBSCRIBED', expectAllowed, `Private channel admission: ${state}`)
    return { channel, events }
  }
  try {
    const ownerToken = await login(owner), peerToken = await login(peer), foreignToken = await login(foreign)
    const bytes=await sharp({create:{width:80,height:50,channels:4,background:'#f59e0b'}}).png().toBuffer()
    const form=new FormData();form.append('file',new Blob([bytes],{type:'image/png'}),'collaboration-original.png');form.append('moduleKey','runly.files');form.append('entityType','AtlasFile')
    const upload=await fetch(`${stack.urls.api}/files/upload`,{method:'POST',headers:{Authorization:`Bearer ${ownerToken}`,'X-Runly-Company-Id':a.id},body:form})
    assert.equal(upload.status,201)
    const asset=(await upload.json()).data
    const document = appendObject(appendObject(blankDocument(), 'text', { text: 'Colaboración segura' }), 'image', { fileAssetId: asset.id,x:500,y:300,width:160,height:100 })
    const created = await api('/studio/designs', ownerToken, { name: 'Diseño compartido sintético', document })
    assert.equal(created.status, 201, await created.clone().text())
    const record = (await created.json()).data, id = record.id, root = `/studio/designs/${id}`
    assert.equal((await api(root, peerToken)).status, 404)
    const A = await open(owner, id)
    await shareDialog(A.page)
    await A.page.getByLabel('Buscar colaborador').fill('peer')
    await A.page.getByRole('button', { name: 'Compartir con Studio peer', exact: true }).click()
    await until(async () => (await api(root,peerToken)).ok, 'Viewer grant did not take effect')
    await A.page.keyboard.press('Escape')
    const B = await open(peer, id)
    await selectLayer(B.page,1)
    assert.equal(await B.page.getByRole('button', { name: 'Guardar', exact: true }).count(), 0)
    assert.equal(await B.page.getByLabel('Texto del elemento', { exact: true }).isDisabled(), true)
    assert.equal((await api(root,peerToken,{ name: 'Denied',document,revision:1 },a.id,'PUT')).status,404)
    assert.equal((await api(`${root}/collaborators`,peerToken,{ userId:foreign.id,role:'EDITOR' },a.id,'PUT')).status,404)
    assert.equal((await api(`${root}/collaborators`,ownerToken,{ userId:foreign.id,role:'EDITOR' },a.id,'PUT')).status,403)
    assert.equal((await api(`/files/${asset.id}/signed-url`,peerToken)).status,404)
    const sharedUrl = await api(`${root}/assets/${asset.id}/signed-url`,peerToken)
    assert.equal(sharedUrl.status,200)
    const capability = (await sharedUrl.json()).data
    assert.equal(capability.expiresIn,60); assert.ok((await fetch(capability.signedUrl)).ok)
    const claims=JSON.parse(Buffer.from(new URL(capability.signedUrl).searchParams.get('token').split('.')[1],'base64url'))
    assert.equal(claims.exp-claims.iat,60)
    reportCheck('real UI sharing; same-company VIEWER, no privilege escalation or generic private Files access; document-scoped original TTL60')
    await until(async () => (await presenceNames(A.page)).includes('Studio peer'), 'A did not see B')
    await until(async () => (await presenceNames(B.page)).includes('Studio owner'), 'B did not see A')
    await B.page.getByRole('button', { name: 'Acercar (Ctrl+rueda)', exact: true }).click()
    const canvas = await A.page.locator('canvas.upper-canvas').boundingBox()
    await A.page.mouse.move(canvas.x+100,canvas.y+120)
    const cursor = B.page.getByLabel('Cursor de Studio owner', { exact: true })
    await cursor.waitFor()
    assert.ok(Math.abs(Number(await cursor.getAttribute('data-document-x'))-100*1080/canvas.width)<5)
    assert.ok(Math.abs(Number(await cursor.getAttribute('data-document-y'))-120*1080/canvas.width)<5)
    await selectLayer(B.page,2)
    await A.page.getByLabel('Selección de Studio peer', { exact: true }).waitFor()
    reportCheck('two actual Auth identities: authorized roster, document-space cursors at different zoom levels, remote selection')
    const forged = await api(`${root}/live`,peerToken,{sessionId:'identity-proof-session',userId:owner.id,name:'Impostor',cursor:{x:5,y:9}})
    assert.equal(forged.status,200)
    assert.ok((await forged.json()).data.participants.some(user=>user.sessionId==='identity-proof-session' && user.userId===peer.id && user.name==='Studio peer'))
    await api(`${root}/live`,peerToken,{sessionId:'identity-proof-session',leave:true})
    assert.equal((await api(`${root}/live`,peerToken,{sessionId:'valid-session-bounds',cursor:{x:-1,y:9}})).status,400)
    assert.equal((await api(`${root}/live`,foreignToken,{sessionId:'foreign-session-bounds'},b.id)).status,404)
    const peek = { sessionId:'node-owner-session-1234',peek:true }
    let live = (await (await api(`${root}/live`,ownerToken,peek)).json()).data
    await subscribe(foreignToken, live.topic, false)
    const viewerSocket = await subscribe(peerToken,live.topic)
    const frameCount = A.frames.length
    await viewerSocket.channel.send({ type:'broadcast',event:'changed',payload:{revision:999999} })
    await new Promise(resolve=>setTimeout(resolve,700))
    assert.equal(A.frames.slice(frameCount).some(frame=>JSON.stringify(frame).includes('999999')),false,'An untrusted client broadcast reached another subscriber')
    assert.equal((await(await api(root,ownerToken)).json()).data.revision,1)
    assert.equal((await api('/realtime/broadcast',peerToken,{topic:`studio:design:${id}`,event:'changed',payload:{revision:999999}})).status,404)
    reportCheck('actual Realtime RLS rejects other-company admission and client-forged edit broadcasts')
    await shareDialog(A.page)
    await A.page.getByRole('button', { name: 'Permiso de Studio peer', exact: true }).click()
    await A.page.getByRole('menuitemradio',{name:'Puede editar',exact:true}).click()
    await A.page.getByRole('dialog').getByRole('button',{name:'Cerrar',exact:true}).click()
    await B.page.getByRole('button', { name:'Texto',exact:true }).click({trial:true})
    await selectLayer(B.page,1)
    await B.page.getByLabel('Texto del elemento',{exact:true}).fill('Borrador privado de B')
    const before = (await (await api(root,ownerToken)).json()).data
    await selectLayer(A.page,1)
    await A.page.getByLabel('Texto del elemento',{exact:true}).fill('Revisión confirmada de A')
    await A.page.getByRole('button', { name:'Guardar',exact:true }).click()
    await A.page.getByRole('status').filter({hasText:/^Guardado/}).waitFor()
    await B.page.getByText('Conflicto de versiones',{exact:true}).waitFor()
    assert.equal(await B.page.getByLabel('Texto del elemento',{exact:true}).inputValue(),'Borrador privado de B')
    assert.equal((await api(root,peerToken,{name:before.name,document:before.document,revision:before.revision},a.id,'PUT')).status,409)
    await until(() => B.frames.length>0,'No changed event arrived via actual WebSocket')
    await B.page.getByRole('button', {name:'Guardar como copia',exact:true}).click()
    await B.page.waitForURL(url=>url.searchParams.get('design')!==id)
    const copyId = new URL(B.page.url()).searchParams.get('design')
    assert.ok(copyId)
    assert.equal((await api(`/studio/designs/${copyId}`,peerToken)).status,200)
    reportCheck('confirmed revision delivered via WebSocket; stale save 409; draft retained and copied without laundering private asset access')
    await B.page.goto(`${stack.urls.web}/app/m/runly.studio/?design=${id}`)
    await selectLayer(B.page,1)
    await B.context.setOffline(true)
    const latest = (await (await api(root,ownerToken)).json()).data
    latest.document.objects[0].text='Estado al reconectar'
    assert.equal((await api(root,ownerToken,{name:latest.name,document:latest.document,revision:latest.revision},a.id,'PUT')).status,200)
    await B.context.setOffline(false)
    await until(async()=>{
      await selectLayer(B.page,1)
      return await B.page.getByLabel('Texto del elemento',{exact:true}).inputValue({timeout:500}).catch(()=>null)==='Estado al reconectar'
    },'Reconnect did not reconcile current state')
    const duplicate = await B.context.newPage()
    await duplicate.goto(`${stack.urls.web}/app/m/runly.studio/?design=${id}`)
    await selectLayer(duplicate,1)
    await until(async()=>((await (await api(`${root}/live`,ownerToken,peek)).json()).data.participants.filter(user=>user.userId===peer.id).length===2),'Duplicate sessions collapsed')
    await duplicate.goto(`${stack.urls.web}/app/m/runly.studio/`); await duplicate.close()
    await until(async()=>((await (await api(`${root}/live`,ownerToken,peek)).json()).data.participants.filter(user=>user.userId===peer.id).length===1),'Closed editor presence remained')
    reportCheck('offline/online recovery and separate bounded sessions; editor close removes presence')
    live=(await(await api(`${root}/live`,ownerToken,peek)).json()).data
    const oldSocket=await subscribe(peerToken,live.topic)
    const current=(await(await api(root,ownerToken)).json()).data
    assert.equal((await api(root,ownerToken,{name:current.name,document:current.document,revision:current.revision},a.id,'PUT')).status,200)
    await until(()=>oldSocket.events.length===1,'Old socket not live before revocation')
    assert.equal((await api(`${root}/collaborators`,ownerToken,{userId:peer.id,role:null},a.id,'PUT')).status,200)
    await B.page.getByText('El diseño ya no está disponible',{exact:true}).waitFor()
    for(const path of [root,`${root}/assets/${asset.id}/signed-url`,`/studio/designs/${copyId}`]) assert.equal((await api(path,peerToken)).status,404)
    assert.equal((await api(root,peerToken,{name:current.name,document:current.document,revision:current.revision},a.id,'PUT')).status,404)
    const after=(await(await api(root,ownerToken)).json()).data
    assert.equal((await api(root,ownerToken,{name:after.name,document:after.document,revision:after.revision},a.id,'PUT')).status,200)
    await new Promise(resolve=>setTimeout(resolve,1500))
    assert.equal(oldSocket.events.length,1,'A socket with cached authorization received a post-revocation event')
    const newLive=(await(await api(`${root}/live`,ownerToken,peek)).json()).data
    assert.notEqual(newLive.topic,live.topic)
    await subscribe(peerToken,newLive.topic,false)
    reportCheck('revocation rotates authorization; cached old socket gets no later event; fresh join, document, mutation and private asset capabilities denied')
    // SQL mutations below only affect the synthetic membership/resource in this container.
    await api(`${root}/collaborators`,ownerToken,{userId:peer.id,role:'EDITOR'},a.id,'PUT')
    await stack.pool.query('UPDATE membership SET enabled=false WHERE company_id=$1 AND user_id=$2',[a.id,peer.id])
    assert.equal((await api(root,peerToken)).status,403)
    await stack.pool.query('UPDATE membership SET enabled=true WHERE company_id=$1 AND user_id=$2',[a.id,peer.id])
    await stack.pool.query('UPDATE studio_design SET enabled=false WHERE id=$1',[id])
    assert.equal((await api(root,ownerToken)).status,404)
    await stack.pool.query('UPDATE studio_design SET enabled=true WHERE id=$1',[id])
    await stack.pool.query("UPDATE runly_module SET enabled=false WHERE key='runly.studio'")
    assert.equal((await api(root,ownerToken)).status,404)
    await stack.pool.query("UPDATE runly_module SET enabled=true WHERE key='runly.studio'")
    await stack.pool.query("INSERT INTO company_module(id,company_id,module_id,enabled,updated_at) SELECT uuidv7(),$1,id,false,now() FROM runly_module WHERE key='runly.studio' ON CONFLICT(company_id,module_id) DO UPDATE SET enabled=false",[a.id])
    assert.equal((await api(root,ownerToken)).status,404)
    assert.equal((await api('/studio/designs',ownerToken,{name:'Otra empresa',document:blankDocument()},b.id)).status,201)
    await stack.pool.query("UPDATE company_module SET enabled=true WHERE company_id=$1",[a.id])
    const audit=(await stack.pool.query("SELECT action FROM audit_log WHERE entity_id=$1 AND action LIKE 'studio.collaborator.%'",[id])).rows
    assert.ok(audit.some(row=>row.action==='studio.collaborator.grant'));assert.ok(audit.some(row=>row.action==='studio.collaborator.revoke'))
    await A.page.screenshot({path:join(stack.directory,'collaboration-owner.png'),fullPage:true})
    reportCheck('membership, disabled document and disabled module deny access; grant/change/revoke audit exists')
    return {passed:true,identities:3,interceptors:0,checks}
  } catch(error) {
    for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:join(stack.directory,'collaboration-failure.png'),fullPage:true}).catch(()=>{})
    throw error
  } finally { await Promise.all(clients.map(async client=>{ await client.removeAllChannels(); client.realtime.disconnect() })); await browser.close() }
}
