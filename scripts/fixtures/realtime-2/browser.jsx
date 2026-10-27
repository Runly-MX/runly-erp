// Configuration injection only: production transports, real Auth/API/Realtime.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Y from 'yjs'
import { configure, getSupabaseClient, runly, useAuth } from 'realtime-2-boundary'
import { useCanvasRealtime } from '../../../apps/desktop/src/modules/runly.canvas/hooks/useCanvasRealtime.js'
import { SupabaseYjsProvider } from '../../../apps/desktop/src/modules/runly.notes/lib/SupabaseYjsProvider.js'
import { buildYDocSave, applyServerCatchUp } from '../../../apps/desktop/src/modules/runly.notes/lib/ydocPersistence.js'
import { createPresenceChannel, subscribeToMessages } from '../../../apps/desktop/src/modules/runly.chat/lib/supabaseRealtime.js'
import { RealtimeProvider } from '../../../apps/desktop/src/providers/RealtimeProvider.jsx'
import { useChatMessages } from '../../../apps/desktop/src/modules/runly.chat/hooks/useChatMessages.js'
import { useChatConversations } from '../../../apps/desktop/src/modules/runly.chat/hooks/useChatConversations.js'

let root, provider, doc, sceneSync, scene = [], presence, unsub, timer, query, config, renders = 0, received = 0
let latest, status, failures = [], latencies = [], sent = 0
const cursorSequences = new Map()
function Board() {
  const state = useCanvasRealtime(config.boardId, { pageId: config.pageId, selectedIds: [] })
  latest = state
  React.useEffect(() => state.cursorStore?.subscribe(() => observeCursors(state.cursorStore.getSnapshot())), [state.cursorStore])
  observeCursors(state.cursors ?? [])
  renders++
  return null
}
function observeCursors(cursors) {
  for (const cursor of cursors) {
    if (cursorSequences.get(cursor.id) === cursor.x) continue
    cursorSequences.set(cursor.id, cursor.x)
    if (Number.isFinite(cursor.y)) latencies.push(Date.now() - cursor.y)
    received++
  }
}
function Chat() {
  const messages = useChatMessages(config.conversationId)
  useChatConversations()
  latest = messages.data
  return null
}
window.start = async input => {
  config = input; await configure(input); query = new QueryClient()
  const client = getSupabaseClient()
  if (config.module === 'canvas') {
    root = createRoot(document.getElementById('root'))
    root.render(<QueryClientProvider client={query}><Board /></QueryClientProvider>)
  } else if (config.module === 'notes') {
    doc = new Y.Doc()
    doc.on('update', (_bytes, origin) => { if (origin === 'broadcast') received++ })
    provider = new SupabaseYjsProvider(doc, { noteId: config.noteId, supabase: client, runly, token: input.token, onStatus: value => { status = value } })
  } else if (import.meta.env.REALTIME_2_CANVAS && config.module === 'notes-canvas') {
    const { SupabaseCanvasSync } = await import('../../../apps/desktop/src/modules/runly.notes/lib/SupabaseCanvasSync.js')
    const { convertToExcalidrawElements } = await import('@excalidraw/excalidraw')
    scene = convertToExcalidrawElements(Array.from({length:100},(_,index)=>({id:`shape-${index}`,type:'rectangle',x:index*25,y:0,width:20,height:20,version:1,versionNonce:100+index})))
    sceneSync = new SupabaseCanvasSync({ noteId: config.noteId, supabase: client, identity: { id: config.actorId, name: 'Peer' },
      getLocalElements: () => scene, getSnapshot: () => ({elements:scene,layers:[{id:'layer',name:'Objects',order:0}],files:{},appState:{}}),
      onRemoteElements: elements => { scene=elements;received++ }, onRemoteSnapshot: snapshot => { scene=snapshot.elements;received++ },
      onRemotePointer: () => {received++}, onPresence: state => {latest=state}, onStatus: value => {status=value},
    })
  } else if (config.module === 'chat-ui') {
    root = createRoot(document.getElementById('root'))
    root.render(<QueryClientProvider client={query}><BrowserRouter><RealtimeProvider><Chat /><Chat /></RealtimeProvider></BrowserRouter></QueryClientProvider>)
  } else {
    presence = createPresenceChannel(`chat:presence:${config.conversationId}`, { userId: useAuth().userProfile.id }, {
      onPresenceSync: state => { latest = state },
      onTyping: ({ payload }) => { received++; if (payload?.isTyping) latencies.push(Date.now()) },
    })
    unsub = subscribeToMessages(config.conversationId, () => received++)
  }
}
window.state = () => ({
  ready: config?.module === 'notes' ? provider?.connected : config?.module === 'notes-canvas' ? status==='SUBSCRIBED' : config?.module === 'canvas' ? Boolean(latest) && getSupabaseClient().getChannels().some(ch => ch.state === 'joined') : Boolean(latest),
  channels: getSupabaseClient().getChannels().length, renders, received, sent, status, failures,
  cursors: (latest?.cursorStore?.getSnapshot() ?? latest?.cursors)?.length ?? 0, text: doc?.getText('benchmark').toString(),
  peers: config?.module === 'canvas' ? latest?.presence?.length ?? 0 : config?.module === 'chat' ? Object.keys(latest ?? {}).length : null,
  heapBytes: performance.memory?.usedJSHeapSize ?? null,
  sceneVersions: scene.map(element=>[element.id,element.version]),
  awarenessPeers: provider ? [...provider.awareness.getStates()].filter(([id])=>id!==doc.clientID).map(([,state])=>state.user) : [],
})
window.forgeAwareness = () => provider.setAwarenessField('user',{id:config.session.user.id,name:'Forged name',color:'#64748b'})
window.localText = value => doc.getText('benchmark').insert(doc.getText('benchmark').length,value)
window.persist = async () => {
  const save=buildYDocSave(doc,provider.serverStateVector)
  const result=await runly.notes.saveYDoc(config.noteId,save.update,config.token,{stateVector:save.stateVector})
  provider.serverStateVector=save.sentStateVector
  applyServerCatchUp(doc,result)
}
window.reconnect = () => {
  provider.destroy()
  provider=new SupabaseYjsProvider(doc,{noteId:config.noteId,supabase:getSupabaseClient(),runly,token:config.token,onStatus:value=>{status=value}})
}
window.newerScene = () => {scene=scene.map((element,index)=>index===0?{...element,version:9,versionNonce:900,x:999}:element)}
window.oldScene = () => sceneSync._rawSend('scene.full',{elements:scene.map((element,index)=>index===0?{...element,version:1,versionNonce:100,x:0}:element),layers:[{id:'layer',name:'Objects',order:0}],files:{},appState:{}})
window.latencies = () => latencies
window.active = () => {
  let seq = 0
  timer = setInterval(() => {
    seq++; sent++
    if (config.module === 'canvas') latest.broadcastPointer({ x: seq, y: Date.now() })
    else if (config.module === 'notes') doc.getText('benchmark').insert(doc.getText('benchmark').length, String(seq % 10))
    else if (config.module === 'notes-canvas') sceneSync.broadcastPointer({x:seq,y:Date.now(),selectedElementIds:{}})
    else if (config.module === 'chat-ui') runly.chat.sendMessage(config.conversationId,{body:`Message ${seq}`},config.token).catch(error=>failures.push(error.message))
    else presence.sendTyping(true)
  }, config.module === 'canvas' ? 16 : config.module.startsWith('notes') ? 50 : 1000)
}
window.pause = () => clearInterval(timer)
window.ownership = async () => {
  // A second visible view must not unsubscribe the first one's Postgres feed.
  let first = 0, second = 0
  unsub?.()
  const a = subscribeToMessages(config.conversationId, () => first++)
  const b = subscribeToMessages(config.conversationId, () => second++)
  await new Promise(resolve => setTimeout(resolve, 1500))
  window.ownershipResult = () => ({ first, second, channels: getSupabaseClient().getChannels().length })
  window.releaseSecond = b
  unsub = a
}
window.stop = async () => {
  clearInterval(timer); root?.unmount(); provider?.destroy(); doc?.destroy(); sceneSync?.destroy(); presence?.unsubscribe(); unsub?.(); window.releaseSecond?.()
  await getSupabaseClient().removeAllChannels()
  getSupabaseClient().realtime.disconnect()
}
