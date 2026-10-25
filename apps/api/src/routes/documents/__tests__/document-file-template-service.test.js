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

test("suggest tags a docx from the kind labels and explains xlsx/pptx; mapping is saved on drafts only", async () => {
  const { service } = setup();
  const word = await service.upload({ companyId: COMPANY, kind: "test.record", file: fileOf(docx("Nombre: ________"), "a.docx") });
  const suggestion = await service.suggest({ companyId: COMPANY, templateId: word.template.id, versionId: word.template.version.id });
  assert.equal(suggestion.supported, true);
  assert.deepEqual(suggestion.applied.map((a) => a.tag), ["name"]);
  const sheet = await service.upload({ companyId: COMPANY, kind: "test.record", file: fileOf(await xlsx("{{name}}"), "a.xlsx") });
  const none = await service.suggest({ companyId: COMPANY, templateId: sheet.template.id, versionId: sheet.template.version.id });
  assert.equal(none.supported, false);
  assert.match(none.message, /xlsx/);
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
  await assert.rejects(service.replaceVersionFile({ companyId: COMPANY, templateId: up.template.id, versionId: up.template.version.id, file: fileOf(await xlsx("x"), "c.xlsx") }), /es \.docx/);
});
