import assert from "node:assert/strict";
import { test } from "node:test";

import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { buildMinimalDocx, paragraph } from "../../../services/document-templates/minimal-docx.js";
import { buildMinimalPptx, textBox } from "../../../services/document-templates/minimal-pptx.js";
import { createDocumentFileTemplateService } from "../document-file-template-service.js";
import { createKindRegistry } from "../kinds/kind-registry.js";
import { createFakeFiles, createFakePrisma, fileOf } from "./fake-documents-db.js";

const COMPANY = "11111111-1111-7111-8111-111111111111";

export function testKind(overrides = {}) {
  return {
    key: "test.record",
    label: "Registro",
    permissionKey: "test.records.read",
    schema: [
      { tag: "name", label: "Nombre", type: "text" },
      { tag: "date", label: "Fecha", type: "date" },
      { tag: "items", label: "Partidas", type: "list", fields: [{ tag: "model", label: "Modelo", type: "text" }] },
      { tag: "signature", label: "Firma", type: "image" },
    ],
    load: async () => ({}),
    ...overrides,
  };
}

function setup(kindOverrides) {
  const prisma = createFakePrisma();
  const files = createFakeFiles(prisma);
  const kinds = createKindRegistry();
  kinds.register(testKind(kindOverrides));
  return { prisma, files, kinds, service: createDocumentFileTemplateService({ prisma, files, kinds }) };
}

const docx = (text) => buildMinimalDocx(paragraph(text));

async function xlsx(text) {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Hoja").addRow([text]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function pdfWithLabel() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([612, 792]).drawText("Nombre:", { x: 60, y: 700, size: 12, font });
  return Buffer.from(await doc.save());
}

test("uploads docx, xlsx, pptx and pdf as templates with a draft version", async () => {
  const { service } = setup();
  const cases = [
    ["docx", docx("Nombre: {{name}} {{ghost}}")],
    ["xlsx", await xlsx("{{name}}")],
    ["pptx", buildMinimalPptx(textBox("{{name}}", { x: 0, y: 0, cx: 1000000, cy: 500000 }))],
    ["pdf", await pdfWithLabel()],
  ];
  for (const [format, buffer] of cases) {
    const { template } = await service.upload({ companyId: COMPANY, kind: "test.record", file: fileOf(buffer, `plantilla.${format}`) });
    assert.equal(template.format, format);
    assert.equal(template.version.status, "draft");
    assert.ok(template.version.fileAssetId);
  }
});

test("flags tags outside the kind schema in docx and detects pdf fields", async () => {
  const { service } = setup();
  const word = await service.upload({ companyId: COMPANY, kind: "test.record", file: fileOf(docx("{{name}} {{ghost}}"), "a.docx") });
  assert.deepEqual(word.template.version.placeholders.sort(), ["ghost", "name"]);
  assert.ok(word.warnings.some((w) => w.includes("{{ghost}}")));
  const pdf = await service.upload({ companyId: COMPANY, kind: "test.record", file: fileOf(await pdfWithLabel(), "a.pdf") });
  assert.deepEqual(pdf.template.version.placeholders, ["name"]);
  assert.equal(pdf.template.version.layout.fields.length, 1);
});

test("rejects big files, other extensions, unknown kinds and formats the kind does not accept", async () => {
  const { service } = setup({ formats: ["docx"] });
  const upload = (file, kind = "test.record") => service.upload({ companyId: COMPANY, kind, file });
  await assert.rejects(upload(fileOf(Buffer.alloc(10 * 1024 * 1024 + 1), "a.docx")), /10 MB/);
  await assert.rejects(upload(fileOf(Buffer.from("x"), "a.txt")), /Formato no admitido/);
  await assert.rejects(upload(fileOf(docx("x"), "a.docx"), "nope.kind"), (err) => err.status === 404);
  await assert.rejects(upload(fileOf(await xlsx("x"), "a.xlsx")), /no admite archivos \.xlsx/);
});

test("blank document lists the kind fields as tags; publish and one default per kind scope", async () => {
  const { service } = setup();
  const blank = await service.createBlank({ companyId: COMPANY, kind: "test.record", format: "docx", name: "Mi registro", publish: true });
  assert.ok(blank.template.version.placeholders.includes("name"));
  assert.equal(blank.template.version.status, "published");
  assert.equal(blank.template.isDefault, true);
  const second = await service.createBlank({ companyId: COMPANY, kind: "test.record", format: "xlsx", publish: true });
  assert.equal(second.template.isDefault, false);
  await assert.rejects(service.setDefault({ companyId: COMPANY, templateId: "x" }), (err) => err.status === 404);
  await service.setDefault({ companyId: COMPANY, templateId: second.template.id });
  const listed = await service.list({ companyId: COMPANY, kind: "test.record" });
  assert.deepEqual(listed.filter((t) => t.isDefault).map((t) => t.id), [second.template.id]);
});

test("suggest tags a docx from the kind labels and refuses files that already have tags; mapping is saved on drafts only", async () => {
  const { service } = setup();
  const word = await service.upload({ companyId: COMPANY, kind: "test.record", file: fileOf(docx("Nombre: ________"), "a.docx") });
  const suggestion = await service.suggest({ companyId: COMPANY, templateId: word.template.id, versionId: word.template.version.id });
  assert.equal(suggestion.supported, true);
  assert.deepEqual(suggestion.applied.map((a) => a.tag), ["name"]);
  const sheet = await service.upload({ companyId: COMPANY, kind: "test.record", file: fileOf(await xlsx("{{name}}"), "a.xlsx") });
  await assert.rejects(service.suggest({ companyId: COMPANY, templateId: sheet.template.id, versionId: sheet.template.version.id }), /ya tiene etiquetas/);
  const saved = await service.saveMapping({ companyId: COMPANY, templateId: sheet.template.id, versionId: sheet.template.version.id, mapping: { name: "person.fullName" } });
  assert.deepEqual(saved.version.mapping, { name: "person.fullName" });
  await service.publishVersion({ companyId: COMPANY, templateId: sheet.template.id, versionId: sheet.template.version.id });
  await assert.rejects(service.saveMapping({ companyId: COMPANY, templateId: sheet.template.id, versionId: sheet.template.version.id, mapping: {} }), /publicada/);
});

test("replacing the file of a published version creates a new draft that keeps the mapping", async () => {
  const { service } = setup();
  const up = await service.upload({ companyId: COMPANY, kind: "test.record", file: fileOf(docx("{{name}}"), "a.docx"), publish: true });
  const replaced = await service.replaceVersionFile({ companyId: COMPANY, templateId: up.template.id, versionId: up.template.version.id, file: fileOf(docx("{{name}} {{date}}"), "b.docx") });
  assert.equal(replaced.template.version.versionNumber, 2);
  assert.equal(replaced.template.version.status, "draft");
  assert.deepEqual(replaced.template.version.placeholders.sort(), ["date", "name"]);
  await assert.rejects(service.replaceVersionFile({ companyId: COMPANY, templateId: up.template.id, versionId: up.template.version.id, file: fileOf(Buffer.from("x"), "c.txt") }), /Formato no admitido/);
});

test("replace accepts another format: docx -> pdf rescans layout and keeps mapping only for surviving tags", async () => {
  const { service, prisma } = setup();
  const up = await service.upload({ companyId: COMPANY, kind: "test.record", file: fileOf(docx("{{name}} {{date}}"), "a.docx") });
  await service.saveMapping({ companyId: COMPANY, templateId: up.template.id, versionId: up.template.version.id, mapping: { name: "person.name", date: "person.date" } });
  const replaced = await service.replaceVersionFile({ companyId: COMPANY, templateId: up.template.id, versionId: up.template.version.id, file: fileOf(await pdfWithLabel(), "b.pdf") });
  assert.equal(replaced.template.format, "pdf");
  assert.deepEqual(replaced.template.version.placeholders, ["name"]);
  assert.equal(replaced.template.version.layout.fields.length, 1);
  assert.deepEqual(replaced.template.version.mapping, { name: "person.name" });
  assert.equal(prisma.documentTemplate.rows[0].format, "pdf");
});

test("replace accepts another format: pdf -> docx drops the layout; a published template changes format on publishing", async () => {
  const { service, prisma } = setup();
  const draft = await service.upload({ companyId: COMPANY, kind: "test.record", file: fileOf(await pdfWithLabel(), "a.pdf") });
  const toDocx = await service.replaceVersionFile({ companyId: COMPANY, templateId: draft.template.id, versionId: draft.template.version.id, file: fileOf(docx("{{name}}"), "b.docx") });
  assert.equal(toDocx.template.format, "docx");
  assert.equal(toDocx.template.version.layout, null);
  assert.deepEqual(toDocx.template.version.placeholders, ["name"]);

  const live = await service.upload({ companyId: COMPANY, kind: "test.record", file: fileOf(docx("{{name}}"), "c.docx"), publish: true });
  const next = await service.replaceVersionFile({ companyId: COMPANY, templateId: live.template.id, versionId: live.template.version.id, file: fileOf(await pdfWithLabel(), "d.pdf") });
  assert.equal(next.template.version.versionNumber, 2);
  assert.equal(next.template.format, "pdf");
  const row = () => prisma.documentTemplate.rows.find((t) => t.id === live.template.id);
  assert.equal(row().format, "docx");
  const published = await service.publishVersion({ companyId: COMPANY, templateId: live.template.id, versionId: next.template.version.id });
  assert.equal(published.template.format, "pdf");
  assert.equal(row().format, "pdf");
});

test("inventory.custody accepts all four formats and tags a Word form with labels and empty cells", async () => {
  const { createInventoryCustodyDocumentKind } = await import("../kinds/inventory-custody-kind.js");
  const { table } = await import("../../../services/document-templates/minimal-docx.js");
  const prisma = createFakePrisma();
  const files = createFakeFiles(prisma);
  const kinds = createKindRegistry();
  kinds.register(createInventoryCustodyDocumentKind({ prisma: {} }));
  const service = createDocumentFileTemplateService({ prisma, files, kinds });

  // docx, xlsx, pptx and pdf are all valid uploads for the kind.
  const formats = [["a.docx", docx("Resguardo")], ["a.xlsx", await xlsx("Resguardo")], ["a.pptx", buildMinimalPptx(textBox("Resguardo", { x: 0, y: 0, cx: 3000000, cy: 500000 }))], ["a.pdf", await pdfWithLabel()]];
  for (const [name, buffer] of formats) {
    const up = await service.upload({ companyId: COMPANY, kind: "inventory.custody", file: fileOf(buffer, name) });
    assert.equal(up.template.format, name.split(".")[1]);
  }

  const form = buildMinimalDocx(
    paragraph("Resguardo de equipo") + table([["Nombre del empleado", ""], ["Puesto", ""], ["Fecha", ""]], { headerRow: false }),
  );
  const word = await service.upload({ companyId: COMPANY, kind: "inventory.custody", file: fileOf(form, "formato.docx") });
  const suggestion = await service.suggest({ companyId: COMPANY, templateId: word.template.id, versionId: word.template.version.id });
  const tags = suggestion.applied.map((a) => a.tag);
  assert.ok(tags.includes("receiverName"), `applied: ${tags.join(",")}`);
  assert.ok(tags.includes("receiverJobTitle"));
  assert.ok(tags.includes("date"));
  assert.ok(suggestion.contentBase64.length > 100);
});

test("suggest places tags in an Excel form: label followed by an empty cell, or the empty cell below", async () => {
  const { service } = setup();
  const up = await service.upload({ companyId: COMPANY, kind: "test.record", file: fileOf(await xlsx("Nombre"), "form.xlsx") });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Hoja");
  sheet.addRow(["Nombre:", null, "Fecha"]);
  sheet.addRow([null, null, null]);
  sheet.addRow(["Observaciones", "ya escrito"]);
  const form = await service.upload({ companyId: COMPANY, kind: "test.record", file: fileOf(Buffer.from(await workbook.xlsx.writeBuffer()), "form2.xlsx") });
  const suggestion = await service.suggest({ companyId: COMPANY, templateId: form.template.id, versionId: form.template.version.id });
  assert.equal(suggestion.supported, true);
  assert.equal(suggestion.format, "xlsx");
  assert.deepEqual(suggestion.applied.map((a) => a.tag).sort(), ["date", "name"]);
  assert.match(suggestion.fileName, /\.xlsx$/);
  const result = new ExcelJS.Workbook();
  await result.xlsx.load(Buffer.from(suggestion.contentBase64, "base64"));
  const out = result.getWorksheet("Hoja");
  assert.equal(out.getCell("B1").value, "{{name}}");
  assert.equal(out.getCell("D1").value, "{{date}}");
  assert.ok(up.template.id);
});

test("suggest places tags in a PowerPoint form: underscores, trailing label and label + empty box", async () => {
  const { service } = setup();
  const box = (text, y) => textBox(text, { x: 0, y, cx: 3000000, cy: 400000 });
  const slides = buildMinimalPptx(box("Nombre: ________", 0) + box("Fecha:", 500000) + box("Modelo", 1000000) + box("", 1500000));
  const up = await service.upload({ companyId: COMPANY, kind: "test.record", file: fileOf(slides, "form.pptx") });
  assert.equal(up.template.version.placeholders.length, 0);
  const suggestion = await service.suggest({ companyId: COMPANY, templateId: up.template.id, versionId: up.template.version.id });
  assert.equal(suggestion.supported, true);
  assert.equal(suggestion.format, "pptx");
  assert.deepEqual(suggestion.applied.map((a) => a.tag).sort(), ["date", "name"]);
  const applied = await service.replaceVersionFile({
    companyId: COMPANY, templateId: up.template.id, versionId: up.template.version.id,
    file: fileOf(Buffer.from(suggestion.contentBase64, "base64"), "form (con etiquetas).pptx"),
  });
  assert.deepEqual(applied.template.version.placeholders.sort(), ["date", "name"]);
});
