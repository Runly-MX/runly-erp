// Run log of Builder automations (table automation_run). Rows are written by
// the generated module runtime; this service binds them to the module and
// company, lists them for the Builder "Historial" and purges old ones.
// Spec docs/superpowers/specs/2026-10-24-automation-studio-v2-design.md.

export const AUTOMATION_RUN_RETENTION_DAYS = 90
const STATUSES = ["success", "partial", "failed", "running", "waiting", "cancelled", "rejected"];
const MAX_STEPS_JSON = 20;

export function createAutomationRunsService({ prisma }) {
  // Never throws: a log failure must not affect the user's save.
  async function log({ companyId, moduleKey, entry }) {
    if (!companyId || !moduleKey || !entry?.automationKey) return null;
    try {
      if (entry.runId) return await finish({ companyId, moduleKey, entry });
      return await prisma.automationRun.create({
        data: {
          companyId,
          moduleKey,
          automationKey: String(entry.automationKey).slice(0, 80),
          triggerKind: ["event", "delayed", "schedule", "webhook"].includes(entry.triggerKind) ? entry.triggerKind : "record",
          triggerRef: entry.triggerRef ? String(entry.triggerRef).slice(0, 80) : null,
          status: STATUSES.includes(entry.status) ? entry.status : "failed",
          steps: Array.isArray(entry.steps) ? entry.steps.slice(0, MAX_STEPS_JSON) : [],
          input: entry.input && typeof entry.input === "object" ? entry.input : undefined,
          error: entry.error ? String(entry.error).slice(0, 1000) : null,
          durationMs: Math.max(0, Math.min(Number(entry.durationMs) || 0, 2_147_000_000)),
        },
      });
    } catch (error) {
      console.error("[automation-runs] no se pudo registrar:", error?.message ?? error);
      return null;
    }
  }

  // A continuation after a wait updates the run it belongs to: its steps replace
  // the ones from the same index on, earlier steps are kept.
  async function finish({ companyId, moduleKey, entry }) {
    const run = await prisma.automationRun.findFirst({ where: { id: entry.runId, companyId, moduleKey } });
    if (!run) return null;
    const fresh = Array.isArray(entry.steps) ? entry.steps.slice(0, 20) : [];
    const from = fresh.length ? Math.min(...fresh.map((step) => Number(step.index) || 0)) : Infinity;
    const kept = (Array.isArray(run.steps) ? run.steps : []).filter((step) => (Number(step.index) || 0) < from);
    return prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: STATUSES.includes(entry.status) ? entry.status : "failed",
        steps: [...kept, ...fresh],
        error: entry.error ? String(entry.error).slice(0, 1000) : null,
        durationMs: Math.max(0, Math.min(run.durationMs + (Number(entry.durationMs) || 0), 2_147_000_000)),
      },
    });
  }

  async function markCancelled({ companyId, moduleKey, runId }) {
    if (!runId) return;
    await prisma.automationRun.updateMany({ where: { id: runId, companyId, moduleKey, status: "waiting" }, data: { status: "cancelled" } });
  }

  async function list({ companyId, moduleKey, automation = null, status = null, limit = 50 }) {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const rows = await prisma.automationRun.findMany({
      where: {
        companyId,
        moduleKey,
        ...(automation ? { automationKey: String(automation) } : {}),
        ...(STATUSES.includes(status) ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    });
    return rows.map((row) => ({
      id: row.id,
      automationKey: row.automationKey,
      triggerKind: row.triggerKind,
      triggerRef: row.triggerRef,
      status: row.status,
      steps: row.steps,
      input: row.input ?? null,
      error: row.error,
      durationMs: row.durationMs,
      createdAt: row.createdAt,
    }));
  }

  async function purgeOlderThan(days = AUTOMATION_RUN_RETENTION_DAYS, now = new Date()) {
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    const result = await prisma.automationRun.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return result.count;
  }

  return { log, list, markCancelled, purgeOlderThan };
}
