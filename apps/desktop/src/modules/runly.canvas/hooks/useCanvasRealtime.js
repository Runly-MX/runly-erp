import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getSupabaseClient } from '../../../lib/supabase.js'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { applyObjectDelta, invalidationTargets } from '../lib/realtimeCache.js'
import { CURSOR_SEND_MS, createThrottle, createCursorStore } from '../lib/remoteCursors.js'

function createCanvasRealtimeSession({ boardId, user, onChanged, onCursor, onPresence, onReconnect }) {
  const supabase = getSupabaseClient()
  const channel = supabase.channel(`canvas:board:${boardId}`, {
    config: { private: true, broadcast: { self: false }, presence: { key: user.id } },
  })
  channel.on('broadcast', { event: 'canvas.changed' }, onChanged)
  channel.on('broadcast', { event: 'cursor' }, onCursor)
  channel.on('presence', { event: 'sync' }, () => {
    onPresence(Object.values(channel.presenceState()).flat().map((item) => item.user).filter(Boolean))
  })
  let subscribed = false
  channel.subscribe((status) => {
    if (status !== 'SUBSCRIBED') return
    channel.track({ user: { id: user.id, name: user.displayName ?? user.email, avatarUrl: user.avatarUrl ?? null } })
    if (subscribed) onReconnect?.()
    subscribed = true
  })
  return { channel, destroy: () => supabase.removeChannel(channel) }
}

export function useCanvasRealtime(boardId, { pageId, selectedIds, onBoardDeleted } = {}) {
  const { userProfile } = useAuth(), client = useQueryClient()
  const userId = userProfile?.id, displayName = userProfile?.displayName, email = userProfile?.email
  const channelRef = useRef(null)
  const [presence, setPresence] = useState([])
  const cursorStoreRef = useRef(null)
  if (!cursorStoreRef.current) cursorStoreRef.current = createCursorStore()
  const cursorStore = cursorStoreRef.current
  // Updated every render (no effect dep) so the subscription below always
  // calls the latest callback without resubscribing the channel.
  const onBoardDeletedRef = useRef(onBoardDeleted)
  onBoardDeletedRef.current = onBoardDeleted
  useEffect(() => {
    if (!boardId || !userId) return undefined
    setPresence([])
    cursorStore.clear()
    const session = createCanvasRealtimeSession({
      boardId,
      user: { id: userId, displayName, email },
      onChanged: (message) => {
        const payload = message?.payload ?? {}
        // The deleting session never receives its own broadcast (channel is
        // configured with broadcast.self = false), so this only fires for
        // other collaborators who had the Board open — they get redirected
        // instead of the usual cache invalidation (the Board is gone).
        if (payload.action === 'board.deleted') {
          client.removeQueries({ queryKey: ['canvas', 'boards', boardId] })
          client.invalidateQueries({ queryKey: ['canvas', 'boards'], exact: true })
          onBoardDeletedRef.current?.()
          return
        }
        if (payload.action === 'objects.changed' && !payload.refetch && (payload.upserts || payload.deletedIds)) {
          for (const [key] of client.getQueriesData({ queryKey: ['canvas', 'boards', boardId, 'objects'] })) {
            const pageId = key[4]
            client.setQueryData(key, (rows) => (rows ? applyObjectDelta(rows, pageId, payload) : rows))
          }
          return
        }
        const keys = { board: ['canvas', 'boards', boardId], objects: ['canvas', 'boards', boardId, 'objects'], links: ['canvas', 'boards', boardId, 'links'], versions: ['canvas', 'boards', boardId, 'versions'] }
        for (const target of payload.action === 'objects.changed' ? ['objects'] : invalidationTargets(payload.action)) {
          client.invalidateQueries({ queryKey: keys[target], exact: target === 'board' })
        }
      },
      onCursor: (message) => cursorStore.update(message?.payload),
      onPresence: setPresence,
      onReconnect: () => {
        cursorStore.clear()
        // Deltas sent during an outage are not a durable log. Reconcile only
        // this Board after rejoin; initial subscription already has its load.
        client.invalidateQueries({ queryKey: ['canvas', 'boards', boardId], exact: true })
        for (const kind of ['objects', 'links', 'versions']) client.invalidateQueries({ queryKey: ['canvas', 'boards', boardId, kind] })
      },
    })
    channelRef.current = session.channel
    return () => { channelRef.current = null; sendRef.current?.cancel(); cursorStore.clear(); session.destroy() }
  }, [boardId, client, cursorStore, displayName, email, userId])
  // presenceState() includes this session and one entry per open tab, so the
  // UI receives other collaborators only, de-duplicated by user.
  const others = [...new Map(presence.filter((user) => user.id !== userId).map((user) => [user.id, user])).values()]
  useLayoutEffect(() => {
    cursorStore.setContext({ selfId: userId, pageId, presence: others })
  })

  const othersRef = useRef(0), pageRef = useRef(pageId), selectionRef = useRef(selectedIds ?? [])
  othersRef.current = others.length; pageRef.current = pageId; selectionRef.current = selectedIds ?? []
  const sendRef = useRef(null)
  if (!sendRef.current) {
    sendRef.current = createThrottle((point) => {
      if (!othersRef.current) return
      channelRef.current?.send({ type: 'broadcast', event: 'cursor', payload: { pageId: pageRef.current, x: point?.x ?? null, y: point?.y ?? null, selectedIds: selectionRef.current } })
    }, CURSOR_SEND_MS)
  }
  const lastPointRef = useRef(null)
  const broadcastPointer = useCallback((point) => { lastPointRef.current = point; sendRef.current(point) }, [])
  // Selection changes are sent even without pointer movement.
  const selectionKey = (selectedIds ?? []).join(',')
  useEffect(() => { sendRef.current?.(lastPointRef.current) }, [selectionKey, pageId])

  return {
    presence: others,
    cursorStore,
    broadcastPointer,
  }
}
