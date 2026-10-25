// Purchase approvals as cards in a chat channel. A company picks the channel in the purchases
// settings; every pending approval then appears there with Aprobar / Rechazar (decided through
// the same procurement service and permission as the purchases screen), and the card closes
// when the approval is decided anywhere. Spec docs/superpowers/specs/2026-10-26-interactive-messages-design.md.
import { createChatIntegrationsService } from "../routes/chat/chat-integrations-service.js";
import { createRealtimeBroadcasterFromEnv } from "./realtime-broadcaster.js";

export const MODULE_KEY = "runly.purchases";
const WINDOW_DAYS = 7;
const OWNER_LABELS = { PURCHASE_REQUEST: "Solicitud de compra", PURCHASE_ORDER: "Orden de compra", PURCHASE_QUOTE: "Cotización", PURCHASE_INVOICE: "Factura de compra" };

export class PurchaseApprovalChatError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "PurchaseApprovalChatError";
    this.status = status;
  }
}

const money = (value, currency) => (value == null ? "" : `${Number(value).toLocaleString("es-MX", { maximumFractionDigits: 2 })} ${currency ?? ""}`.trim());

export function approvalText({ approval, purchaseCase }) {
  const label = OWNER_LABELS[approval.ownerType] ?? "Documento de compra";
  const lines = [`${label}${purchaseCase?.number ? ` ${purchaseCase.number}` : ""}${purchaseCase?.title ? `: ${purchaseCase.title}` : ""}`];
  const total = money(purchaseCase?.estimatedTotal, purchaseCase?.currency);
  if (total) lines.push(`Total estimado: ${total}`);
  if (approval.reason) lines.push(`Motivo: ${approval.reason}`);
  return lines.join("\n");
}

export function createPurchaseApprovalChatService({ prisma, chat = null, now = () => new Date() }) {
  const chatService = chat ?? createChatIntegrationsService({ prisma, broadcaster: createRealtimeBroadcasterFromEnv({ prisma }) });

  async function moduleRow() {
    return prisma.runlyModule.findFirst({ where: { key: MODULE_KEY }, select: { id: true } });
  }

  async function getChannel(companyId) {
    const mod = await moduleRow();
    if (!mod) return null;
    const row = await prisma.companyModule.findFirst({ where: { companyId, moduleId: mod.id }, select: { config: true } });
    return row?.config?.approvalChannel ?? null;
  }

  // null / empty turns it off; otherwise the channel must exist in the company.
  async function setChannel(companyId, channel) {
    const name = String(channel ?? "").trim().slice(0, 120);
    const mod = await moduleRow();
    if (!mod) throw new PurchaseApprovalChatError("Compras no está instalado.", 404);
    if (name) {
      try { await chatService.resolveChannel(companyId, name); } catch (error) { throw new PurchaseApprovalChatError(error?.message ?? "Canal no encontrado.", 400); }
    }
    // A company without its own row for the module uses the defaults: the row is created on first use.
    const row = (await prisma.companyModule.findFirst({ where: { companyId, moduleId: mod.id }, select: { id: true, enabled: true, config: true } }))
      ?? (await prisma.companyModule.create({ data: { companyId, moduleId: mod.id, enabled: true, config: {} }, select: { id: true, enabled: true, config: true } }));
    const config = { ...(row.config ?? {}) };
    if (name) config.approvalChannel = name; else delete config.approvalChannel;
    await prisma.companyModule.update({ where: { id: row.id }, data: { config } });
    return { channel: name || null };
  }

  async function companiesWithChannel() {
    const mod = await moduleRow();
    if (!mod) return [];
    const rows = await prisma.companyModule.findMany({ where: { moduleId: mod.id, enabled: true }, select: { companyId: true, config: true } });
    return rows.filter((row) => row.config?.approvalChannel).map((row) => ({ companyId: row.companyId, channel: row.config.approvalChannel }));
  }

  // Worker pass 1: pending approvals without a card get one.
  async function announcePending({ limit = 50 } = {}) {
    let posted = 0;
    const since = new Date(now().getTime() - WINDOW_DAYS * 86_400_000);
    for (const { companyId, channel } of await companiesWithChannel()) {
      const pending = await prisma.purchaseApproval.findMany({ where: { companyId, status: "PENDING", createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, take: limit });
      for (const approval of pending) {
        const [existing] = await prisma.$queryRaw`SELECT 1 FROM chat_messages WHERE metadata->'actions'->0->>'purchaseApprovalId' = ${approval.id} LIMIT 1`;
        if (existing) continue;
        const purchaseCase = await prisma.purchaseCase.findFirst({ where: { id: approval.caseId, companyId }, select: { number: true, title: true, estimatedTotal: true, currency: true } });
        try {
          await chatService.postFromService({ companyId, channel, source: { kind: "module", name: "Compras" }, input: { title: "Aprobación de compra pendiente", text: approvalText({ approval, purchaseCase }), purchaseApprovalId: approval.id } });
          posted += 1;
        } catch (error) {
          console.error("[purchases.approval-chat] no se pudo publicar:", error?.message ?? error);
        }
      }
    }
    return { posted };
  }

  // Worker pass 2: a card whose approval was decided somewhere else closes too.
  async function closeResolved({ limit = 100 } = {}) {
    const cards = await prisma.$queryRaw`
      SELECT id, conversation_id, metadata->'actions'->0->>'purchaseApprovalId' AS approval_id
      FROM chat_messages
      WHERE metadata->'actions'->0->>'purchaseApprovalId' IS NOT NULL AND NOT (metadata ? 'resolution') AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT ${limit}`;
    let closed = 0;
    for (const card of cards) {
      const approval = await prisma.purchaseApproval.findFirst({ where: { id: card.approval_id }, select: { status: true, decidedById: true, decidedAt: true } });
      if (!approval || approval.status === "PENDING") continue;
      const [person] = approval.decidedById ? await prisma.$queryRaw`SELECT display_name FROM user_profile WHERE id = ${approval.decidedById}::uuid` : [];
      const resolution = { actionId: "external", label: approval.status, decision: approval.status === "APPROVED" ? "approve" : "reject", byName: person?.display_name ?? "Compras", at: (approval.decidedAt ?? now()).toISOString() };
      await prisma.$executeRaw`UPDATE chat_messages SET metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{resolution}', ${JSON.stringify(resolution)}::jsonb) WHERE id = ${card.id}::uuid`;
      closed += 1;
    }
    return { closed };
  }

  return { getChannel, setChannel, announcePending, closeResolved };
}
