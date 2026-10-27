// Configuration injection only: production transports, real Auth/API/Realtime.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Y from 'yjs'
import { configure, getSupabaseClient, runly, useAuth } from 'realtime-2-boundary'
import { useCanvasRealtime } from '../../../apps/desktop/src/modules/runly.canvas/hooks/useCanvasRealtime.js'
import { SupabaseYjsProvider } from '../../../apps/desktop/src/modules/runly.notes/lib/SupabaseYjsProvider.js'
import { createPresenceChannel, subscribeToMessages } from '../../../apps/desktop/src/modules/runly.chat/lib/supabaseRealtime.js'

let root, provider, doc, presence, unsub, timer, query, config, renders = 0, received = 0
let latest, status, failures = [], latencies = [], sent = 0
const cursorSequences = new Map()
function Board() {
  const state = useCanvasRealtime(config.boardId, { pageId: config.pageId, selectedIds: [] })
  latest = state
  for (const cursor of state.cursors) {
    if (cursorSequences.get(cursor.id) === cursor.x) continue
    cursorSequences.set(cursor.id, cursor.x)
    if (Number.isFinite(cursor.y)) latencies.push(Date.now() - cursor.y)
    received++
  }
  renders++
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
  } else {
    presence = createPresenceChannel(`chat:presence:${config.conversationId}`, { userId: useAuth().userProfile.id }, {
      onPresenceSync: state => { latest = state },
      onTyping: ({ payload }) => { received++; if (payload?.isTyping) latencies.push(Date.now()) },
    })
    unsub = subscribeToMessages(config.conversationId, () => received++)
  }
}
window.state = () => ({
  ready: config?.module === 'notes' ? provider?.connected : config?.module === 'canvas' ? Boolean(latest) && getSupabaseClient().getChannels().some(ch => ch.state === 'joined') : Boolean(latest),
  channels: getSupabaseClient().getChannels().length, renders, received, sent, status, failures,
  cursors: latest?.cursors?.length ?? 0, text: doc?.getText('benchmark').toString(),
  peers: config?.module === 'canvas' ? latest?.presence?.length ?? 0 : config?.module === 'chat' ? Object.keys(latest ?? {}).length : null,
  heapBytes: performance.memory?.usedJSHeapSize ?? null,
})
window.latencies = () => latencies
window.active = () => {
  let seq = 0
  timer = setInterval(() => {
    seq++; sent++
    if (config.module === 'canvas') latest.broadcastPointer({ x: seq, y: Date.now() })
    else if (config.module === 'notes') doc.getText('benchmark').insert(doc.getText('benchmark').length, String(seq % 10))
    else presence.sendTyping(true)
  }, config.module === 'canvas' ? 16 : config.module === 'notes' ? 50 : 1000)
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
  clearInterval(timer); root?.unmount(); provider?.destroy(); doc?.destroy(); presence?.unsubscribe(); unsub?.(); window.releaseSecond?.()
  await getSupabaseClient().removeAllChannels()
  getSupabaseClient().realtime.disconnect()
}
