// apps/api/src/routes/automations/mirai-capabilities.js
//
// runly.automations capability for MirAI: read the company's automations and their
// run history, learn what blocks exist, and propose creating, pausing/activating or
// deleting one (always confirmed by the user). Automations created by MirAI start
// PAUSED: the person reviews them in the canvas and turns them on. The secret
// webhook URL is never put in a tool result or a proposal. publicLookup: not
// applicable (private company configuration).
import { automationEvents, automationServices, validateSystemAutomation } from "@runly/module-compiler";
import { createSystemAutomationsService, SYSTEM_MODULE_KEY } from "../../services/system-automations-service.js";
import { createAutomationRunsService } from "../../services/automation-runs-service.js";

const LINK = (key) => `/app/m/runly.automations/${key}`;
const STATUS_ES = { success: "correcta", failed: "con error", partial: "parcial", waiting: "en espera", cancelled: "cancelada", rejected: "rechazada" };

const slug = (text) => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
const brief = (row) => ({
  key: row.key, nombre: row.label, activa: row.enabled, disparador: row.trigger?.type, evento: row.trigger?.event ?? undefined,
  bloques: (row.steps ?? []).length, ultimaEjecucion: row.lastRun ? { estado: STATUS_ES[row.lastRun.status] ?? row.lastRun.status, fecha: row.lastRun.createdAt } : null,
});

export function createAutomationsMiraiCapabilities({ prisma }) {
  const service = createSystemAutomationsService({ prisma });
  const runs = createAutomationRunsService({ prisma });
  const find = async (companyId, key) => (await service.list(companyId)).find((row) => row.key === key) ?? null;

  const tools = [
    {
      name: "automations_list",
      permission: "automations.read",
      definition: {
        description: "Lista las automatizaciones de la empresa con su estado (activa o en pausa), disparador, cantidad de bloques y resultado de la ultima ejecucion. Devuelve el total exacto.",
        parameters: { type: "object", properties: { query: { type: "string", description: "Texto del nombre a buscar." }, soloConErrores: { type: "boolean" } } },
      },
      async run(args, actx) {
        let rows = (await service.list(actx.companyId)).map(brief);
        const q = String(args?.query ?? "").trim().toLowerCase();
        if (q) rows = rows.filter((row) => `${row.nombre} ${row.key}`.toLowerCase().includes(q));
        if (args?.soloConErrores) rows = rows.filter((row) => ["con error", "parcial"].includes(row.ultimaEjecucion?.estado));
        return { total: rows.length, automatizaciones: rows.slice(0, 30) };
      },
    },
    {
      name: "automations_runs",
      permission: "automations.read",
      definition: {
        description: "Historial reciente de una automatizacion (por key): estado de cada ejecucion y, por bloque, si funciono, se omitio o fallo con su error.",
        parameters: { type: "object", properties: { key: { type: "string" }, limit: { type: "integer", description: "Maximo 10." } }, required: ["key"] },
      },
      async run(args, actx) {
        const limit = Math.min(10, Math.max(1, Number(args?.limit) || 5));
        const rows = await runs.list({ companyId: actx.companyId, moduleKey: SYSTEM_MODULE_KEY, automation: String(args?.key ?? ""), limit });
        return {
          total: rows.length,
          ejecuciones: rows.map((run) => ({
            fecha: run.createdAt, estado: STATUS_ES[run.status] ?? run.status, error: run.error ?? undefined, duracionMs: run.durationMs ?? undefined,
            bloques: (run.steps ?? []).map((step) => ({ n: step.index + 1, accion: step.service ?? step.type, resultado: step.skipped ? "omitido" : step.ok ? "correcto" : "fallo", error: step.error ?? undefined })),
          })),
        };
      },
    },
    {
      name: "automations_catalog",
      permission: "automations.read",
      definition: {
        description: "Eventos que pueden iniciar una automatizacion (con los campos que traen) y acciones disponibles (con sus argumentos). Consultalo antes de proponer crear una.",
        parameters: { type: "object", properties: {} },
      },
      async run() {
        return {
          eventos: automationEvents().map((event) => ({ key: event.key, nombre: event.label, campos: event.payload })),
          acciones: automationServices({ trigger: "event" }).map((item) => ({ service: item.key, nombre: item.label, args: Object.entries(item.args).map(([name, spec]) => `${name}${spec.required ? "*" : ""}:${spec.type}`) })),
        };
      },
    },
  ];

  const create = {
    key: "automations.automation.create",
    moduleKey: "runly.automations",
    operation: "create",
    label: "Crear automatizacion",
    permission: "automations.manage",
    description: "Crea una automatizacion de la empresa (queda EN PAUSA hasta que el usuario la active). Consulta antes automations_catalog. trigger: { type: 'event', event } | { type: 'schedule', every: 'hour'|'day'|'week'|'month', at: 'HH:MM', weekday?, day? } | { type: 'webhook', fields: [{key,label}] }. steps: lista de bloques; cada uno es { service, args } donde args = { nombre: { from: 'value', value } | { from: 'template', template: 'Texto {{campo}}' } | { from: 'field', field } }, o { type: 'delay', amount, unit: 'minutes'|'hours'|'days' }, o { type: 'branch', when: { field, op, value }, yes: N, no: M } (los siguientes N bloques son el camino Si, los M siguientes el No, y debe haber un bloque despues). Maximo 12 bloques. Los bloques posteriores pueden usar {{paso1_id}} etc.",
    parameters: {
      type: "object",
      properties: {
        label: { type: "string", description: "Nombre de la automatizacion." },
        trigger: { type: "object" },
        steps: { type: "array", items: { type: "object" } },
      },
      required: ["label", "trigger", "steps"],
    },
    async prepare(args, actx) {
      const label = String(args?.label ?? "").trim();
      if (!label || !args?.trigger || !Array.isArray(args?.steps)) return { error: "Indica nombre, disparador y bloques." };
      const base = slug(label) || "automatizacion";
      const taken = new Set((await service.list(actx.companyId)).map((row) => row.key));
      let key = base;
      for (let n = 2; taken.has(key); n += 1) key = `${base}_${n}`;
      const candidate = { key, label, enabled: false, trigger: args.trigger, steps: args.steps };
      const problems = validateSystemAutomation(candidate);
      if (problems.length) return { error: `La automatizacion no es valida: ${problems.slice(0, 4).map((p) => `${p.path}: ${p.message}`).join(" | ")}` };
      return {
        input: { candidate },
        preview: {
          title: "Crear automatizacion (en pausa)",
          fields: [
            { label: "Nombre", value: label },
            { label: "Disparador", value: args.trigger.event ?? args.trigger.type },
            { label: "Bloques", value: args.steps.map((step) => step.service ?? step.type).join(" -> ").slice(0, 300) },
          ],
        },
      };
    },
    async execute(input, actx) {
      const saved = await service.create({ companyId: actx.companyId, actorId: actx.actorProfileId, input: input.candidate });
      return { id: saved.id, summary: `Automatizacion creada en pausa: ${saved.label}`, link: LINK(saved.key) };
    },
  };

  const setEnabled = {
    key: "automations.automation.set_enabled",
    moduleKey: "runly.automations",
    operation: "update",
    label: "Activar o pausar automatizacion",
    permission: "automations.manage",
    description: "Activa o pausa una automatizacion existente (key de automations_list).",
    parameters: { type: "object", properties: { key: { type: "string" }, enabled: { type: "boolean" } }, required: ["key", "enabled"] },
    async prepare(args, actx) {
      const row = await find(actx.companyId, String(args?.key ?? ""));
      if (!row) return { error: "No encontre esa automatizacion. Usa automations_list para ver las keys." };
      if (typeof args.enabled !== "boolean") return { error: "Indica si debe quedar activa o en pausa." };
      if (row.enabled === args.enabled) return { error: `Ya estaba ${row.enabled ? "activa" : "en pausa"}.` };
      return {
        input: { key: row.key, enabled: args.enabled }, targetId: row.id,
        preview: { title: args.enabled ? "Activar automatizacion" : "Pausar automatizacion", fields: [{ label: "Automatizacion", value: row.label }, { label: "Estado", before: row.enabled ? "Activa" : "En pausa", value: args.enabled ? "Activa" : "En pausa" }] },
      };
    },
    async execute(input, actx) {
      const row = await find(actx.companyId, input.key);
      if (!row) throw new Error("La automatizacion ya no existe.");
      const { id: _id, updatedAt: _u, lastRun: _l, webhookToken: _t, key, ...definition } = row;
      const saved = await service.save({ companyId: actx.companyId, actorId: actx.actorProfileId, key, input: { ...definition, enabled: input.enabled } });
      return { id: saved.id, summary: `Automatizacion ${saved.enabled ? "activada" : "pausada"}: ${saved.label}`, link: LINK(saved.key) };
    },
  };

  const remove = {
    key: "automations.automation.delete",
    moduleKey: "runly.automations",
    operation: "delete",
    label: "Eliminar automatizacion",
    permission: "automations.manage",
    description: "Elimina una automatizacion (key de automations_list). Su historial se conserva.",
    parameters: { type: "object", properties: { key: { type: "string" } }, required: ["key"] },
    async prepare(args, actx) {
      const row = await find(actx.companyId, String(args?.key ?? ""));
      if (!row) return { error: "No encontre esa automatizacion. Usa automations_list para ver las keys." };
      return { input: { key: row.key }, targetId: row.id, preview: { title: "Eliminar automatizacion", fields: [{ label: "Automatizacion", value: row.label }, { label: "Bloques", value: String((row.steps ?? []).length) }] } };
    },
    async execute(input, actx) {
      await service.remove({ companyId: actx.companyId, actorId: actx.actorProfileId, key: input.key });
      return { id: input.key, summary: "Automatizacion eliminada." };
    },
  };

  return {
    moduleKey: "runly.automations",
    label: "Automatizaciones",
    summary: "Flujos de la empresa: lista con su estado y errores, historial de ejecuciones por bloque, catalogo de eventos y acciones; crear (queda en pausa), activar/pausar y eliminar con confirmacion.",
    tools,
    actions: [create, setEnabled, remove],
    publicLookup: [],
    async describeContext(pageContext, actx) {
      if (pageContext?.recordType !== "automation" || !pageContext.recordId) return null;
      const row = await find(actx.companyId, String(pageContext.recordId));
      return row ? `El usuario esta viendo la automatizacion "${row.label}" (key ${row.key}, ${row.enabled ? "activa" : "en pausa"}).` : null;
    },
  };
}
