// Approval step of Builder automations (stage C, C3): parks the continuation of
// a run until one of the chosen people approves or rejects, or 7 days pass.
// Spec docs/superpowers/specs/2026-10-25-automation-studio-v2-stage-c-reach-design.md.
import { createAutomationRunsService } from "./automation-runs-service.js";

export const APPROVAL_TTL_MS = 7 * 86_400_000;
export const AWAITING = "awaiting_approval";

export class AutomationApprovalError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "AutomationApprovalError";
    this.status = status;
  }
}

export function createAutomationApprovalsService({ prisma, notifications = null, chat = null, now = () => new Date() }) {
  const runs = createAutomationRunsService({ prisma });

  // Parks the continuation and tells the approvers. Idempotent on `dedupe`.
  async function create({ companyId, moduleKey, request }) {
    const approvers = [...new Set((request?.approvers ?? []).map(String))];
    if (!companyId || !moduleKey || !request?.automationKey || approvers.length < 1 || approvers.length > 5) throw new AutomationApprovalError("Solicitud de aprobación inválida.");
    if (request.dedupe && (await prisma.automationJob.findFirst({ where: { dedupeKey: request.dedupe }, select: { id: true } }))) return null;
    const members = await prisma.membership.findMany({ where: { companyId, enabled: true, userId: { in: approvers } }, select: { userId: true } });
    const valid = members.map((row) => row.userId);
    if (!valid.length) throw new AutomationApprovalError("Ninguna de las personas elegidas pertenece a esta empresa.", 422);
    const expiresAt = new Date(now().getTime() + APPROVAL_TTL_MS);
    const approval = await prisma.$transaction(async (tx) => {
      const job = await tx.automationJob.create({
        data: {
          companyId, moduleKey, automationKey: String(request.automationKey).slice(0, 80), runId: request.runId ?? null,
          fromStep: Number(request.fromStep) || 0, payload: request.payload ?? {}, runAt: expiresAt, status: AWAITING,
          dedupeKey: request.dedupe ? String(request.dedupe).slice(0, 300) : null,
        },
      });
      return tx.automationApproval.create({
        data: {
          companyId, moduleKey, automationKey: job.automationKey, runId: job.runId, jobId: job.id, approverIds: valid,
          message: String(request.message ?? "").slice(0, 200), expiresAt,
        },
      });
    });
    try {
      await notifications?.publish({
        companyId,
        actorId: null,
        input: {
          eventType: `module.${moduleKey}.approval`,
          title: "Aprobación pendiente",
          body: approval.message,
          link: "/app",
          priority: "high",
          recipients: { userIds: valid },
          sourceType: moduleKey,
          sourceId: approval.id,
        },
      });
    } catch (error) {
      console.error("[automation-approvals] no se pudo notificar:", error?.message ?? error);
    }
    // Optional: the same request as a card with buttons in a chat channel (best effort).
    if (request.channel && chat?.postApproval) {
      try {
        await chat.postApproval({ companyId, channel: String(request.channel), approvalId: approval.id, message: approval.message });
      } catch (error) {
        console.error("[automation-approvals] no se pudo publicar en el canal:", error?.message ?? error);
      }
    }
    return approval;
  }

  async function listMine({ companyId, profileId }) {
    const rows = await prisma.automationApproval.findMany({
      where: { companyId, status: "pending", approverIds: { has: profileId }, expiresAt: { gt: now() } },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id, moduleKey: row.moduleKey, automationKey: row.automationKey, message: row.message,
      createdAt: row.createdAt, expiresAt: row.expiresAt,
    }));
  }

  // One approver decides once. Approve resumes the run; reject ends it.
  async function decide({ companyId, profileId, id, decision, comment = null }) {
    if (!["approve", "reject"].includes(decision)) throw new AutomationApprovalError("Decisión inválida.");
    const approval = await prisma.automationApproval.findFirst({ where: { id, companyId } });
    if (!approval || !approval.approverIds.includes(profileId)) throw new AutomationApprovalError("Aprobación no encontrada.", 404);
    if (approval.status !== "pending") throw new AutomationApprovalError("Esta aprobación ya fue resuelta.", 409);
    if (approval.expiresAt <= now()) throw new AutomationApprovalError("Esta aprobación expiró.", 410);
    const text = comment ? String(comment).slice(0, 500) : null;
    const status = decision === "approve" ? "approved" : "rejected";
    const claimed = await prisma.automationApproval.updateMany({
      where: { id, status: "pending" },
      data: { status, decidedById: profileId, decidedAt: now(), comment: text },
    });
    if (!claimed.count) throw new AutomationApprovalError("Esta aprobación ya fue resuelta.", 409);
    if (decision === "approve") {
      await prisma.automationJob.update({ where: { id: approval.jobId }, data: { status: "pending", runAt: now() } });
    } else {
      await prisma.automationJob.update({ where: { id: approval.jobId }, data: { status: "cancelled" } });
      if (approval.runId) {
        await prisma.automationRun.updateMany({
          where: { id: approval.runId, companyId },
          data: { status: "rejected", error: text ? `Rechazada: ${text}` : "Rechazada." },
        });
      }
    }
    await prisma.auditLog.create({
      data: {
        companyId, actorId: profileId, moduleKey: approval.moduleKey, entityType: "AutomationApproval", entityId: approval.id,
        action: "automation.approval.decided", after: { decision, comment: text, automation: approval.automationKey },
      },
    });
    return { id, status };
  }

  // Worker: approvals nobody answered in time end the run as cancelled.
  async function expireOverdue() {
    const due = await prisma.automationApproval.findMany({ where: { status: "pending", expiresAt: { lte: now() } }, take: 50 });
    let expired = 0;
    for (const approval of due) {
      const claimed = await prisma.automationApproval.updateMany({ where: { id: approval.id, status: "pending" }, data: { status: "expired", decidedAt: now() } });
      if (!claimed.count) continue;
      await prisma.automationJob.update({ where: { id: approval.jobId }, data: { status: "cancelled", lastError: "La aprobación expiró." } });
      await runs.markCancelled({ companyId: approval.companyId, moduleKey: approval.moduleKey, runId: approval.runId });
      expired += 1;
    }
    return expired;
  }

  return { create, listMine, decide, expireOverdue };
}
