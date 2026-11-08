import { AUTOMATION_FILE, cleanAutomation, definitionOf as sharedDefinitionOf, exportAutomationFile, parseAutomationFile } from "@runly/module-compiler/automation-file";
import { keyFromName } from "../../runly.core/lib/automationStarters.js";

// The format, its limits, cleaning and parsing live in @runly/module-compiler/automation-file
// (shared with the Developer Hub validator). This module keeps the editor's own surface:
// the same messages and shapes, plus what only a browser can do (download, keys of this company).
export const FILE_FORMAT = AUTOMATION_FILE.format;
export const FILE_VERSION = AUTOMATION_FILE.version;
export const MAX_FILE_BYTES = AUTOMATION_FILE.maxBytes;
// Importing your own export keeps its references: only the people of another company are dropped.
const DESKTOP_CLEANUP = { people: true, externalEmails: false, chatChannels: false, fileIds: false, contactIds: false, templateIds: false, recordIds: false };

// The definition without what belongs to one stored row.
export const definitionOf = sharedDefinitionOf;

export const exportFile = (item) => exportAutomationFile(item, { exportedAt: new Date().toISOString() });

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
  const { definition: clean, removed } = cleanAutomation(definition, DESKTOP_CLEANUP);
  return { definition: clean, removed: removed.people };
}

// A copy of an automation of this company: paused, with a free key and name.
export function duplicateDraft(item, takenKeys) {
  const label = `Copia de ${item.label}`.slice(0, 120);
  return { key: keyFromName(label, takenKeys), ...definitionOf(item), label, enabled: false };
}

// Text of a file -> { draft, removedPeople } or { error }.
export function parseFile(text, takenKeys) {
  if (typeof text !== "string") return { error: "El archivo es demasiado grande para ser una automatización." };
  const result = parseAutomationFile(text, { cleanup: DESKTOP_CLEANUP });
  if (!result.ok) return { error: result.errors[0].message };
  const { key: _key, ...definition } = result.definition;
  return { draft: { ...definition, key: keyFromName(definition.label, takenKeys) }, removedPeople: result.removed.people };
}
