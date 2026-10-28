import {
  notificationPublishSchema,
  notificationListQuerySchema,
  notificationPreferenceUpsertSchema,
  webPushSubscriptionSchema,
  fcmSubscriptionSchema,
} from "@runly/validators";

import { getDefaultNotificationPreference } from '@runly/core';
import { isInDnd, passesDnd } from './dnd.js';
import { attachUserAvatarUrls } from '../lib/attach-user-avatars.js';
import { createRealtimeBroadcasterFromEnv } from './realtime-broadcaster.js';

const DEDUPE_WINDOW_MS = 5000;

const DIAGNOSTIC_EVENTS = ["chat.message.new", "chat.mention.new", "chat.call.incoming"];

// Chat-message emails (`chat.mail:<conv>:<user>` dedupe keys) are throttled to at
// most one per conversation per recipient within this window, and additionally
// suppressed while a prior one is still unread — opening the conversation marks
// it read (markReadBySource), which re-arms the next email. Product behavior, not
// configuration; keep in sync with CHAT_EMAIL_THROTTLE_MS in chat-service.js.
const CHAT_MAIL_THROTTLE_MS = 24 * 60 * 60 * 1000; // 24 hours

const PRIORITY_KIND_MAP = {
  low: "info",
  medium: "info",
  high: "warning",
  critical: "error",
};

export class NotificationServiceError extends Error {
  constructor(message, status = 500, code = "notification_error") {
    super(message);
    this.name = "NotificationServiceError";
    this.status = status;
    this.code = code;
  }
}

function toNotificationView(row) {
  return {
    ...row,
    read: Boolean(row.readAt),
  };
}

// Chat-origin events (messages, mentions, thread replies) live in their own
// "Mensajes" tab; everything else is "General".
const MESSAGE_EVENT_PREFIXES = ["chat."];

function messageCategoryClause() {
  return { OR: MESSAGE_EVENT_PREFIXES.map((prefix) => ({ eventType: { startsWith: prefix } })) };
}

function buildCompanyScopeClause(companyId) {
  return {
    OR: [{ companyId }, { companyId: null }],
  };
}

function buildListWhere({ userId, companyId, query }) {
  const where = {
    userId,
    ...buildCompanyScopeClause(companyId),
    AND: [{ OR: [{ deliveries: { some: { channel: "in_app" } } }, { deliveries: { none: {} } }] }],
  };

  if (query.unreadOnly === true) {
    where.readAt = null;
  }
  if (query.priority) {
    where.priority = query.priority;
  }
  if (query.eventType) {
    // A trailing dot filters by module prefix (e.g. "calendar.").
    where.eventType = query.eventType.endsWith(".")
      ? { startsWith: query.eventType }
      : query.eventType;
  }
  if (query.category === "messages") {
    where.AND.push(messageCategoryClause());
  } else if (query.category === "general") {
    where.AND.push({ NOT: messageCategoryClause() });
  }
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = query.from;
    if (query.to) where.createdAt.lte = query.to;
  }
  if (query.q) {
    const term = query.q.trim();
    if (term) {
      where.OR = [
        { title: { contains: term, mode: "insensitive" } },
        { body: { contains: term, mode: "insensitive" } },
        { eventType: { contains: term, mode: "insensitive" } },
      ];
      where.AND.push(buildCompanyScopeClause(companyId));
    }
  }
  return where;
}

// One grouped query for the whole unread summary. The predicate mirrors
// buildListWhere (company scope + in-app delivery rule + chat. prefix category)
// and is pinned against list() by a parity test.
async function readUnreadSummary(prisma, { userId, companyId }) {
  const [row] = await prisma.$queryRaw`
    /* notification_summary */
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE n.event_type LIKE 'chat.%')::int AS messages,
      count(*) FILTER (WHERE n.event_type NOT LIKE 'chat.%')::int AS general,
      (array_agg(n.id ORDER BY n.id DESC))[1]::text AS latest_unread_id
    FROM notification n
    WHERE n.user_id = ${userId}::uuid
      AND (n.company_id = ${companyId}::uuid OR n.company_id IS NULL)
      AND n.read_at IS NULL
      AND (
        EXISTS (SELECT 1 FROM notification_delivery d WHERE d.notification_id = n.id AND d.channel = 'in_app')
        OR NOT EXISTS (SELECT 1 FROM notification_delivery d WHERE d.notification_id = n.id)
      )`;
  return {
    unreadCount: row?.total ?? 0,
    unreadByCategory: { messages: row?.messages ?? 0, general: row?.general ?? 0 },
    latestUnreadId: row?.latest_unread_id ?? null,
  };
}

// Producers build their own service instances without wiring a broadcaster, so
// without a fallback only the instance created in index.js ever announced
// `notification.new`; every other producer relied on polling. One lazy
// broadcaster per prisma client covers all of them (null without credentials).
const sharedBroadcasters = new WeakMap();
function sharedBroadcaster(prisma) {
  if (!prisma || typeof prisma !== "object") return null;
  if (!sharedBroadcasters.has(prisma)) sharedBroadcasters.set(prisma, createRealtimeBroadcasterFromEnv({ prisma }));
  return sharedBroadcasters.get(prisma);
}

export function createNotificationService({ prisma, broadcaster: injectedBroadcaster = null, supabaseAdmin = null }) {
  const broadcaster = injectedBroadcaster ?? sharedBroadcaster(prisma);
  // activeCompanyId: the caller's validated active company, resolved by the
  // API's tenant middleware and threaded down from routes/notifications.js.
  // See docs/superpowers/specs/2026-09-10-multi-tenant-architecture-design.md §5.
  async function resolveCompanyContext(authUserId, activeCompanyId) {
    const profile = await prisma.userProfile.findUnique({
      where: { authUserId },
      select: { id: true },
    });
    if (!profile) {
      throw new NotificationServiceError(
        "Perfil de usuario no encontrado.",
        404,
        "profile_not_found",
      );
    }

    if (!activeCompanyId) {
      // Never guess: an unresolved active company (e.g. a system-admin
      // request with no company header) must reject, not silently fall
      // back to whichever membership was created first/last.
      throw new NotificationServiceError(
        "No tienes una empresa activa.",
        403,
        "no_active_company",
      );
    }

    return { profileId: profile.id, companyId: activeCompanyId };
  }

  async function list({ authUserId, companyId: activeCompanyId, query }) {
    const parsed = notificationListQuerySchema.parse(query ?? {});
    const { profileId, companyId } = await resolveCompanyContext(authUserId, activeCompanyId);
    const where = buildListWhere({ userId: profileId, companyId, query: parsed });

    const take = parsed.limit + 1;
    const options = {
      where,
      orderBy: [{ id: "desc" }],
      take,
    };
    if (parsed.cursor) {
      options.cursor = { id: parsed.cursor };
      options.skip = 1;
    }

    // counts=0 lets a caller that already holds the summary skip the counters.
    const withCounts = String(query?.counts ?? "1") !== "0";
    const [rows, summary] = await Promise.all([
      prisma.notification.findMany(options),
      withCounts ? readUnreadSummary(prisma, { userId: profileId, companyId }) : null,
    ]);
    const hasNext = rows.length > parsed.limit;
    const items = hasNext ? rows.slice(0, parsed.limit) : rows;
    const nextCursor = hasNext ? items.at(-1)?.id ?? null : null;

    const data = await attachActors(items.map(toNotificationView));

    return {
      data,
      ...(summary ? { unreadCount: summary.unreadCount, unreadByCategory: summary.unreadByCategory } : {}),
      pageInfo: { nextCursor },
    };
  }

  // Cheap counters for the bell: no list rows, no actor lookup.
  async function summary({ authUserId, companyId: activeCompanyId }) {
    const { profileId, companyId } = await resolveCompanyContext(authUserId, activeCompanyId);
    return readUnreadSummary(prisma, { userId: profileId, companyId });
  }

  // Chat notifications created before the actor was stamped carry no sender:
  // recover it from the conversation's latest message from someone else.
  async function resolveLegacyChatSenders(views) {
    const legacy = views.filter(
      (n) => n.sourceType === "chat_conversation" && n.sourceId && !n.metadata?.actorId,
    );
    const result = new Map(); // conversationId -> { senderId, title, type }
    if (!legacy.length) return result;
    const conversationIds = [...new Set(legacy.map((n) => n.sourceId))];
    const rows = await prisma.$queryRaw`
      SELECT DISTINCT ON (m.conversation_id)
        m.conversation_id::text AS conversation_id,
        m.sender_user_id::text AS sender_id,
        c.title AS title,
        c.type AS type
      FROM chat_messages m
      JOIN chat_conversations c ON c.id = m.conversation_id
      WHERE m.conversation_id = ANY(${conversationIds}::uuid[])
        AND m.sender_user_id IS NOT NULL
        AND m.sender_user_id <> ${legacy[0].userId}::uuid
      ORDER BY m.conversation_id, m.created_at DESC
    `;
    for (const row of rows) {
      result.set(row.conversation_id, { senderId: row.sender_id, title: row.title, type: row.type });
    }
    return result;
  }

  // Resolves the person behind each notification (`metadata.actorId`, stamped
  // at publish time) into something displayable. Never fails a list.
  async function attachActors(views) {
    try {
      const legacy = await resolveLegacyChatSenders(views);
      const actorIdOf = (n) => n.metadata?.actorId ?? legacy.get(n.sourceId)?.senderId ?? null;
      const actorIds = [...new Set(views.map(actorIdOf).filter(Boolean))];
      if (!actorIds.length) return views;
      const profiles = await prisma.userProfile.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, displayName: true, avatarFileId: true, isBot: true },
      });
      await attachUserAvatarUrls(profiles, { prisma, supabaseAdmin });
      const byId = new Map(profiles.map((p) => [p.id, p]));
      return views.map((n) => {
        const actor = byId.get(actorIdOf(n));
        if (!actor) return n;
        const conv = legacy.get(n.sourceId);
        const metadata = conv && !n.metadata?.conversationType
          ? { ...(n.metadata ?? {}), conversationTitle: conv.title ?? null, conversationType: conv.type ?? null }
          : n.metadata;
        return {
          ...n,
          metadata,
          actor: { id: actor.id, displayName: actor.displayName, avatarUrl: actor.avatarUrl ?? null, isBot: actor.isBot },
        };
      });
    } catch (err) {
      console.error("[notifications.actors]", err?.message ?? err);
      return views;
    }
  }

  // Support report for "I'm not receiving push": what this user has registered,
  // what the server would do for the key events, and the latest delivery
  // outcomes. Never returns endpoints/tokens beyond a short, non-usable tail.
  async function getPushDiagnostics({ authUserId, companyId: activeCompanyId, server = {} }) {
    const { profileId } = await resolveCompanyContext(authUserId, activeCompanyId);
    const [subs, tokens, prefs, deliveries] = await Promise.all([
      prisma.pushSubscription.findMany({
        where: { userId: profileId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, enabled: true, deviceLabel: true, userAgent: true, endpoint: true, lastSeenAt: true, createdAt: true },
      }),
      prisma.fcmDeviceToken.findMany({
        where: { userId: profileId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, enabled: true, deviceLabel: true, token: true, lastSeenAt: true, createdAt: true },
      }),
      prisma.notificationPreference.findMany({
        where: { userId: profileId, eventType: { in: DIAGNOSTIC_EVENTS } },
        select: { eventType: true, inAppEnabled: true, pushEnabled: true, muteUntil: true },
      }),
      prisma.notificationDelivery.findMany({
        where: { channel: { in: ["web_push", "fcm"] }, notification: { userId: profileId } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          channel: true, status: true, attempts: true, lastError: true, createdAt: true, sentAt: true,
          notification: { select: { eventType: true } },
        },
      }),
    ]);

    const prefByType = new Map(prefs.map((row) => [row.eventType, row]));
    const hostOf = (endpoint) => {
      try { return new URL(endpoint).host; } catch { return "desconocido"; }
    };

    return {
      generatedAt: new Date().toISOString(),
      server,
      webPushSubscriptions: subs.map((row) => ({
        id: row.id,
        enabled: row.enabled,
        device: row.deviceLabel,
        userAgent: row.userAgent,
        pushService: hostOf(row.endpoint),
        lastSeenAt: row.lastSeenAt,
        createdAt: row.createdAt,
      })),
      fcmTokens: tokens.map((row) => ({
        id: row.id,
        enabled: row.enabled,
        device: row.deviceLabel,
        tokenTail: row.token.slice(-6),
        lastSeenAt: row.lastSeenAt,
        createdAt: row.createdAt,
      })),
      effectivePreferences: DIAGNOSTIC_EVENTS.map((eventType) => {
        const saved = prefByType.get(eventType);
        const effective = { ...getDefaultNotificationPreference(eventType), ...saved };
        return {
          eventType,
          push: effective.pushEnabled !== false,
          savedByUser: Boolean(saved),
          mutedUntil: saved?.muteUntil && new Date(saved.muteUntil) > new Date() ? saved.muteUntil : null,
        };
      }),
      recentDeliveries: deliveries.map((row) => ({
        eventType: row.notification?.eventType,
        channel: row.channel,
        status: row.status,
        attempts: row.attempts,
        error: row.lastError,
        createdAt: row.createdAt,
        sentAt: row.sentAt,
      })),
    };
  }

  async function getOwnedNotification({ authUserId, companyId: activeCompanyId, id }) {
    const { profileId, companyId } = await resolveCompanyContext(authUserId, activeCompanyId);
    const row = await prisma.notification.findFirst({
      where: {
        id,
        userId: profileId,
        ...buildCompanyScopeClause(companyId),
      },
    });
    if (!row) {
      throw new NotificationServiceError(
        "Notificacion no encontrada.",
        404,
        "notification_not_found",
      );
    }
    return row;
  }

  async function markRead({ authUserId, companyId: activeCompanyId, id }) {
    const row = await getOwnedNotification({ authUserId, companyId: activeCompanyId, id });
    if (row.readAt) return toNotificationView(row);

    const updated = await prisma.notification.update({
      where: { id: row.id },
      data: { readAt: new Date() },
    });
    return toNotificationView(updated);
  }

  async function markAllRead({ authUserId, companyId: activeCompanyId }) {
    const { profileId, companyId } = await resolveCompanyContext(authUserId, activeCompanyId);
    const result = await prisma.notification.updateMany({
      where: {
        userId: profileId,
        readAt: null,
        ...buildCompanyScopeClause(companyId),
      },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async function resolveRecipientUserIds({ companyId, userIds }) {
    const rows = await prisma.membership.findMany({
      where: {
        companyId,
        enabled: true,
        userId: { in: userIds },
      },
      select: { userId: true },
    });
    return [...new Set(rows.map((row) => row.userId))];
  }

  async function isDuplicate({ tx, userId, dedupeKey }) {
    if (!dedupeKey) return false;
    // Chat email throttle: skip if a prior chat email for this conversation is
    // still unread OR was created within the throttle window.
    if (dedupeKey.startsWith('chat.mail:')) {
      const since = new Date(Date.now() - CHAT_MAIL_THROTTLE_MS);
      const row = await tx.notification.findFirst({
        where: {
          userId,
          dedupeKey,
          OR: [{ readAt: null }, { createdAt: { gte: since } }],
        },
        select: { id: true },
      });
      return Boolean(row);
    }
    const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
    const row = await tx.notification.findFirst({
      where: { userId, dedupeKey, createdAt: { gte: since } },
      select: { id: true },
    });
    return Boolean(row);
  }

  async function markReadBySource({ authUserId, companyId: activeCompanyId, sourceType, sourceId }) {
    const { profileId, companyId } = await resolveCompanyContext(authUserId, activeCompanyId);
    const result = await prisma.notification.updateMany({
      where: {
        userId: profileId,
        readAt: null,
        sourceType,
        sourceId,
        ...buildCompanyScopeClause(companyId),
      },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  // `respectChannelDefaults: false` — the caller has already decided the
  // recipient should get this on the external channels (e.g. chat-service has
  // run its own away/throttle gate for chat-message email), so email/web_push
  // are allowed unless the recipient has an EXPLICIT saved opt-out. `mute` and
  // in-app defaults are still honoured.
  async function publish({ companyId, actorId = null, input, respectChannelDefaults = true }) {
    const parsed = notificationPublishSchema.parse(input ?? {});
    const recipientUserIds = await resolveRecipientUserIds({
      companyId,
      userIds: parsed.recipients.userIds,
    });
    if (!recipientUserIds.length) {
      throw new NotificationServiceError(
        "No se encontraron destinatarios validos para la empresa activa.",
        400,
        "no_valid_recipients",
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const created = [];
      const updated = [];
      const inAppRecipientIds = [];
      // Per-recipient identity of the row the alert is about, so every delivery
      // path (broadcast, push) can share one stable notification identity.
      const identities = new Map();
      let deduped = 0;

      for (const userId of recipientUserIds) {
        const dedupeKey =
          parsed.dedupeKey ??
          `${parsed.eventType}:${parsed.sourceType ?? ""}:${parsed.sourceId ?? ""}:${userId}`;

        // Chat messages collapse into whatever unread notification already
        // exists for this conversation instead of spawning one per message —
        // otherwise a burst of messages (especially while the recipient is
        // mid-conversation) floods the bell with one row each and re-fires
        // push/FCM per message. The dedupeKey is per-conversation (not
        // per-message) so every message after the first here just bumps the
        // existing row's preview + count and skips creating new deliveries.
        if (dedupeKey.startsWith('chat.message.new:')) {
          const existing = await tx.notification.findFirst({
            where: { userId, dedupeKey, readAt: null },
          });
          if (existing) {
            const priorCount = typeof existing.metadata?.count === 'number' ? existing.metadata.count : 1;
            const updatedNotification = await tx.notification.update({
              where: { id: existing.id },
              data: {
                title: parsed.title,
                body: parsed.body ?? existing.body,
                metadata: { ...(existing.metadata ?? {}), ...(parsed.metadata ?? {}), ...(actorId ? { actorId: String(actorId) } : {}), count: priorCount + 1 },
              },
            });
            inAppRecipientIds.push(userId);
            identities.set(userId, { id: updatedNotification.id, count: updatedNotification.metadata?.count ?? priorCount + 1 });
            updated.push(updatedNotification);
            continue;
          }
        } else if (await isDuplicate({ tx, userId, dedupeKey })) {
          deduped += 1;
          continue;
        }

        // Saved choices always override defaults, including explicit opt-outs.
        const pref = await tx.notificationPreference.findFirst({
          where: { userId, eventType: parsed.eventType },
          select: { inAppEnabled: true, emailEnabled: true, pushEnabled: true, muteUntil: true },
        });
        const effective = { ...getDefaultNotificationPreference(parsed.eventType), ...pref };
        const muted = pref?.muteUntil && new Date(pref.muteUntil) > new Date();
        // Do Not Disturb holds email and push (in-app rows are kept) unless the notification is urgent.
        const dndRow = await tx.userPreference?.findUnique?.({ where: { userId_key: { userId, key: 'notifications.dnd' } }, select: { value: true } });
        const inDnd = Boolean(dndRow) && isInDnd(dndRow.value) && !passesDnd({ priority: parsed.priority, eventType: parsed.eventType });
        const allowedChannels = parsed.channels.filter((ch) => {
          if (muted) return false;
          if (inDnd && ch !== 'in_app') return false;
          if (ch === 'in_app') return effective.inAppEnabled !== false;
          if (ch === 'email') {
            return respectChannelDefaults ? effective.emailEnabled === true : pref?.emailEnabled !== false;
          }
          if (ch === 'web_push') {
            return respectChannelDefaults ? effective.pushEnabled === true : pref?.pushEnabled !== false;
          }
          return true;
        });

        // FCM (native Android push) always mirrors web_push: same preference,
        // same eligibility, no producer has to ask for it separately.
        if (allowedChannels.includes('web_push') && !allowedChannels.includes('fcm')) {
          allowedChannels.push('fcm');
        }

        if (!allowedChannels.length) continue;

        const notification = await tx.notification.create({
          data: {
            userId,
            companyId,
            kind: PRIORITY_KIND_MAP[parsed.priority] ?? "info",
            eventType: parsed.eventType,
            sourceType: parsed.sourceType ?? null,
            sourceId: parsed.sourceId ?? null,
            sourceActivityId: parsed.sourceActivityId ?? null,
            priority: parsed.priority ?? "medium",
            title: parsed.title,
            body: parsed.body ?? null,
            link: parsed.link ?? null,
            metadata: actorId || parsed.metadata
              ? { ...(parsed.metadata ?? {}), ...(actorId ? { actorId: String(actorId) } : {}) }
              : null,
            dedupeKey,
            expiresAt: parsed.expiresAt ?? null,
          },
        });

        if (allowedChannels.length > 0) {
          await tx.notificationDelivery.createMany({
            data: allowedChannels.map((channel) => ({
              notificationId: notification.id,
              channel,
              status: channel === 'in_app' ? 'sent' : 'queued',
              sentAt: channel === 'in_app' ? new Date() : null,
              attempts: 0,
            })),
            skipDuplicates: true,
          });
        }

        if (allowedChannels.includes('in_app')) {
          inAppRecipientIds.push(userId);
          identities.set(userId, { id: notification.id, count: notification.metadata?.count ?? 1 });
        }

        created.push(notification);
      }

      return { created, updated, deduped, inAppRecipientIds, identities };
    });

    const publishResult = {
      created: result.created.length,
      updated: result.updated.length,
      deduped: result.deduped,
      data: result.created.map(toNotificationView),
      actorId,
    };

    if (broadcaster && result.inAppRecipientIds.length > 0) {
      // The rows are committed. Announcing them is best effort and must not make
      // the producer's request wait for Realtime (a lost hint is repaired by the
      // client's reconcile). Errors are swallowed inside the promise chain.
      void broadcaster.broadcastToUsers(result.inAppRecipientIds, "notification.new", (userId) => ({
        notificationId: result.identities.get(userId)?.id ?? null,
        count: result.identities.get(userId)?.count ?? 1,
        companyId, sourceType: parsed.sourceType, sourceId: parsed.sourceId,
        eventType: parsed.eventType,
        title: parsed.title,
        body: parsed.body ?? null,
        priority: parsed.priority ?? "medium",
        link: parsed.link ?? null,
        // Lets the client collapse the realtime copy against the web-push copy
        // of the same alert (both compute `dk:<dedupeKey>`). Only stable when an
        // explicit dedupeKey was supplied (chat events do); otherwise the client
        // falls back to a content hash, which already matches across surfaces.
        dedupeKey: parsed.dedupeKey ?? null,
      })).catch(() => {});
    }

    return publishResult;
  }

  async function publishFromContext({ authUserId, companyId: activeCompanyId, input }) {
    const { profileId, companyId } = await resolveCompanyContext(authUserId, activeCompanyId);
    return publish({ companyId, actorId: profileId, input });
  }

  async function listPreferences({ authUserId, companyId: activeCompanyId }) {
    const { profileId } = await resolveCompanyContext(authUserId, activeCompanyId);
    const rows = await prisma.notificationPreference.findMany({
      where: { userId: profileId },
      orderBy: [{ eventType: "asc" }],
    });
    return { data: rows };
  }

  async function upsertPreference({ authUserId, companyId: activeCompanyId, input }) {
    const parsed = notificationPreferenceUpsertSchema.parse(input ?? {});
    const { profileId } = await resolveCompanyContext(authUserId, activeCompanyId);
    const row = await prisma.notificationPreference.upsert({
      where: {
        userId_eventType: {
          userId: profileId,
          eventType: parsed.eventType,
        },
      },
      create: {
        userId: profileId,
        eventType: parsed.eventType,
        inAppEnabled: parsed.inAppEnabled,
        emailEnabled: parsed.emailEnabled,
        pushEnabled: parsed.pushEnabled,
        muteUntil: parsed.muteUntil ?? null,
      },
      update: {
        inAppEnabled: parsed.inAppEnabled,
        emailEnabled: parsed.emailEnabled,
        pushEnabled: parsed.pushEnabled,
        muteUntil: parsed.muteUntil ?? null,
      },
    });
    return { data: row };
  }

  async function subscribeWebPush({ authUserId, companyId: activeCompanyId, input, userAgent = null }) {
    const parsed = webPushSubscriptionSchema.parse(input ?? {});
    const { profileId, companyId } = await resolveCompanyContext(authUserId, activeCompanyId);
    const row = await prisma.pushSubscription.upsert({
      where: { endpoint: parsed.endpoint },
      create: {
        userId: profileId,
        companyId,
        endpoint: parsed.endpoint,
        p256dh: parsed.keys.p256dh,
        auth: parsed.keys.auth,
        deviceLabel: parsed.deviceLabel ?? null,
        userAgent,
        enabled: true,
        lastSeenAt: new Date(),
      },
      update: {
        userId: profileId,
        companyId,
        p256dh: parsed.keys.p256dh,
        auth: parsed.keys.auth,
        deviceLabel: parsed.deviceLabel ?? null,
        userAgent,
        enabled: true,
        lastSeenAt: new Date(),
      },
    });

    // A user-agent describes browser software, not a device or installation.
    // Keep distinct endpoints: identical phones and separately installed PWAs
    // must not disable one another. Expired endpoints are retired on delivery.

    return { data: row };
  }

  async function unsubscribeWebPush({ authUserId, companyId: activeCompanyId, id }) {
    const { profileId } = await resolveCompanyContext(authUserId, activeCompanyId);
    const sub = await prisma.pushSubscription.findFirst({
      where: { id, userId: profileId },
      select: { id: true },
    });
    if (!sub) {
      throw new NotificationServiceError(
        "Suscripcion push no encontrada.",
        404,
        "push_subscription_not_found",
      );
    }

    await prisma.pushSubscription.delete({ where: { id: sub.id } });
    return { data: { deleted: true } };
  }

  async function subscribeFcm({ authUserId, companyId: activeCompanyId, input }) {
    const parsed = fcmSubscriptionSchema.parse(input ?? {});
    const { profileId, companyId } = await resolveCompanyContext(authUserId, activeCompanyId);
    const row = await prisma.fcmDeviceToken.upsert({
      where: { token: parsed.token },
      create: {
        userId: profileId,
        companyId,
        token: parsed.token,
        deviceLabel: parsed.deviceLabel ?? null,
        enabled: true,
        lastSeenAt: new Date(),
      },
      update: {
        userId: profileId,
        companyId,
        deviceLabel: parsed.deviceLabel ?? null,
        enabled: true,
        lastSeenAt: new Date(),
      },
    });
    return { data: row };
  }

  async function unsubscribeFcm({ authUserId, companyId: activeCompanyId, id }) {
    const { profileId } = await resolveCompanyContext(authUserId, activeCompanyId);
    const sub = await prisma.fcmDeviceToken.findFirst({
      where: { id, userId: profileId },
      select: { id: true },
    });
    if (!sub) {
      throw new NotificationServiceError(
        "Token FCM no encontrado.",
        404,
        "fcm_token_not_found",
      );
    }
    await prisma.fcmDeviceToken.delete({ where: { id: sub.id } });
    return { data: { deleted: true } };
  }

  return {
    resolveCompanyContext,
    list,
    summary,
    markRead,
    markAllRead,
    markReadBySource,
    publish,
    publishFromContext,
    listPreferences,
    upsertPreference,
    subscribeWebPush,
    unsubscribeWebPush,
    subscribeFcm,
    unsubscribeFcm,
    getPushDiagnostics,
  };
}
