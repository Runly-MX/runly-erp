// Queue of Builder automation continuations (table automation_job): a wait
// step stores the rest of the run here and the worker resumes it when run_at
// passes. Spec docs/superpowers/specs/2026-10-24-automation-studio-v2-stage-b-time-design.md.

export const MAX_JOB_ATTEMPTS = 8;
export const MAX_PAYLOAD_BYTES = 64 * 1024;
const MIN_DELAY_MS = 30_000;
const MAX_DELAY_MS = 31 * 86_400_000;
const STUCK_RUNNING_MS = 10 * 60_000;
// Same curve as the domain event dispatcher: 1, 2, 4... minutes, capped at 1 hour.
const backoffMs = (attempts) => Math.min(2 ** Math.max(0, attempts - 1), 60) * 60 * 1000;

export class AutomationJobError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "AutomationJobError";
    this.status = status;
  }
}

export function createAutomationJobsService({ prisma, now = () => new Date() }) {
  // Queues the continuation of a run. The dedupe key makes a retried request or
  // event a no-op instead of a second continuation.
  async function enqueue({ companyId, moduleKey, job }) {
    if (!companyId || !moduleKey || !job?.automationKey) throw new AutomationJobError("Trabajo de automatización inválido.");
    const runAt = new Date(job.runAt);
    const delay = runAt.getTime() - now().getTime();
    if (Number.isNaN(runAt.getTime()) || delay < -MIN_DELAY_MS || delay > MAX_DELAY_MS) throw new AutomationJobError("La espera debe ser de 1 minuto a 30 días.");
    const payload = job.payload ?? {};
    if (Buffer.byteLength(JSON.stringify(payload)) > MAX_PAYLOAD_BYTES) throw new AutomationJobError("Los datos del registro son demasiado grandes para una espera.", 413);
    try {
      return await prisma.automationJob.create({
        data: {
          companyId, moduleKey, automationKey: String(job.automationKey).slice(0, 80),
          runId: job.runId ?? null, fromStep: Number(job.fromStep) || 0, payload, runAt,
          dedupeKey: job.dedupe ? String(job.dedupe).slice(0, 300) : null,
        },
      });
    } catch (error) {
      if (error?.code === "P2002") return null; // same continuation already queued
      throw error;
    }
  }

  // Atomically takes due jobs (and jobs left "running" by a crashed worker).
  async function claimDue(limit = 20) {
    const stuckBefore = new Date(now().getTime() - STUCK_RUNNING_MS);
    const rows = await prisma.$queryRaw`
      UPDATE automation_job SET status = 'running', attempts = attempts + 1, updated_at = now()
      WHERE id IN (
        SELECT id FROM automation_job
        WHERE (status = 'pending' AND run_at <= ${now()}) OR (status = 'running' AND updated_at < ${stuckBefore})
        ORDER BY run_at ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED
      )
      RETURNING id, company_id, module_key, automation_key, run_id, from_step, payload, attempts, run_at`;
    return rows.map((row) => ({
      id: row.id, companyId: row.company_id, moduleKey: row.module_key, automationKey: row.automation_key,
      runId: row.run_id, fromStep: row.from_step, payload: row.payload, attempts: row.attempts, runAt: row.run_at,
    }));
  }

  const complete = (id) => prisma.automationJob.update({ where: { id }, data: { status: "done", lastError: null } });

  // Back to pending with the dispatcher's backoff; "failed" after MAX_JOB_ATTEMPTS.
  async function fail(job, error, { permanent = false } = {}) {
    const final = permanent || job.attempts >= MAX_JOB_ATTEMPTS;
    await prisma.automationJob.update({
      where: { id: job.id },
      data: final
        ? { status: "failed", lastError: String(error).slice(0, 1000) }
        : { status: "pending", lastError: String(error).slice(0, 1000), runAt: new Date(now().getTime() + backoffMs(job.attempts)) },
    });
    return final;
  }

  async function listPending({ companyId, moduleKey }) {
    return prisma.automationJob.findMany({
      where: { companyId, moduleKey, status: { in: ["pending", "awaiting_approval"] } },
      orderBy: { runAt: "asc" },
      take: 100,
      select: { id: true, automationKey: true, runId: true, fromStep: true, runAt: true, status: true },
    });
  }

  // Cancels a pending wait; the caller closes the run row.
  async function cancel({ companyId, moduleKey, id }) {
    const job = await prisma.automationJob.findFirst({ where: { id, companyId, moduleKey } });
    if (!job) throw new AutomationJobError("Espera no encontrada.", 404);
    if (job.status !== "pending") throw new AutomationJobError("Solo se puede cancelar una espera pendiente.", 409);
    await prisma.automationJob.update({ where: { id }, data: { status: "cancelled" } });
    return job;
  }

  async function purgeFinished(days = 90) {
    const cutoff = new Date(now().getTime() - days * 86_400_000);
    const result = await prisma.automationJob.deleteMany({ where: { status: { in: ["done", "failed", "cancelled"] }, updatedAt: { lt: cutoff } } });
    return result.count;
  }

  return { enqueue, claimDue, complete, fail, listPending, cancel, purgeFinished };
}
