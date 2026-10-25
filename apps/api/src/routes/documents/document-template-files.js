// Format helpers for file-based document templates: format detection, scanning
// of `{{tags}}` against a kind schema, label vocabulary and blank templates.
import ExcelJS from "exceljs";

import { inspectDocx } from "../../services/document-templates/docx-template.js";
import { inspectXlsx } from "../../services/document-templates/xlsx-template.js";
import { inspectPptx } from "../../services/document-templates/pptx-template.js";
import { buildMinimalDocx, paragraph, table } from "../../services/document-templates/minimal-docx.js";
import { buildMinimalPptx, textBox } from "../../services/document-templates/minimal-pptx.js";
import { normalizeLabel } from "../../services/document-templates/docx-autotag.js";
import { detectPdfFields, inspectPdf } from "../../services/document-templates/pdf-template.js";

export const FILE_FORMATS = ["docx", "xlsx", "pptx", "pdf"];
export const MAX_TEMPLATE_BYTES = 10 * 1024 * 1024;
export const FORMAT_MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
};
export const NO_TAGS_WARNING = "La plantilla no contiene etiquetas {{…}}; el documento se generará sin datos.";

export function formatOfFileName(fileName) {
  const ext = String(fileName ?? "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return FILE_FORMATS.includes(ext) ? ext : null;
}

// Tags the kind knows: top-level entries plus `list.field` for list entries.
function knownTagSet(kind) {
  const known = new Set();
  const lists = new Map();
  for (const entry of kind.schema) {
    known.add(entry.tag);
    if (entry.type === "list") {
      lists.set(entry.tag, Array.isArray(entry.fields) ? entry.fields.map((f) => f.tag) : null);
    }
  }
  return { known, lists };
}

// Template tags not described by the kind schema (`#items`, `%sig`, `items.model`).
export function unknownTags(kind, tags) {
  const { known, lists } = knownTagSet(kind);
  return tags.filter((raw) => {
    const tag = raw.replace(/^[#^%]/, "");
    if (known.has(tag)) return false;
    const [head, ...rest] = tag.split(".");
    if (rest.length && lists.has(head)) {
      const fields = lists.get(head);
      const inner = rest.join(".");
      return fields ? !fields.includes(inner) && !known.has(inner) : false;
    }
    return true;
  });
}

// Label vocabulary of a kind: explicit `labels` or one entry per scalar field.
export function kindLabels(kind) {
  if (kind.labels) return kind.labels instanceof Map ? kind.labels : new Map(Object.entries(kind.labels));
  const labels = new Map();
  for (const entry of kind.schema) {
    if (entry.type === "list") continue;
    labels.set(normalizeLabel(entry.label), entry.tag);
  }
  return labels;
}

export const kindImageKeys = (kind) => new Set(kind.schema.filter((e) => e.type === "image").map((e) => e.tag));

// Validates the file for its format and returns { tags, unknown, warnings, page?, layout? }.
export async function scanTemplate(format, buffer, kind) {
  if (format === "pdf") {
    const detected = await detectPdfFields(buffer, {
      labels: kindLabels(kind),
      imageKeys: kindImageKeys(kind),
      important: kind.important ?? [],
    });
    const warnings = [...detected.warnings];
    if (!detected.fields.length) warnings.push("No se detectaron campos en el PDF; márcalos manualmente o usa etiquetas [Campo] en el texto.");
    return {
      tags: detected.fields.map((field) => field.key),
      unknown: [],
      warnings,
      page: detected.page,
      layout: { page: detected.page, fields: detected.fields },
    };
  }
  const inspected = format === "docx" ? inspectDocx(buffer) : format === "xlsx" ? await inspectXlsx(buffer) : inspectPptx(buffer);
  const unknown = unknownTags(kind, inspected.tags);
  const warnings = [
    ...unknown.map((tag) => `Etiqueta desconocida: {{${tag}}}`),
    ...(inspected.tags.length ? [] : [NO_TAGS_WARNING]),
  ];
  return { tags: inspected.tags, unknown, warnings, layout: null };
}

export { inspectPdf };

// A starter document listing the kind's fields as "Label: {{tag}}".
export async function buildBlankTemplate(format, kind, title) {
  const scalars = kind.schema.filter((e) => e.type !== "list" && e.type !== "image");
  const lists = kind.schema.filter((e) => e.type === "list");
  const images = kind.schema.filter((e) => e.type === "image");
  if (format === "docx") {
    const body = [
      paragraph(title, { bold: true, size: 28, align: "center" }),
      ...scalars.map((e) => paragraph(`${e.label}: {{${e.tag}}}`)),
      ...lists.flatMap((list) => {
        const fields = list.fields ?? [];
        if (!fields.length) return [];
        return [
          paragraph(list.label, { bold: true }),
          table([
            fields.map((f) => f.label),
            fields.map((f, i) => `${i === 0 ? `{{#${list.tag}}}` : ""}{{${f.tag}}}${i === fields.length - 1 ? `{{/${list.tag}}}` : ""}`),
          ]),
        ];
      }),
      ...images.flatMap((e) => [paragraph(e.label, { bold: true }), paragraph(`{{%${e.tag}}}`)]),
    ].join("");
    return buildMinimalDocx(body);
  }
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Documento");
    sheet.addRow([title]).font = { bold: true, size: 14 };
    for (const e of scalars) sheet.addRow([e.label, `{{${e.tag}}}`]);
    for (const list of lists) {
      const fields = list.fields ?? [];
      if (!fields.length) continue;
      sheet.addRow([]);
      sheet.addRow(fields.map((f) => f.label)).font = { bold: true };
      sheet.addRow(fields.map((f, i) => `${i === 0 ? `{{#${list.tag}}}` : ""}{{${f.tag}}}`));
    }
    sheet.getColumn(1).width = 28;
    sheet.getColumn(2).width = 40;
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  if (format === "pptx") {
    const shapes = [textBox(title, { x: 600000, y: 300000, cx: 10992000, cy: 700000, size: 32, bold: true, name: "Titulo" })];
    scalars.slice(0, 10).forEach((e, i) => {
      shapes.push(textBox(`${e.label}: {{${e.tag}}}`, { x: 900000, y: 1300000 + i * 450000, cx: 10392000, cy: 400000, size: 18, align: "l", name: "Campo" }));
    });
    return buildMinimalPptx(shapes.join(""));
  }
  return null;
}
