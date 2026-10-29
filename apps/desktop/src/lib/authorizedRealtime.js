import { getApiUrl } from './runtimeConfig.js'

const protectedTopic = /^(?:note:(?:ydoc|canvas):|canvas:board:|chat:(?:presence|conv|company):|company:|user:)/
const installed = new WeakSet()

// Keep the Supabase channel API used by existing modules. Broadcasts still use
// Supabase; writes/presence pass through Hono to avoid cached socket grants.
export function authorizeRealtimeClient(client) {
  if (installed.has(client)) return client
  installed.add(client)
  const nativeChannel = client.channel.bind(client)
  const nativeRemove = client.removeChannel.bind(client)
  const nativeChannels = client.getChannels.bind(client)
  const channels = new Set()

  async function request(path, body) {
    const session = body ? await client.auth.getSession() : null
    const token = session?.data?.session?.access_token
    const response = await fetch(`${getApiUrl()}/realtime/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error('Recurso no disponible')
    return response.json()
  }

  // All protected channels and revision listeners share one poll per client:
  // one timer, one in-flight request, a short reuse window for channels that
  // subscribe right after another, and a back-off after a failure so an API
  // restart does not cause a request storm.
  let revisionPromise = null, revisionFailedAt = 0, lastRevision, lastRevisionAt = 0, ticker = null
  const revisionListeners = new Set()
  function fetchRevision() {
    if (Date.now() - revisionFailedAt < 5_000) return Promise.reject(new Error('Recurso no disponible'))
    if (lastRevision && Date.now() - lastRevisionAt < 2_000) return Promise.resolve(lastRevision)
    revisionPromise ??= request('revision')
      .then((result) => {
        const changed = lastRevision !== undefined && lastRevision.revision !== result.revision
        lastRevision = result
        lastRevisionAt = Date.now()
        if (changed) revisionListeners.forEach((fn) => { try { fn(result.revision) } catch {} })
        return result
      })
      .catch((error) => { revisionFailedAt = Date.now(); throw error })
      .finally(() => { revisionPromise = null })
    return revisionPromise
  }
  function tick() {
    lastRevisionAt = 0
    if (!channels.size) return fetchRevision().catch(() => {})
    return Promise.all([...channels].map((channel) => channel.refresh()))
  }
  function syncTicker() {
    const needed = channels.size > 0 || revisionListeners.size > 0
    if (needed && !ticker) ticker = setInterval(tick, 10_000)
    if (!needed && ticker) { clearInterval(ticker); ticker = null }
  }

  // Grant changes (membership, role, permission, company...) rotate the
  // revision; callers such as the membership list refetch on that signal
  // instead of polling on their own.
  client.onRealtimeRevision = (fn) => {
    revisionListeners.add(fn)
    syncTicker()
    if (!lastRevision) fetchRevision().catch(() => {})
    return () => { revisionListeners.delete(fn); syncTicker() }
  }

  client.channel = (topic, options) => {
    if (!protectedTopic.test(topic)) return nativeChannel(topic, options)
    const bindings = []
    let socket, currentRevision, callback, subscribed = false, closed = false, busy = false, identityProtocol = 0
    let tracked = false, presence = {}
    const sender = crypto.randomUUID()
    const emitPresence = (event, payload) => bindings.filter(([type, filter]) => type === 'presence' && filter.event === event).forEach(([, , fn]) => fn(payload))
    const wrapper = {
      topic: `realtime:${topic}`,
      get state() { return socket?.state ?? 'closed' },
      get identityProtocol() { return identityProtocol },
      on(type, filter, fn) { bindings.push([type, filter, fn]); return wrapper },
      presenceState() { return presence },
      async track() { tracked = true; await heartbeat(); return 'ok' },
      async untrack() {
        tracked = false
        await request('presence', { topic, leave: true }).catch(() => {})
        return 'ok'
      },
      async send({ event, payload }) {
        if (closed) return 'error'
        try {
          await request('broadcast', { topic, event, payload: { ...payload, __runlySender: sender } })
          return 'ok'
        } catch { return 'error' }
      },
      refresh() { return subscribed ? refresh() : undefined },
      subscribe(fn) {
        callback = fn
        subscribed = true
        refresh()
        syncTicker()
        return wrapper
      },
      async unsubscribe() {
        closed = true
        channels.delete(wrapper)
        syncTicker()
        if (tracked) await wrapper.untrack()
        return socket ? nativeRemove(socket) : 'ok'
      },
    }

    async function heartbeat() {
      if (!tracked || closed) return
      try {
        const { data } = await request('presence', { topic })
        if (closed) return
        const left = Object.keys(presence).filter((id) => !data[id]).flatMap((id) => presence[id])
        presence = data
        emitPresence('sync', {})
        if (left.length) emitPresence('leave', { leftPresences: left })
      } catch {
        presence = {}
        emitPresence('sync', {})
      }
    }

    async function refresh() {
      if (closed || busy) return
      busy = true
      try {
        const { revision, identityProtocol: serverIdentityProtocol } = await fetchRevision()
        if (closed) return
        identityProtocol = serverIdentityProtocol === 1 ? 1 : 0
        if (currentRevision !== revision) {
          if (socket) await nativeRemove(socket)
          if (closed) return
          currentRevision = revision
          socket = nativeChannel(`${topic}@${revision}`, { ...options, config: { ...options?.config, private: true } })
          for (const [type, filter, fn] of bindings) {
            if (type === 'presence') continue
            socket.on(type, filter, (message) => {
              if (closed) return
              if (options?.config?.broadcast?.self !== true && message.payload?.__runlySender === sender) return
              fn(message)
            })
          }
          socket.subscribe((status, error) => { if (!closed) callback?.(status, error) })
        }
        await heartbeat()
      } catch { if (!closed) callback?.('CHANNEL_ERROR') }
      finally { busy = false }
    }
    channels.add(wrapper)
    return wrapper
  }
  client.removeChannel = (channel) => channels.has(channel) ? channel.unsubscribe() : nativeRemove(channel)
  client.removeAllChannels = () => Promise.all([...client.getChannels()].map((channel) => client.removeChannel(channel)))
  client.getChannels = () => [...nativeChannels().filter((ch) => !protectedTopic.test(ch.topic.replace(/^realtime:/, ''))), ...channels]
  return client
}
