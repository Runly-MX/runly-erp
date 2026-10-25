// Sharing automations: duplicate one, or export/import it as a small JSON file
// (`*.runly-automation.json`). The file carries the flow only: no ids, no secret
// webhook URL (a new one is created on save) and, when it comes from a file, no
// people (their ids belong to the company that exported it).
import { keyFromName } from "../../runly.core/lib/automationStarters.js";

export const FILE_FORMAT = "runly.automation";
export const FILE_VERSION = 1;
export const MAX_FILE_BYTES = 200 * 1024;
const PEOPLE_ARGS = ["userIds", "attendeeIds"];

// The definition without what belongs to one stored row.
export function definitionOf(item) {
  const { id: _id, key: _key, updatedAt: _updatedAt, lastRun: _lastRun, webhookToken: _token, ...definition } = item;
  return JSON.parse(JSON.stringify(definition));
}

export function exportFile(item) {
  const { label, ...rest } = definitionOf(item);
  return { format: FILE_FORMAT, version: FILE_VERSION, exportedAt: new Date().toISOString(), automation: { label, ...rest, enabled: false } };
}

export function downloadFile(item) {
  const blob = new Blob([JSON.stringify(exportFile(item), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileNameFor(item);
  link.click();
  URL.revokeObjectURL(url);
}

export const fileNameFor = (item) => `${keyFromName(item.label || item.key, new Set()) || "automatizacion"}.runly-automation.json`;

// Removes the people picked in a flow; returns how many places had them.
export function withoutPeople(definition) {
  let removed = 0;
  const steps = (definition.steps ?? []).map((step) => {
    if (step.type === "approval" && step.approvers?.length) { removed += 1; return { ...step, approvers: [] }; }
    if (!step.args) return step;
    const args = { ...step.args };
    for (const name of PEOPLE_ARGS) if (args[name]?.from === "value" && args[name].value?.length) { delete args[name]; removed += 1; }
    return { ...step, args };
  });
  return { definition: { ...definition, steps }, removed };
}

// A copy of an automation of this company: paused, with a free key and name.
export function duplicateDraft(item, takenKeys) {
  const label = `Copia de ${item.label}`.slice(0, 120);
  return { key: keyFromName(label, takenKeys), ...definitionOf(item), label, enabled: false };
}

// Text of a file -> { draft, removedPeople } or { error }.
export function parseFile(text, takenKeys) {
  if (typeof text !== "string" || text.length > MAX_FILE_BYTES) return { error: "El archivo es demasiado grande para ser una automatización." };
  let data;
  try { data = JSON.parse(text); } catch { return { error: "El archivo no es un JSON válido." }; }
  if (data?.format !== FILE_FORMAT) return { error: "Este archivo no es una automatización de Runly." };
  if (!Number.isInteger(data.version) || data.version > FILE_VERSION) return { error: "El archivo es de una versión más nueva de Runly. Actualiza Runly para importarlo." };
  const automation = data.automation;
  if (!automation || typeof automation.label !== "string" || !automation.trigger || !Array.isArray(automation.steps)) return { error: "Al archivo le falta el disparador o los bloques." };
  const { definition, removed } = withoutPeople(automation);
  const label = automation.label.trim().slice(0, 120) || "Automatización importada";
  return { draft: { ...definition, key: keyFromName(label, takenKeys), label, enabled: false }, removedPeople: removed };
}
