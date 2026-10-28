const clients = new WeakMap()

function acquire(client, topic, kind, options, listener, connect) {
  let topics = clients.get(client)
  if (!topics) { topics = new Map(); clients.set(client, topics) }
  let entry = topics.get(topic)
  if (entry && (entry.kind !== kind || JSON.stringify(entry.options) !== JSON.stringify(options))) throw new Error('Configuracion de canal incompatible')
  if (entry && entry.ownerId && listener.ownerId && entry.ownerId !== listener.ownerId && !entry.closing) {
    entry.listeners.clear()
    entry.closing = Promise.resolve(entry.channel ? client.removeChannel(entry.channel) : null)
  }
  if (!entry || entry.closing) {
    const previous = entry?.closing
    entry = { kind, options, ownerId: listener.ownerId, channel: null, listeners: new Set(), closing: null }
    topics.set(topic, entry)
    const current = entry
    Promise.resolve(previous).then(() => {
      if (current.listeners.size) connect(current)
    }).catch(() => console.warn('[chat] No se pudo abrir la suscripcion compartida.'))
  }
  entry.ownerId ??= listener.ownerId
  entry.listeners.add(listener)
  let disposed = false
  return { entry, unsubscribe() {
    if (disposed) return
    disposed = true
    entry.listeners.delete(listener)
    queueMicrotask(() => {
      if (entry.listeners.size || entry.closing) return
      entry.closing = Promise.resolve(entry.channel ? client.removeChannel(entry.channel) : null)
      entry.closing.finally(() => { if (topics.get(topic) === entry) topics.delete(topic) }).catch(() => {})
    })
  } }
}

function dispatch(entry, fn) {
  for (const listener of entry.listeners) {
    try { fn(listener) } catch { console.warn('[chat] No se pudo procesar un evento compartido.') }
  }
}

export function shareMessages(client, conversationId, onMessage, { ownerId, onReconnect } = {}) {
  const topic = `chat:messages:${conversationId}`
  return acquire(client, topic, 'messages', undefined, { onMessage, onReconnect, ownerId }, entry => {
    let joined = false
    entry.channel = client.channel(topic).on('postgres_changes', {
      event: '*', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}`,
    }, payload => dispatch(entry, listener => listener.onMessage(payload)))
    entry.channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        if (joined) dispatch(entry, listener => listener.onReconnect?.())
        joined = true
      }
    })
  }).unsubscribe
}

export function shareBroadcasts(client, topic, handlers, options) {
  const acquired = acquire(client, topic, 'broadcast', options, { handlers }, entry => {
    // Register once before subscribe. A late consumer can add event handlers
    // locally without changing the authorized wrapper's native bindings.
    entry.channel = client.channel(topic, options).on('broadcast', { event: '*' }, payload => {
      dispatch(entry, listener => listener.handlers[payload.event]?.(payload))
    })
    entry.channel.subscribe()
  })
  return acquired.unsubscribe
}
