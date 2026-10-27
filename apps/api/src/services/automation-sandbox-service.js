// Sandbox of the automation editor ("Probar"): runs the REAL step engine
// (conditions, paths, templates, results between blocks) against the in-memory
// service simulator. Waits are skipped over, approvals count as approved and the
// HTTP call is only recorded, so nothing touches data, people or the network.
// The run is logged as a "test" run so it shows in the Consola. Spec
// docs/superpowers/specs/2026-10-27-automation-events-chaining-sandbox-design.md §3.
import { SERVICE_KEYS, clip, createServiceSimulator, matches, runEntry, runSteps } from "@runly/module-engine/contracts";
import { toRuntimeSteps } from "@runly/module-compiler";
import { createAutomationRunsService } from "./automation-runs-service.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAMPLE_RECORD = "00000000-0000-7000-8000-00000000a002";
const MAX_PASSES = 4;
const conditionsOf = (when) => (when === undefined || when === null ? [] : Array.isArray(when) ? when : [when]);

export function createAutomationSandboxService({ prisma }) {
  const runs = createAutomationRunsService({ prisma });

  // automation: a definition item (draft, not necessarily saved). data: the sample
  // record or event payload. previous: the record before an update ("Cambió").
  async function run({ companyId, moduleKey, automation, data = {}, previous = null, actorId = null }) {
    const startedAt = Date.now();
    const trigger = automation?.trigger ?? {};
    const conditions = conditionsOf(trigger.when).map((condition) => ({ condition, passes: matches(condition, data, previous) }));
    const passes = conditions.every((item) => item.passes);
    const key = String(automation?.key || "prueba").slice(0, 80);
    const input = clip(data, 4000);

    if (!passes) {
      const error = "No se cumplieron las condiciones de «Solo si»: la automatización no correría con estos datos.";
      const row = await runs.log({ companyId, moduleKey, entry: { automationKey: key, triggerKind: "test", status: "cancelled", steps: [], error, durationMs: Date.now() - startedAt, input } });
      return { runId: row?.id ?? null, status: "cancelled", passes, conditions, steps: [], error };
    }

    const sim = createServiceSimulator({ moduleKey, grants: [...SERVICE_KEYS], user: { id: actorId ?? SAMPLE_RECORD, permissions: [], isAdmin: true }, lenient: true });
    const services = trigger.type === "record" ? sim.forRequest() : sim.forSystem();
    const runtime = { ...automation, key, steps: toRuntimeSteps(automation) };
    const recordId = UUID.test(String(data?.id ?? "")) ? data.id : SAMPLE_RECORD;

    // A wait or approval ends one pass: the next one continues from the saved point.
    let from = 0;
    let scope = data;
    let next = null;
    const hooks = {
      enqueue: async (job) => { next = { from: job.fromStep, data: job.payload?.data ?? scope, note: "Espera simulada: la prueba sigue sin esperar." }; },
      approve: async (request) => { next = { from: request.fromStep, data: request.payload?.data ?? scope, note: "Aprobación simulada: se da por aprobada." }; },
      http: async () => ({ simulated: true }),
    };
    const merged = [];
    let error = null;
    let ok = true;
    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      next = null;
      const result = await runSteps({ automation: runtime, services, base: null, data: scope, recordId, actorId, from, ...hooks });
      const notes = next ? { index: result.steps.at(-1)?.index, note: next.note } : null;
      for (const step of result.steps) {
        const entry = notes && step.index === notes.index ? { ...step, simulated: true, note: notes.note } : step;
        const at = merged.findIndex((item) => item.index === step.index);
        if (at >= 0) merged[at] = entry; else merged.push(entry);
      }
      ok = ok && result.ok;
      error = result.error ?? error;
      if (!next || !result.ok) break;
      ({ from, data: scope } = next);
    }
    merged.sort((a, b) => a.index - b.index);
    const entry = runEntry(moduleKey, { key, ok, waiting: false, steps: merged, error }, { trigger: "test", ref: null, startedAt, input });
    const row = await runs.log({ companyId, moduleKey, entry });
    return { runId: row?.id ?? null, status: entry.status, passes, conditions, steps: merged, error: entry.error, notes: sim.diagnostics };
  }

  return { run };
}
