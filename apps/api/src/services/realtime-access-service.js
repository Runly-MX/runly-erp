import { modifyAwarenessUpdate } from 'y-protocols/awareness';

export function createRealtimeAccessService({ prisma, broadcaster }) {
  async function revision() {
    const [row] = await prisma.$queryRaw`SELECT revision::text FROM realtime_authorization_revision WHERE id`;
    return row.revision;
  }

  async function allowed(topic, userId, edit = false, db = prisma) {
    if (typeof topic !== 'string') return false;
    const note = topic.match(/^note:(ydoc|canvas):([0-9a-f-]{36})$/i);
    if (note) {
      const [row] = await db.$queryRaw`SELECT
        public.runly_note_user_access(${note[2]}::uuid, ${userId ?? null}::uuid, ${edit})
        OR (${!edit} AND public.notes_realtime_is_public(${note[2]}::uuid)) AS allowed`;
      return row?.allowed === true;
    }
    if (!userId) return false;
    const canvas = topic.match(/^canvas:board:([0-9a-f-]{36})$/i);
    if (canvas) {
      const [row] = await db.$queryRaw`SELECT public.runly_canvas_user_access(${canvas[1]}::uuid, ${userId}::uuid, ${edit}) AS allowed`;
      return row?.allowed === true;
    }
    const chat = topic.match(/^chat:(presence|conv):([0-9a-f-]{36})$/i);
    if (chat) {
      const [row] = await db.$queryRaw`SELECT public.runly_chat_user_access(${chat[2]}::uuid, ${userId}::uuid) AS allowed`;
      return row?.allowed === true;
    }
    const company = topic.match(/^company:([0-9a-f-]{36}):(presence|events)$/i) ?? topic.match(/^chat:company:([0-9a-f-]{36})$/i);
    if (company) {
      const [row] = await db.$queryRaw`SELECT public.runly_member_active(${company[1]}::uuid, ${userId}::uuid) AS allowed`;
      return row?.allowed === true;
    }
    return topic === `user:${userId}:events` && Boolean(await db.userProfile.findFirst({ where: { id: userId, enabled: true }, select: { id: true } }));
  }

  async function relay({ topic, event, payload, actorId }) {
    // Arbitrary company/user events and guest messages can only be emitted by
    // their module service. This relay serves document edits and chat typing.
    const note = /^note:(ydoc|canvas):[0-9a-f-]{36}$/i.test(topic ?? '');
    // canvas.changed is authoritative: only Canvas services may announce a
    // committed delta/deletion. An editor's cursor permission cannot mint it.
    const canvas = /^canvas:board:[0-9a-f-]{36}$/i.test(topic ?? '') && event === 'cursor';
    const typing = /^chat:presence:[0-9a-f-]{36}$/i.test(topic ?? '') && event === 'typing';
    if ((!note && !canvas && !typing) || !actorId || typeof event !== 'string' || event.length > 80) return false;
    if (JSON.stringify(payload ?? {}).length > 2_000_000) return false;
    if (!(await allowed(topic, actorId, note || canvas))) return false;
    const user = await prisma.userProfile.findFirst({ where: { id: actorId, enabled: true }, select: { displayName: true, authUserId: true } });
    if (!user) return false;
    let outgoingPayload = payload;
    if (topic.startsWith('note:ydoc:') && event === 'awareness.update') {
      // The channel grant authenticates access, not the identity inside Y.js
      // awareness JSON. Rewrite it at the existing authenticated relay, using
      // the standard protocol helper; never alter cursor/selection CRDT data.
      if (typeof payload?.update !== 'string' || payload.update.length > 100_000) return false;
      const id = user.authUserId ?? actorId;
      try {
        let states = 0;
        const bytes = modifyAwarenessUpdate(new Uint8Array(Buffer.from(payload.update, 'base64')), (state) => {
          if (++states > 200) throw new Error('Awareness demasiado grande');
          if (state === null) return null;
          if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Awareness invalido');
          // Older clients can forward a roster at join. Reject such a packet
          // rather than reattribute another person's state to this sender.
          if (state.user?.id && state.user.id !== id) throw new Error('Identidad ajena');
          const color = /^#[0-9a-f]{6}$/i.test(state.user?.color ?? '') ? state.user.color : '#64748b';
          return { ...state, user: { id, name: user.displayName || 'Usuario', color, avatarUrl: null } };
        });
        outgoingPayload = { ...payload, update: Buffer.from(bytes).toString('base64') };
      } catch { return false; }
    }
    // Canvas peers identify cursors by the authenticated actor, never by a
    // client-supplied id.
    const outgoing = typing
      ? { isTyping: Boolean(payload?.isTyping), userId: actorId, displayName: user.displayName }
      : canvas ? { ...(payload ?? {}), actorId }
        : topic.startsWith('note:canvas:') && event === 'pointer'
          ? { ...(payload ?? {}), senderId: actorId, user: { id: actorId, name: user.displayName } }
          : outgoingPayload;
    await broadcaster.broadcastToChannel(topic, event, outgoing, { authorize: (tx) => allowed(topic, actorId, note || canvas, tx) });
    return true;
  }

  async function presence({ topic, actorId, leave = false }) {
    if (!actorId || !(await allowed(topic, actorId))) return null;
    if (leave) {
      await prisma.$executeRaw`DELETE FROM realtime_user_presence WHERE topic = ${topic} AND user_id = ${actorId}::uuid`;
    } else {
      await prisma.$executeRaw`INSERT INTO realtime_user_presence (topic, user_id) VALUES (${topic}, ${actorId}::uuid)
        ON CONFLICT (topic, user_id) DO UPDATE SET seen_at = now()`;
    }
    const rows = await prisma.$queryRaw`SELECT u.id, u.display_name FROM realtime_user_presence p
      JOIN user_profile u ON u.id = p.user_id AND u.enabled
      WHERE p.topic = ${topic} AND p.seen_at > now() - interval '35 seconds' LIMIT 200`;
    const state = {};
    for (const user of rows) {
      if (!(await allowed(topic, user.id))) continue;
      state[user.id] = [{ userId: user.id, displayName: user.display_name, status: 'online', user: { id: user.id, name: user.display_name } }];
    }
    return state;
  }
  return { revision, allowed, relay, presence };
}
