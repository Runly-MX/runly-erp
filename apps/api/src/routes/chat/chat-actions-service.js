// apps/api/src/routes/chat/chat-actions-service.js
//
// Buttons on chat messages (interactive messages). Today: Aprobar / Rechazar of an automation
// approval. The platform decides what a button does from the stored action, never from the
// client; the approval service checks that the person is one of the approvers. Spec
// docs/superpowers/specs/2026-10-26-interactive-messages-design.md.
import { ChatServiceError } from "./chat-service-error.js";
import { AutomationApprovalError } from "../../services/automation-approvals-service.js";

export function createChatActionsService({ prisma, approvalsService, broadcaster = null, now = () => new Date() }) {
  async function loadReadable({ companyId, profileId, messageId }) {
    const [row] = await prisma.$queryRaw`
      SELECT m.id, m.conversation_id, m.metadata
      FROM chat_messages m
      JOIN chat_conversations c ON c.id = m.conversation_id AND c.company_id = ${companyId}::uuid AND c.deleted_at IS NULL
      JOIN chat_conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ${profileId}::uuid AND cm.left_at IS NULL
      WHERE m.id = ${messageId}::uuid AND m.deleted_at IS NULL AND public.runly_chat_user_access(m.conversation_id, ${profileId}::uuid)
    `;
    if (!row) throw new ChatServiceError("Mensaje no encontrado.", 404);
    return row;
  }

  async function perform({ companyId, profileId, messageId, actionId }) {
    const message = await loadReadable({ companyId, profileId, messageId });
    const metadata = message.metadata ?? {};
    const action = (metadata.actions ?? []).find((item) => item.id === actionId);
    if (!action) throw new ChatServiceError("Acción no encontrada.", 404);
    if (metadata.resolution) throw new ChatServiceError("Esta solicitud ya fue resuelta.", 409);
    if (action.kind !== "approval") throw new ChatServiceError("Este botón no ejecuta acciones.", 400);
    try {
      await approvalsService.decide({ companyId, profileId, id: action.approvalId, decision: action.decision });
    } catch (error) {
      if (error instanceof AutomationApprovalError) throw new ChatServiceError(error.message, error.status);
      throw error;
    }
    const [person] = await prisma.$queryRaw`SELECT display_name FROM user_profile WHERE id = ${profileId}::uuid`;
    const resolution = { actionId, label: action.label, decision: action.decision, byName: person?.display_name ?? "Alguien", at: now().toISOString() };
    // Every button of the message closes together.
    await prisma.$executeRaw`UPDATE chat_messages SET metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{resolution}', ${JSON.stringify(resolution)}::jsonb) WHERE id = ${messageId}::uuid`;
    const members = await prisma.$queryRaw`SELECT user_id FROM chat_conversation_members WHERE conversation_id = ${message.conversation_id}::uuid AND left_at IS NULL AND user_id IS NOT NULL`;
    await broadcaster?.broadcastToUsers?.(members.map((row) => row.user_id.toString()), "chat.message.reaction", { conversationId: message.conversation_id.toString(), messageId });
    return { resolution };
  }

  return { perform };
}
