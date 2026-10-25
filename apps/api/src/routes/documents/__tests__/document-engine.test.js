import assert from "node:assert/strict";
import { test } from "node:test";

import ExcelJS from "exceljs";
import PizZip from "pizzip";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { buildMinimalDocx, paragraph, table } from "../../../services/document-templates/minimal-docx.js";
import { BLANK_PNG } from "../../../services/document-templates/pptx-template.js";
import { extractPdfTextItems } from "../../../services/document-templates/pdf-text-items.js";
import { createDocumentEngine } from "../document-engine.js";
import { createDocumentFileTemplateService } from "../document-file-template-service.js";
import { createKindRegistry } from "../kinds/kind-registry.js";
import { createFakeFiles, createFakePrisma, fileOf } from "./fake-documents-db.js";

const COMPANY = "11111111-1111-7111-8111-111111111111";
const SOURCE = "22222222-2222-7222-8222-222222222222";
// A real 2x2 PNG so docx/xlsx/pdf embedders accept it.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8Dwn4GBgYGJAQoAHhgCAh6X4CYAAAAASUVORK5CYII=", "base64");

function setup({ convert = async () => null, kindOverrides = {} } = {}) {
  const prisma = createFakePrisma();
  const files = createFakeFiles(prisma);
  const kinds = createKindRegistry();
  kinds.register({
    key: "test.record",
    label: "Registro",
    permissionKey: "test.records.read",
    schema: [
      { tag: "name", label: "Nombre", type: "text" },
      { tag: "items", label: "Partidas", type: "list", fields: [{ tag: "model", label: "Modelo", type: "text" }] },
      { tag: "signature", label: "Firma", type: "image" },
    ],
    load: async ({ sourceId }) => ({ name: `Ana ${sourceId.slice(0, 4)}`, person: { fullName: "Ana Mapeada" }, items: [{ model: "A1" }, { model: "B2" }] }),
    ...kindOverrides,
  });
  const templates = createDocumentFileTemplateService({ prisma, files, kinds });
  const engine = createDocumentEngine({ prisma, files, kinds, convert, now: () => new Date("2026-10-25T12:00:00Z") });
  return { prisma, files, kinds, templates, engine };
}

const admin = { companyId: COMPANY, isAdmin: true };
const upload = (templates, buffer, name, extra = {}) =>
  templates.upload({ companyId: COMPANY, kind: "test.record", file: fileOf(buffer, name), publish: true, ...extra });

async function xlsxBuffer(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Hoja");
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const docxText = (buffer) => new PizZip(buffer).file("word/document.xml").asText().replace(/<[^>]+>/g, " ");

test("fills docx, xlsx, pptx and pdf templates and records a GeneratedDocument", async () => {
  const { templates, engine, prisma, files } = setup();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([612, 792]).drawText("Nombre:", { x: 60, y: 700, size: 12, font: await pdfDoc.embedFont(StandardFonts.Helvetica) });
  const { buildMinimalPptx, textBox } = await import("../../../services/document-templates/minimal-pptx.js");
  const cases = {
    docx: buildMinimalDocx(paragraph("Hola {{name}}")),
    xlsx: await xlsxBuffer([["Hola {{name}}"]]),
    pptx: buildMinimalPptx(textBox("Hola {{name}}", { x: 0, y: 0, cx: 3000000, cy: 500000 })),
    pdf: Buffer.from(await pdfDoc.save()),
  };
  for (const [format, buffer] of Object.entries(cases)) {
    const { template } = await upload(templates, buffer, `t.${format}`);
    const result = await engine.generate({ ...admin, kind: "test.record", templateId: template.id, sourceId: SOURCE });
    assert.equal(result.format, format);
    assert.equal(result.generated.status, "ready");
    assert.equal(result.generated.templateId, template.id);
    const stored = files.blobs.get(result.fileAssetId);
    if (format === "docx") assert.match(docxText(stored), /Hola Ana 2222/);
    if (format === "pdf") assert.ok((await extractPdfTextItems(stored)).items.some((i) => i.str.includes("Ana 2222")));
  }
  assert.equal(prisma.generatedDocument.rows.length, 4);
});

test("template choice: chosen, then company default, then the kind built-in, else a clear error", async () => {
  const builtIn = buildMinimalDocx(paragraph("Integrada {{name}}"));
  const { templates, engine, files } = setup({ kindOverrides: { defaultTemplate: () => ({ format: "docx", buffer: builtIn }) } });
  const text = async (input) => docxText(files.blobs.get((await engine.generate({ ...admin, kind: "test.record", sourceId: SOURCE, ...input })).fileAssetId));
  assert.match(await text({}), /Integrada/);
  const first = await upload(templates, buildMinimalDocx(paragraph("Predeterminada {{name}}")), "a.docx");
  const second = await upload(templates, buildMinimalDocx(paragraph("Elegida {{name}}")), "b.docx");
  assert.equal(first.template.isDefault, true);
  assert.match(await text({}), /Predeterminada/);
  assert.match(await text({ templateId: second.template.id }), /Elegida/);

  const bare = setup();
  await assert.rejects(bare.engine.generate({ ...admin, kind: "test.record", sourceId: SOURCE }), (err) => err.status === 404 && /plantilla/.test(err.message));
});

test("output pdf converts when Office is available, otherwise returns the native file flagged converted:false", async () => {
  const fakePdf = Buffer.from("%PDF-1.4 convertido");
  const withOffice = setup({ convert: async () => fakePdf });
  await upload(withOffice.templates, buildMinimalDocx(paragraph("{{name}}")), "a.docx");
  const pdf = await withOffice.engine.generate({ ...admin, kind: "test.record", sourceId: SOURCE, output: "pdf" });
  assert.deepEqual([pdf.format, pdf.converted, pdf.generated.outputFormat], ["pdf", true, "pdf"]);

  const noOffice = setup();
  await upload(noOffice.templates, buildMinimalDocx(paragraph("{{name}}")), "a.docx");
  const native = await noOffice.engine.generate({ ...admin, kind: "test.record", sourceId: SOURCE, output: "pdf" });
  assert.deepEqual([native.format, native.converted], ["docx", false]);
});

test("places image fields (signatures) in docx, xlsx and pdf", async () => {
  const { templates, engine, files } = setup();
  const images = { signature: PNG };
  const word = await upload(templates, buildMinimalDocx(paragraph("{{%signature}}")), "a.docx");
  const wordOut = await engine.generate({ ...admin, kind: "test.record", templateId: word.template.id, sourceId: SOURCE, images });
  assert.ok(Object.keys(new PizZip(files.blobs.get(wordOut.fileAssetId)).files).some((n) => n.startsWith("word/media/")));

  const sheet = await upload(templates, await xlsxBuffer([["{{%signature}}"]]), "a.xlsx");
  const sheetOut = await engine.generate({ ...admin, kind: "test.record", templateId: sheet.template.id, sourceId: SOURCE, images });
  assert.ok(Object.keys(new PizZip(files.blobs.get(sheetOut.fileAssetId)).files).some((n) => n.startsWith("xl/media/")));

  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const pdfBytes = Buffer.from(await doc.save());
  const pdf = await upload(templates, pdfBytes, "a.pdf");
  const layout = { page: { width: 612, height: 792 }, fields: [{ key: "signature", x: 50, y: 600, w: 120, h: 60 }] };
  const draft = await templates.replaceVersionFile({ companyId: COMPANY, templateId: pdf.template.id, versionId: pdf.template.version.id });
  await templates.saveMapping({ companyId: COMPANY, templateId: pdf.template.id, versionId: draft.template.version.id, layout });
  await templates.publishVersion({ companyId: COMPANY, templateId: pdf.template.id, versionId: draft.template.version.id });
  const pdfOut = await engine.generate({ ...admin, kind: "test.record", templateId: pdf.template.id, sourceId: SOURCE, images });
  assert.match(files.blobs.get(pdfOut.fileAssetId).toString("latin1"), /\/Subtype\s*\/Image/);
});

test("list fields repeat rows (xlsx loop row, docx loop) and the mapping feeds tags from data paths", async () => {
  const { templates, engine, files } = setup();
  const sheet = await upload(templates, await xlsxBuffer([["Modelo"], ["{{#items}}{{model}}{{/items}}"]]), "a.xlsx");
  const sheetOut = await engine.generate({ ...admin, kind: "test.record", templateId: sheet.template.id, sourceId: SOURCE });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(files.blobs.get(sheetOut.fileAssetId));
  assert.deepEqual(workbook.worksheets[0].getColumn(1).values.slice(1), ["Modelo", "A1", "B2"]);

  const word = await upload(templates, buildMinimalDocx(table([["Modelo"], ["{{#items}}{{model}}{{/items}}"]]) + paragraph("Para {{custom}}")), "a.docx");
  const version = word.template.version;
  assert.ok(word.template.version.placeholders.includes("custom"));
  const draft = await templates.replaceVersionFile({ companyId: COMPANY, templateId: word.template.id, versionId: version.id });
  await templates.saveMapping({ companyId: COMPANY, templateId: word.template.id, versionId: draft.template.version.id, mapping: { custom: "person.fullName" } });
  await templates.publishVersion({ companyId: COMPANY, templateId: word.template.id, versionId: draft.template.version.id });
  const out = await engine.generate({ ...admin, kind: "test.record", templateId: word.template.id, sourceId: SOURCE });
  const text = docxText(files.blobs.get(out.fileAssetId));
  assert.match(text, /A1/);
  assert.match(text, /B2/);
  assert.match(text, /Para Ana Mapeada/);
});

test("checks the kind permission as the acting user and previews with sample data", async () => {
  const { templates, engine } = setup();
  await upload(templates, buildMinimalDocx(paragraph("{{name}}")), "a.docx");
  await assert.rejects(engine.generate({ companyId: COMPANY, kind: "test.record", sourceId: SOURCE, permissions: [] }), (err) => err.status === 403);
  await engine.generate({ companyId: COMPANY, kind: "test.record", sourceId: SOURCE, permissions: ["test.records.read"] });
  const preview = await engine.preview({ companyId: COMPANY, kind: "test.record", permissions: ["test.records.read"] });
  assert.match(docxText(preview.buffer), /Nombre de ejemplo/);
  assert.equal(preview.format, "docx");
});
