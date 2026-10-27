// Run log of Builder automations (table automation_run). Rows are written by
// the generated module runtime; this service binds them to the module and
// company, lists them for the Builder "Historial" and purges old ones.
// Spec docs/superpowers/specs/2026-10-24-automation-studio-v2-design.md.

import { publishDomainEvent } from "./domain-events/events.js";

export const AUTOMATION_RUN_RETENTION_DAYS = 90
// How many automations can start one another through "terminó una automatización".
export const MAX_CHAIN_DEPTH = 3;
const FINAL = ["success", "partial", "failed", "rejected"];
const STATUSES = ["success", "partial", "failed", "running", "waiting", "cancelled", "rejected"];
const TRIGGER_KINDS = ["event", "delayed", "schedule", "webhook", "test"];
const MAX_STEPS_JSON = 20;

export function createAutomationRunsService({ prisma }) {
  // A finished run is itself an event, so automations can be chained (spec
  // 2026-10-27 §2). Runs started by this event carry its depth in their input; test
  // runs never publish.
  async function announce({ companyId, moduleKey, entry, input }) {
    if (!FINAL.includes(entry.status) || entry.triggerKind === "test") return;
    const fromChain = input && typeof input === "object" && typeof input.depth === "number" && "automationKey" in input;
    const depth = fromChain ? input.depth + 1 : 0;
    if (depth > MAX_CHAIN_DEPTH) return;
    await publishDomainEvent(prisma, {
      companyId,
      event: "automations.run.finished",
      payload: { automationKey: String(entry.automationKey).slice(0, 80), moduleKey, status: entry.status, error: entry.error ? String(entry.error).slice(0, 300) : null, durationMs: Math.max(0, Number(entry.durationMs) || 0), depth },
    });
  }

  // Never throws: a log failure must not affect the user's save.
  async function log({ companyId, moduleKey, entry }) {
    if (!companyId || !moduleKey || !entry?.automationKey) return null;
    try {
      const row = await save({ companyId, moduleKey, entry });
      if (row) await announce({ companyId, moduleKey, entry, input: row.input ?? entry.input });
      return row;
    } catch (error) {
      console.error("[automation-runs] no se pudo registrar:", error?.message ?? error);
      return null;
    }
  }

  async function save({ companyId, moduleKey, entry }) {
    try {
      if (entry.runId) return await finish({ companyId, moduleKey, entry });
      return await prisma.automationRun.create({
        data: {
          companyId,
          moduleKey,
          automationKey: String(entry.automationKey).slice(0, 80),
          triggerKind: TRIGGER_KINDS.includes(entry.triggerKind) ? entry.triggerKind : "record",
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

  const view = (row) => ({
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
  });

  const TRIGGERS = ["record", "event", "schedule", "webhook", "delayed"];
  function filters({ companyId, moduleKey, automation = null, status = null, trigger = null, from = null, to = null }) {
    const day = (value, end) => {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")) ? new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}`) : null;
      return date && !Number.isNaN(date.getTime()) ? date : null;
    };
    const start = day(from, false);
    const finish = day(to, true);
    return {
      companyId,
      moduleKey,
      ...(automation ? { automationKey: String(automation) } : {}),
      ...(STATUSES.includes(status) ? { status } : {}),
      ...(TRIGGERS.includes(trigger) ? { triggerKind: trigger } : {}),
      ...(start || finish ? { createdAt: { ...(start ? { gte: start } : {}), ...(finish ? { lte: finish } : {}) } } : {}),
    };
  }

  async function list({ limit = 50, ...query }) {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const rows = await prisma.automationRun.findMany({ where: filters(query), orderBy: { createdAt: "desc" }, take });
    return rows.map(view);
  }

  // Keyset pagination (newest first): `cursor` is "<createdAt ISO>|<id>" of the last row seen.
  async function page({ limit = 25, cursor = null, ...query }) {
    const take = Math.min(Math.max(Number(limit) || 25, 1), 100);
    const where = filters(query);
    const [at, id] = String(cursor ?? "").split("|");
    const after = at && id && !Number.isNaN(new Date(at).getTime())
      ? { OR: [{ createdAt: { lt: new Date(at) } }, { createdAt: new Date(at), id: { lt: id } }] }
      : null;
    const [rows, total] = await Promise.all([
      prisma.automationRun.findMany({ where: after ? { AND: [where, after] } : where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: take + 1 }),
      cursor ? Promise.resolve(null) : prisma.automationRun.count({ where }),
    ]);
    const more = rows.length > take;
    const items = rows.slice(0, take);
    const last = items[items.length - 1];
    return { items: items.map(view), total, nextCursor: more && last ? `${last.createdAt.toISOString()}|${last.id}` : null };
  }

  // Up to `max` rows for a file (CSV or Excel), newest first.
  async function exportRows({ max = 5000, ...query }) {
    const rows = await prisma.automationRun.findMany({ where: filters(query), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: max });
    return rows.map(view);
  }

  async function purgeOlderThan(days = AUTOMATION_RUN_RETENTION_DAYS, now = new Date()) {
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    const result = await prisma.automationRun.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return result.count;
  }

  return { log, list, page, exportRows, markCancelled, purgeOlderThan };
}
