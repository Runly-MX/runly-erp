// apps/api/src/routes/chat/chat-actions-service.js
//
// Buttons on chat messages (interactive messages). Today: Aprobar / Rechazar of an automation
// approval. The platform decides what a button does from the stored action, never from the
// client; the approval service checks that the person is one of the approvers. Spec
// docs/superpowers/specs/2026-10-26-interactive-messages-design.md.
import { ChatServiceError } from "./chat-service-error.js";
import { AutomationApprovalError } from "../../services/automation-approvals-service.js";

export function createChatActionsService({ prisma, approvalsService, purchasesService = null, accessService = null, httpService = null, broadcaster = null, now = () => new Date() }) {
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
    if (!["approval", "callback", "purchase_approval"].includes(action.kind)) throw new ChatServiceError("Este botón no ejecuta acciones.", 400);
    const [person] = await prisma.$queryRaw`SELECT display_name FROM user_profile WHERE id = ${profileId}::uuid`;
    const byName = person?.display_name ?? "Alguien";
    if (action.kind === "purchase_approval") {
      // Same permission and rules as the purchases screen; a card decided elsewhere just closes.
      if (!purchasesService || !accessService) throw new ChatServiceError("Compras no está disponible.", 409);
      try { await accessService.assertCompanyMember(companyId, profileId, "purchases.approval.decide"); } catch { throw new ChatServiceError("No tienes permiso para aprobar compras.", 403); }
      const current = await prisma.purchaseApproval.findFirst({ where: { id: action.purchaseApprovalId, companyId }, select: { status: true } });
      if (!current) throw new ChatServiceError("La aprobación ya no existe.", 404);
      if (current.status === "PENDING") {
        try {
          await purchasesService.decideApproval(companyId, profileId, action.purchaseApprovalId, { decision: action.decision });
        } catch (error) {
          throw new ChatServiceError(error?.message ?? "No se pudo decidir la aprobación.", Number.isInteger(error?.status) ? error.status : 400);
        }
      }
    } else if (action.kind === "approval") {
      try {
        await approvalsService.decide({ companyId, profileId, id: action.approvalId, decision: action.decision });
      } catch (error) {
        if (error instanceof AutomationApprovalError) throw new ChatServiceError(error.message, error.status);
        throw error;
      }
    } else {
      // The integration that posted the message receives the choice on its own reply address.
      const [integration] = metadata.integration?.id
        ? await prisma.$queryRaw`SELECT name, callback_url FROM chat_integrations WHERE id = ${metadata.integration.id}::uuid AND enabled = TRUE`
        : [];
      if (!integration?.callback_url || !httpService) throw new ChatServiceError("Esta integración ya no recibe respuestas de botones.", 409);
      try {
        await httpService.send({
          companyId, moduleKey: "runly.chat",
          request: {
            url: integration.callback_url, method: "POST", automationKey: `chat:${integration.name}`, idempotencyKey: `${messageId}:${actionId}`,
            body: { event: "button", messageId, conversationId: String(message.conversation_id), actionId, label: action.label, value: action.value, user: { id: profileId, name: byName } },
          },
        });
      } catch (error) {
        throw new ChatServiceError(`No se pudo avisar a la integración: ${error?.message ?? "error"}`, error?.status === 403 ? 403 : 502);
      }
    }
    const resolution = { actionId, label: action.label, decision: action.kind === "callback" ? "choice" : action.kind === "purchase_approval" ? (action.decision === "APPROVED" ? "approve" : "reject") : action.decision, byName, at: now().toISOString() };
    // Every button of the message closes together.
    await prisma.$executeRaw`UPDATE chat_messages SET metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{resolution}', ${JSON.stringify(resolution)}::jsonb) WHERE id = ${messageId}::uuid`;
    const members = await prisma.$queryRaw`SELECT user_id FROM chat_conversation_members WHERE conversation_id = ${message.conversation_id}::uuid AND left_at IS NULL AND user_id IS NOT NULL`;
    await broadcaster?.broadcastToUsers?.(members.map((row) => row.user_id.toString()), "chat.message.reaction", { conversationId: message.conversation_id.toString(), messageId });
    return { resolution };
  }

  return { perform };
}
