// Worker side of Builder automations (stage B): resumes automations after a
// wait (automation_job) and fires schedule triggers (automation_schedule).
// Both import the module's generated api/automations.js, the same way the
// domain event dispatcher imports api/events.js, and run with the system
// services of the module (no user behind them).
// Spec docs/superpowers/specs/2026-10-24-automation-studio-v2-stage-b-time-design.md.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createAutomationJobsService } from "./automation-jobs-service.js";
import { createAutomationRunsService } from "./automation-runs-service.js";
import { nextOccurrence } from "./automation-schedule-math.js";

const DEFAULT_TIME_ZONE = "America/Mexico_City";
const JOB_BATCH = 20;
const SCHEDULE_BATCH = 20;
// A job whose module or company is off waits this long before it is given up.
const DISABLED_GRACE_MS = 24 * 3_600_000;

export function createAutomationWorker({ prisma, resolveModulesDir, moduleServices = null, importRuntime = null, now = () => new Date() }) {
  const jobs = createAutomationJobsService({ prisma, now });
  const runs = createAutomationRunsService({ prisma });
  const runtimeCache = new Map();

  async function defaultImport(moduleKey) {
    const dir = await resolveModulesDir();
    const file = path.join(dir, moduleKey, "api", "automations.js");
    const stat = await fs.stat(file).catch(() => null);
    if (!stat) return null;
    const cacheKey = `${file}:${stat.mtimeMs}`;
    if (!runtimeCache.has(cacheKey)) runtimeCache.set(cacheKey, await import(`${pathToFileURL(file).href}?v=${stat.mtimeMs}`));
    return runtimeCache.get(cacheKey);
  }
  const loadRuntime = importRuntime ?? defaultImport;

  async function timeZone() {
    const row = await prisma.instanceConfig.findUnique({ where: { key: "instance_time_zone" }, select: { value: true } }).catch(() => null);
    return row?.value || DEFAULT_TIME_ZONE;
  }

  async function moduleState(moduleKey, companyId) {
    const mod = await prisma.runlyModule.findFirst({ where: { key: moduleKey, status: "INSTALLED", enabled: true }, select: { id: true } });
    if (!mod) return false;
    const off = await prisma.companyModule.findFirst({ where: { companyId, moduleId: mod.id, enabled: false }, select: { id: true } });
    return !off;
  }

  function bind(moduleKey, companyId) {
    return {
      services: moduleServices ? moduleServices.forSystem(moduleKey, companyId) : null,
      log: (entry) => runs.log({ companyId, moduleKey, entry }),
      enqueue: (job) => jobs.enqueue({ companyId, moduleKey, job }),
    };
  }

  async function runJob(job) {
    if (!(await moduleState(job.moduleKey, job.companyId))) {
      const waited = now().getTime() - new Date(job.runAt).getTime();
      await jobs.fail(job, "El módulo o la empresa están desactivados.", { permanent: waited > DISABLED_GRACE_MS });
      return "skipped";
    }
    const runtime = await loadRuntime(job.moduleKey);
    if (typeof runtime?.resume !== "function") {
      await jobs.fail(job, "Vuelve a publicar el módulo para que sus esperas funcionen.", { permanent: true });
      return "failed";
    }
    try {
      await runtime.resume({ job, ...bind(job.moduleKey, job.companyId) });
      await jobs.complete(job.id);
      return "done";
    } catch (error) {
      const final = await jobs.fail(job, error?.message ?? error);
      return final ? "failed" : "retry";
    }
  }

  async function processJobs() {
    const claimed = await jobs.claimDue(JOB_BATCH);
    const summary = { done: 0, retry: 0, failed: 0, skipped: 0 };
    for (const job of claimed) summary[await runJob(job)] += 1;
    return summary;
  }

  // Creates the schedule rows of every installed module's manifest.schedules for
  // every company and removes the ones that no longer exist.
  async function syncSchedules() {
    const zone = await timeZone();
    const modules = await prisma.runlyModule.findMany({ where: { status: "INSTALLED", enabled: true }, select: { key: true, manifest: true } });
    const wanted = modules.flatMap((mod) => (Array.isArray(mod.manifest?.schedules) ? mod.manifest.schedules.map((schedule) => ({ moduleKey: mod.key, schedule })) : []));
    const existing = await prisma.automationSchedule.findMany({ select: { companyId: true, moduleKey: true, automationKey: true } });
    const known = new Set(existing.map((row) => `${row.companyId}|${row.moduleKey}|${row.automationKey}`));
    const companies = wanted.length ? await prisma.company.findMany({ select: { id: true } }) : [];
    const created = [];
    for (const { moduleKey, schedule } of wanted) {
      for (const company of companies) {
        if (known.has(`${company.id}|${moduleKey}|${schedule.key}`)) continue;
        created.push({ companyId: company.id, moduleKey, automationKey: schedule.key, nextRunAt: nextOccurrence(schedule, now(), zone) });
      }
    }
    if (created.length) await prisma.automationSchedule.createMany({ data: created, skipDuplicates: true });
    const live = new Set(wanted.map(({ moduleKey, schedule }) => `${moduleKey}|${schedule.key}`));
    const stale = existing.filter((row) => !live.has(`${row.moduleKey}|${row.automationKey}`));
    for (const row of stale) {
      await prisma.automationSchedule.deleteMany({ where: { companyId: row.companyId, moduleKey: row.moduleKey, automationKey: row.automationKey } });
    }
    return { created: created.length, removed: stale.length, modules };
  }

  // Fires due schedules. next_run_at moves forward BEFORE running, so a crash
  // or a slow module never fires the same occurrence twice, and downtime fires
  // only the latest missed occurrence.
  async function processSchedules() {
    const { modules } = await syncSchedules();
    const zone = await timeZone();
    const due = await prisma.automationSchedule.findMany({ where: { nextRunAt: { lte: now() } }, orderBy: { nextRunAt: "asc" }, take: SCHEDULE_BATCH });
    const summary = { fired: 0, failed: 0, skipped: 0 };
    for (const row of due) {
      const schedule = modules.find((mod) => mod.key === row.moduleKey)?.manifest?.schedules?.find((item) => item.key === row.automationKey);
      const occurrence = row.nextRunAt;
      const next = schedule ? nextOccurrence(schedule, now(), zone) : new Date(now().getTime() + 86_400_000);
      const claimed = await prisma.automationSchedule.updateMany({
        // "still due" instead of an exact timestamp match: the column has microseconds that JS dates lose.
        where: { companyId: row.companyId, moduleKey: row.moduleKey, automationKey: row.automationKey, nextRunAt: { lte: now() } },
        data: { nextRunAt: next, lastRunAt: now() },
      });
      if (!claimed.count || !schedule || !(await moduleState(row.moduleKey, row.companyId))) { summary.skipped += 1; continue; }
      try {
        const runtime = await loadRuntime(row.moduleKey);
        if (typeof runtime?.runScheduled !== "function") throw new Error("Vuelve a publicar el módulo para que sus horarios funcionen.");
        await runtime.runScheduled({ key: row.automationKey, companyId: row.companyId, occurrence: occurrence.toISOString(), prisma, ...bind(row.moduleKey, row.companyId) });
        summary.fired += 1;
        await prisma.automationSchedule.updateMany({ where: { companyId: row.companyId, moduleKey: row.moduleKey, automationKey: row.automationKey }, data: { lastError: null } });
      } catch (error) {
        summary.failed += 1;
        console.error(`[automation-worker] horario ${row.moduleKey}/${row.automationKey}:`, error?.message ?? error);
        await prisma.automationSchedule.updateMany({ where: { companyId: row.companyId, moduleKey: row.moduleKey, automationKey: row.automationKey }, data: { lastError: String(error?.message ?? error).slice(0, 1000) } });
      }
    }
    return summary;
  }

  return { processJobs, processSchedules, syncSchedules, jobs };
}
