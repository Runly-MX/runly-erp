// Domain events of calls for automations: a recording was stored, a transcript is
// ready (spec docs/superpowers/specs/2026-10-31-automations-calls-chat-autoreply-design.md §A).
// Best effort: a failed publish never affects the call.
import { publishDomainEvent } from "../../services/domain-events/events.js";

export async function publishCallEvent(prisma, event, { id, callId, durationMs = null, language = null }) {
  try {
    const [row] = await prisma.$queryRaw`
      SELECT conv.company_id, conv.title, c.conversation_id, c.started_at,
        (SELECT count(*)::int FROM call_participant p WHERE p.call_id = c.id AND p.joined_at IS NOT NULL)
        + (SELECT count(*)::int FROM call_guest g WHERE g.call_id = c.id AND g.admitted_at IS NOT NULL) AS participants
      FROM call c JOIN chat_conversations conv ON conv.id = c.conversation_id
      WHERE c.id = ${callId}::uuid`;
    if (!row) return;
    await publishDomainEvent(prisma, {
      companyId: row.company_id,
      event,
      payload: {
        id, callId, conversationId: row.conversation_id, title: row.title ?? null,
        startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
        durationMs: durationMs ?? null, participants: row.participants ?? 0,
        ...(event === "calls.transcript.ready" ? { language: language ?? null } : {}),
      },
    });
  } catch (error) {
    console.warn("[runly.calls] no se pudo publicar", event, error?.message ?? error);
  }
}
