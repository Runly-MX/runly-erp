import { useCallback, useEffect, useRef, useState } from 'react'
import { runly } from '../../../lib/runly.js'
import { supabase } from '../../../lib/supabase.js'

// onChange: collaborators' operation batches (real-time sync); onRevision: whole-document
// revisions (polling and `changed` broadcasts from PUT/MCP) plus edit permission.
export function useStudioRealtime({ id, token, scope, onRevision, onDenied, onChange }) {
  const [participants, setParticipants] = useState([]), [status, setStatus] = useState('Conectando')
  const [sessionId] = useState(() => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''))
  const callbacks = useRef({ onRevision, onDenied, onChange }), live = useRef({ cursor: null, selectedId: null }), send = useRef(null)
  useEffect(() => { callbacks.current = { onRevision, onDenied, onChange } }, [onRevision, onDenied, onChange])
  useEffect(() => {
    let active = true, denied=false, channel, topic, busy = false, lastSent = 0, scheduled, pointerTimer, pendingCursor = false, requestPending = false
    async function refresh(peek = false) {
      if (!active || denied || busy) return
      busy = true
      if (!peek) pendingCursor = false
      try {
        const { data } = await runly.studio.live(id, { sessionId, ...live.current, peek }, token)
        if (!active) return
        setParticipants(data.participants)
        callbacks.current.onRevision?.(data.revision, data.canEdit)
        if (topic !== data.topic) {
          if (channel) await supabase.removeChannel(channel)
          if (!active) return
          topic = data.topic
          channel = supabase.channel(topic, { config: { private: true } })
            .on('broadcast', { event: 'change' }, message => {
              if (active && Number.isSafeInteger(message.payload?.revision)) callbacks.current.onChange?.(message.payload)
            })
            .on('broadcast', { event: 'changed' }, message => {
              if (active && Number.isSafeInteger(message.payload?.revision)) callbacks.current.onRevision?.(message.payload.revision)
            })
            .on('broadcast', { event: 'presence' }, () => {
              if (!active || requestPending) return
              requestPending = true
              scheduled = setTimeout(() => { requestPending = false; refresh(true) }, 150)
            })
          channel.subscribe(state => {
            if (!active) return
            setStatus(state === 'SUBSCRIBED' ? 'Conectado' : 'Reconectando')
            if (state === 'SUBSCRIBED') refresh(true)
          })
        }
        if (channel?.state === 'joined') setStatus('Conectado')
      } catch (error) {
        if (!active) return
        setStatus('Reconectando'); setParticipants([])
        if ([401, 403, 404].includes(error.status)) {
          denied=true
          if (channel) await supabase.removeChannel(channel)
          channel = null; topic = null; setStatus('Sin acceso'); callbacks.current.onDenied?.()
        }
      } finally { busy = false; if (active && pendingCursor) send.current?.() }
    }
    send.current = () => {
      pendingCursor = true; clearTimeout(pointerTimer)
      pointerTimer = setTimeout(() => { lastSent = Date.now(); refresh() }, Math.max(0, 200 - (Date.now() - lastSent)))
    }
    refresh()
    const timer = setInterval(() => refresh(), 2500)
    const expiry = setInterval(() => setParticipants(rows => rows.filter(user => Date.now() - Date.parse(user.seenAt) < 15000)), 2000)
    const online = () => refresh()
    window.addEventListener('online', online)
    return () => {
      active = false; send.current = null; clearInterval(timer); clearInterval(expiry); clearTimeout(scheduled); clearTimeout(pointerTimer)
      window.removeEventListener('online', online)
      runly.studio.live(id, { sessionId, leave: true }, token).catch(() => {})
      if (channel) supabase.removeChannel(channel)
    }
  }, [id, token, scope, sessionId])
  const pointer = useCallback(cursor => { live.current.cursor = cursor; send.current?.() }, [])
  const selection = useCallback(selectedId => { live.current.selectedId = selectedId; send.current?.() }, [])
  return { participants: participants.filter(user => user.sessionId !== sessionId), status, pointer, selection }
}
