// Run log of Builder automations (table automation_run). Rows are written by
// the generated module runtime; this service binds them to the module and
// company, lists them for the Builder "Historial" and purges old ones.
// Spec docs/superpowers/specs/2026-10-24-automation-studio-v2-design.md.

export const AUTOMATION_RUN_RETENTION_DAYS = 90
const STATUSES = ["success", "partial", "failed"];
const MAX_STEPS_JSON = 5;

export function createAutomationRunsService({ prisma }) {
  // Never throws: a log failure must not affect the user's save.
  async function log({ companyId, moduleKey, entry }) {
    if (!companyId || !moduleKey || !entry?.automationKey) return null;
    try {
      return await prisma.automationRun.create({
        data: {
          companyId,
          moduleKey,
          automationKey: String(entry.automationKey).slice(0, 80),
          triggerKind: entry.triggerKind === "event" ? "event" : "record",
          triggerRef: entry.triggerRef ? String(entry.triggerRef).slice(0, 80) : null,
          status: STATUSES.includes(entry.status) ? entry.status : "failed",
          steps: Array.isArray(entry.steps) ? entry.steps.slice(0, MAX_STEPS_JSON) : [],
          error: entry.error ? String(entry.error).slice(0, 1000) : null,
          durationMs: Math.max(0, Math.min(Number(entry.durationMs) || 0, 2_147_000_000)),
        },
      });
    } catch (error) {
      console.error("[automation-runs] no se pudo registrar:", error?.message ?? error);
      return null;
    }
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

  return { log, list, purgeOlderThan };
}
