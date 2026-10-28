import { canReceiveResourceEvent } from './notification-access.js'
// Same broadcaster for processes without the API's supabase wiring (the worker): null when the
// realtime credentials are not in the environment.
export function createRealtimeBroadcasterFromEnv({ prisma, env = process.env }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createRealtimeBroadcaster({ prisma, supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
}

export function createRealtimeBroadcaster({ supabaseUrl, serviceRoleKey, prisma }) {
  const endpoint = `${supabaseUrl}/realtime/v1/api/broadcast`

  async function _send(messages, authorize = null) {
    await prisma.$transaction(async (tx) => {
      const [scope] = await tx.$queryRaw`SELECT revision::text FROM realtime_authorization_revision WHERE id FOR SHARE`;
      if (authorize && !(await authorize(tx))) return;
      const safe = [];
      for (const message of messages) {
        const match = message.topic.match(/^user:([0-9a-f-]{36}):events$/i);
        if (!match || await canReceiveResourceEvent(tx, match[1], message.payload)) safe.push(message);
      }
      if (!safe.length) return;
      messages = safe;
      messages = messages.map((message) => ({ ...message, topic: `${message.topic}@${scope.revision}` }));
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
      },
      body: JSON.stringify({ messages }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(`[realtime-broadcaster] broadcast failed status=${res.status}`, text.slice(0, 200))
    }
    });
  }

  // private: true on every message sent through this service. Every topic
  // this broadcaster ever targets (user:*:events, company:*:events,
  // chat:presence:*, chat:conv:*, chat:company:*) was switched to Realtime
  // Authorization (`{ config: { private: true } }` on the client's
  // `.channel()` call) during the 2026-09-11 multi-tenant sweep. Realtime
  // treats private and non-private subscribers to the SAME topic string as
  // two distinct delivery pools — a message posted without `private: true`
  // silently never reaches a client that joined privately, even though that
  // client's subscription itself succeeded. Omitting this flag here was
  // exactly that bug: every server-sent chat message/notification/presence
  // event stopped arriving in real time the moment those RLS policies went
  // live, without the subscribe-side auth ever failing or logging anything.
  async function broadcastToUser(profileId, event, payload) {
    // Authorization is evaluated once, inside _send, under the revision lock.
    if (!profileId) return
    await _send([{
      topic: `user:${profileId}:events`,
      event,
      payload: payload ?? {},
      private: true,
    }]).catch((err) => {
      console.warn('[realtime-broadcaster] broadcastToUser error:', err?.message)
    })
  }

  // payload may be a function of the recipient id for per-recipient fields
  // (for example the id of that recipient's own notification row).
  async function broadcastToUsers(profileIds, event, payload) {
    const payloadFor = (id) => (typeof payload === 'function' ? payload(id) : payload)
    const ids = [...new Set((profileIds ?? []).filter(Boolean))]
    if (!ids.length) return
    await _send(
      ids.map((id) => ({
        topic: `user:${id}:events`,
        event,
        payload: payloadFor(id) ?? {},
        private: true,
      })),
    ).catch((err) => {
      console.warn('[realtime-broadcaster] broadcastToUsers error:', err?.message)
    })
  }

  async function broadcastToCompany(companyId, event, payload) {
    if (!companyId) return
    await _send([{
      topic: `company:${companyId}:events`,
      event,
      payload: payload ?? {},
      private: true,
    }]).catch((err) => {
      console.warn('[realtime-broadcaster] broadcastToCompany error:', err?.message)
    })
  }

  async function broadcastToChannel(channelName, event, payload, { authorize } = {}) {
    if (!channelName) return
    await _send([{
      topic: channelName,
      event,
      payload: payload ?? {},
      private: true,
    }], authorize).catch((err) => {
      console.warn('[realtime-broadcaster] broadcastToChannel error:', err?.message)
    })
  }

  return { broadcastToUser, broadcastToUsers, broadcastToCompany, broadcastToChannel }
}

export function createNoopBroadcaster() {
  return {
    broadcastToUser: async () => {},
    broadcastToUsers: async () => {},
    broadcastToCompany: async () => {},
    broadcastToChannel: async () => {},
  }
}
