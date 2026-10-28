// Full-page and floating chat views can share a topic. Supabase returns the
// same channel for both, so its subscription must have a single owner.
const clients = new WeakMap();

export function sharePresence(client, topic, presence, handlers = {}) {
  let topics = clients.get(client);
  if (!topics) { topics = new Map(); clients.set(client, topics); }
  let entry = topics.get(topic);
  if (entry && entry.userId !== presence.userId && !entry.closing) {
    entry.listeners.clear();
    entry.ready = false;
    entry.closing = Promise.resolve(entry.channel ? client.removeChannel(entry.channel) : null);
  }
  if (!entry || entry.closing) {
    const previous = entry?.closing;
    entry = { userId: presence.userId, listeners: new Set(), typingSources: new Set(), typingSent: false, lastTypingAt: 0, channel: null, ready: false, closing: null };
    topics.set(topic, entry);
    const connect = () => {
      if (!entry.listeners.size) return;
      const channel = client.channel(topic, { config: { private: true, presence: { key: presence.userId } } });
      entry.channel = channel;
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        entry.listeners.forEach((listener) => listener.onPresenceSync?.(state));
      });
      channel.on('broadcast', { event: 'typing' }, (payload) => {
        entry.listeners.forEach((listener) => listener.onTyping?.(payload));
      });
      channel.subscribe((status) => {
        entry.ready = status === 'SUBSCRIBED';
        if (!entry.ready) { entry.typingSent = false; entry.lastTypingAt = 0; }
        if (entry.ready && entry.listeners.size) channel.track(presence).catch(() => {});
        else if (!entry.ready) entry.listeners.forEach((listener) => listener.onPresenceSync?.({}));
      });
    };
    // Coalesce immediate cleanup/remount, and wait for a previous asynchronous
    // unsubscribe before asking Supabase for the same topic again.
    Promise.resolve(previous).then(connect).catch(() => {
      entry.listeners.forEach((listener) => listener.onPresenceSync?.({}));
      console.warn('[chat] No se pudo abrir el canal de presencia.');
    });
  }
  const listener = { ...handlers };
  entry.listeners.add(listener);
  if (entry.ready) listener.onPresenceSync?.(entry.channel.presenceState());
  let disposed = false;
  function publishTyping(isTyping) {
    if (!entry.ready) return;
    const now = Date.now();
    if (isTyping && entry.typingSent && now - entry.lastTypingAt < 1000) return;
    if (!isTyping && !entry.typingSent) return;
    entry.typingSent = isTyping;
    entry.lastTypingAt = now;
    entry.channel.send({ type: 'broadcast', event: 'typing', payload: { userId: presence.userId, isTyping } }).catch(() => {});
  }
  return {
    sendTyping(isTyping) {
      if (disposed || !entry.listeners.has(listener)) return;
      if (isTyping) entry.typingSources.add(listener);
      else entry.typingSources.delete(listener);
      publishTyping(entry.typingSources.size > 0);
    },
    unsubscribe() {
      if (disposed) return;
      disposed = true;
      entry.listeners.delete(listener);
      entry.typingSources.delete(listener);
      if (!entry.typingSources.size) publishTyping(false);
      queueMicrotask(() => {
        if (entry.listeners.size || entry.closing) return;
        entry.ready = false;
        entry.closing = Promise.resolve(entry.channel ? client.removeChannel(entry.channel) : null);
        entry.closing.finally(() => { if (topics.get(topic) === entry) topics.delete(topic); }).catch(() => {});
      });
    },
  };
}
