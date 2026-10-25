// Automations of a company that are not tied to a module (table
// system_automation): triggered by a system domain event or a schedule, run by
// the same step engine as Builder automations. Spec
// docs/superpowers/specs/2026-10-25-system-automations-design.md.
import { automationEvents, automationServices, normalizeAutomations, toRuntimeSteps, validateSystemAutomation } from "@runly/module-compiler";
import { execute, matches } from "@runly/module-engine/contracts";
import { createAutomationRunsService } from "./automation-runs-service.js";
import { createAutomationJobsService } from "./automation-jobs-service.js";
import { createAutomationApprovalsService } from "./automation-approvals-service.js";
import { createChatIntegrationsService } from "../routes/chat/chat-integrations-service.js";
import { createAutomationHttpService } from "./automation-http-service.js";
import { createNotificationService } from "./notification-service.js";
import { createAutomationWebhooksService, WEBHOOK_EVENT } from "./automation-webhooks-service.js";

export const SYSTEM_MODULE_KEY = "system.automations";
export const MAX_SYSTEM_AUTOMATIONS = 50;

export class SystemAutomationError extends Error {
  constructor(message, status = 400, diagnostics = null) {
    super(message);
    this.name = "SystemAutomationError";
    this.status = status;
    this.diagnostics = diagnostics;
  }
}

export function createSystemAutomationsService({ prisma, moduleServices = null, notifications = null, now = () => new Date() }) {
  const runs = createAutomationRunsService({ prisma });
  const jobs = createAutomationJobsService({ prisma, now });
  const approvals = createAutomationApprovalsService({ prisma, notifications: notifications ?? createNotificationService({ prisma }), chat: createChatIntegrationsService({ prisma }), now });
  const http = createAutomationHttpService({ prisma });
  const webhooks = createAutomationWebhooksService({ prisma, now });

  const toView = (row) => ({ id: row.id, key: row.key, label: row.label, enabled: row.enabled, ...row.definition, ...(row.webhookToken ? { webhookToken: row.webhookToken } : {}), updatedAt: row.updatedAt });
  // The stored definition in the shape the step engine runs.
  const toRuntime = (row) => ({ ...row.definition, key: row.key, label: row.label, enabled: row.enabled, steps: toRuntimeSteps(row.definition) });

  // Everything a run needs from the host, bound to the company.
  function hostFor(companyId) {
    return {
      services: moduleServices ? moduleServices.forSystem(SYSTEM_MODULE_KEY, companyId) : null,
      log: (entry) => runs.log({ companyId, moduleKey: SYSTEM_MODULE_KEY, entry }),
      enqueue: (job) => jobs.enqueue({ companyId, moduleKey: SYSTEM_MODULE_KEY, job }),
      approve: (request) => approvals.create({ companyId, moduleKey: SYSTEM_MODULE_KEY, request }),
      http: (request) => http.send({ companyId, moduleKey: SYSTEM_MODULE_KEY, request }),
    };
  }

  // The automations with how their latest run went (for the list).
  async function list(companyId) {
    const rows = await prisma.systemAutomation.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
    const recent = prisma.automationRun?.findMany
      ? await prisma.automationRun.findMany({ where: { companyId, moduleKey: SYSTEM_MODULE_KEY }, orderBy: { createdAt: "desc" }, take: 300, select: { automationKey: true, status: true, createdAt: true } })
      : [];
    const last = new Map();
    for (const run of recent) if (!last.has(run.automationKey)) last.set(run.automationKey, { status: run.status, createdAt: run.createdAt });
    return rows.map((row) => ({ ...toView(row), lastRun: last.get(row.key) ?? null }));
  }

  // What the editor offers: events with their payload fields and the services
  // that can run without a person.
  function catalog() {
    return { events: automationEvents(), services: automationServices({ trigger: "event" }) };
  }

  // Saving is the administrator's consent: the services in use are granted to
  // the pseudo module for this company, the ones no longer used are removed.
  async function syncGrants(companyId, actorId) {
    const rows = await prisma.systemAutomation.findMany({ where: { companyId }, select: { definition: true } });
    const used = new Set(rows.flatMap((row) => (row.definition.steps ?? []).map((step) => step.service).filter(Boolean)));
    await prisma.moduleServiceGrant.deleteMany({ where: { moduleKey: SYSTEM_MODULE_KEY, companyId, serviceKey: { notIn: [...used] } } });
    if (used.size) {
      await prisma.moduleServiceGrant.createMany({
        data: [...used].map((serviceKey) => ({ moduleKey: SYSTEM_MODULE_KEY, serviceKey, companyId, grantedBy: actorId ?? null })),
        skipDuplicates: true,
      });
    }
  }

  async function save({ companyId, actorId, key, input }) {
    const candidate = { ...input, ...(key ? { key } : {}) };
    const errors = validateSystemAutomation(candidate);
    if (errors.length) throw new SystemAutomationError("La automatización tiene errores.", 422, errors);
    const [definition] = normalizeAutomations([candidate]);
    const { key: finalKey, label, enabled, ...rest } = definition;
    const existing = await prisma.systemAutomation.findUnique({ where: { companyId_key: { companyId, key: finalKey } } });
    if (!existing && key) throw new SystemAutomationError("Automatización no encontrada.", 404);
    if (!existing && (await prisma.systemAutomation.count({ where: { companyId } })) >= MAX_SYSTEM_AUTOMATIONS) {
      throw new SystemAutomationError(`Máximo ${MAX_SYSTEM_AUTOMATIONS} automatizaciones por empresa.`, 409);
    }
    // The secret URL of a webhook trigger is created once and survives edits.
    const webhookToken = rest.trigger?.type === "webhook" ? (existing?.webhookToken ?? webhooks.newToken()) : null;
    const row = existing
      ? await prisma.systemAutomation.update({ where: { id: existing.id }, data: { label, enabled, definition: rest, webhookToken } })
      : await prisma.systemAutomation.create({ data: { companyId, key: finalKey, label, enabled, definition: rest, webhookToken, createdById: actorId ?? null } });
    await syncGrants(companyId, actorId);
    return toView(row);
  }

  async function create({ companyId, actorId, input }) {
    const taken = await prisma.systemAutomation.findUnique({ where: { companyId_key: { companyId, key: String(input?.key ?? "") } } });
    if (taken) throw new SystemAutomationError("Ya existe una automatización con esa clave.", 409);
    return save({ companyId, actorId, key: null, input });
  }

  async function remove({ companyId, actorId, key }) {
    const existing = await prisma.systemAutomation.findUnique({ where: { companyId_key: { companyId, key } } });
    if (!existing) throw new SystemAutomationError("Automatización no encontrada.", 404);
    await prisma.systemAutomation.delete({ where: { id: existing.id } });
    await syncGrants(companyId, actorId);
    return { key };
  }

  // The Automatizaciones module can be switched off instance-wide or for one company:
  // then nothing of the company's own automations runs (events, webhooks, schedules, waits).
  async function moduleOn(companyId) {
    if (!prisma.runlyModule?.findFirst) return true;
    const mod = await prisma.runlyModule.findFirst({ where: { key: "runly.automations", status: "INSTALLED", enabled: true }, select: { id: true } });
    if (!mod) return false;
    const off = await prisma.companyModule.findFirst({ where: { companyId, moduleId: mod.id, enabled: false }, select: { id: true } });
    return !off;
  }

  // Domain event: every enabled automation of the company listening to it. Same
  // contract as a module's event handler: idempotent per event, and a failure is
  // rethrown after the loop so the dispatcher retries.
  async function runEvent({ companyId, event, payload: received, eventId }) {
    if (!(await moduleOn(companyId))) return { skipped: true };
    const rows = await prisma.systemAutomation.findMany({ where: { companyId, enabled: true } });
    // A webhook message is addressed to one automation; its data are the fields.
    const webhook = event === WEBHOOK_EVENT;
    const payload = webhook ? (received?.data ?? {}) : received;
    const due = rows.filter((row) => (webhook
      ? row.key === received?.automationKey && row.definition.trigger?.type === "webhook"
      : row.definition.trigger?.type === "event" && row.definition.trigger.event === event) && matches(row.definition.trigger.when, payload));
    if (!due.length) return { ran: 0 };
    const host = hostFor(companyId);
    if (!host.services) throw new SystemAutomationError("Los servicios no están disponibles en esta instancia.", 500);
    const failures = [];
    for (const row of due) {
      const automation = toRuntime(row);
      const result = await execute({ moduleKey: SYSTEM_MODULE_KEY, automation, base: `${automation.key}:${eventId}`, data: payload, trigger: webhook ? "webhook" : "event", ref: eventId, ...host });
      if (!result.ok) failures.push(`${automation.key}: ${result.error}`);
    }
    if (failures.length) throw new Error(failures.join(" | "));
    return { ran: due.length };
  }

  // Continuation after a wait or an approval (worker).
  async function resume({ job }) {
    const row = await prisma.systemAutomation.findUnique({ where: { companyId_key: { companyId: job.companyId, key: job.automationKey } } });
    if (!row) throw new Error(`La automatización "${job.automationKey}" ya no existe.`);
    if (!row.enabled) return { skipped: true };
    if (!(await moduleOn(job.companyId))) throw new Error("El módulo Automatizaciones está desactivado para esta empresa.");
    const automation = toRuntime(row);
    const { data, recordId = null, actorId = null, base = null } = job.payload ?? {};
    const result = await execute({
      moduleKey: SYSTEM_MODULE_KEY, automation, base, data, recordId, actorId, from: job.fromStep, runId: job.runId ?? null, trigger: "delayed", ref: recordId, ...hostFor(job.companyId),
    });
    if (!result.ok) throw new Error(result.error);
    return result;
  }

  // The schedule trigger of one automation, or null (used by the worker).
  async function scheduleOf({ companyId, key }) {
    const row = await prisma.systemAutomation.findUnique({ where: { companyId_key: { companyId, key } } });
    const trigger = row?.enabled ? row.definition.trigger : null;
    return trigger?.type === "schedule" ? { key, ...trigger } : null;
  }

  // Every enabled schedule of every company: [{ companyId, schedule }].
  async function listSchedules() {
    const rows = await prisma.systemAutomation.findMany({ where: { enabled: true } });
    return rows.filter((row) => row.definition.trigger?.type === "schedule").map((row) => ({ companyId: row.companyId, schedule: { key: row.key, ...row.definition.trigger } }));
  }

  async function runSchedule({ companyId, key, occurrence }) {
    const row = await prisma.systemAutomation.findUnique({ where: { companyId_key: { companyId, key } } });
    if (!row || !row.enabled || row.definition.trigger?.type !== "schedule" || !(await moduleOn(companyId))) return { skipped: true };
    const automation = toRuntime(row);
    const result = await execute({
      moduleKey: SYSTEM_MODULE_KEY, automation, base: `${key}:all:${occurrence}`, data: { firedAt: occurrence }, recordId: null, actorId: null, trigger: "schedule", ref: occurrence, ...hostFor(companyId),
    });
    if (!result.ok) throw new Error(result.error);
    return result;
  }

  // A new secret URL: the old one stops working at once.
  async function regenerateWebhookToken({ companyId, key }) {
    const row = await prisma.systemAutomation.findUnique({ where: { companyId_key: { companyId, key } } });
    if (!row || row.definition.trigger?.type !== "webhook") throw new SystemAutomationError("Esta automatización no recibe webhooks.", 404);
    const updated = await prisma.systemAutomation.update({ where: { id: row.id }, data: { webhookToken: webhooks.newToken() } });
    return toView(updated);
  }

  const webhookEvents = ({ companyId, key }) => webhooks.recentEvents({ companyId, key });

  return { list, catalog, create, save, remove, runEvent, resume, scheduleOf, listSchedules, runSchedule, hostFor, regenerateWebhookToken, webhookEvents, webhooks };
}
