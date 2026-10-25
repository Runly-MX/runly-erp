import assert from "node:assert/strict";
import { test } from "node:test";

import PizZip from "pizzip";

import { buildMinimalDocx, paragraph } from "../../../services/document-templates/minimal-docx.js";
import { createDocumentEngine } from "../document-engine.js";
import { createDocumentFileTemplateService } from "../document-file-template-service.js";
import { createGeneralManualDocumentKind } from "../kinds/general-manual-kind.js";
import { createKindRegistry } from "../kinds/kind-registry.js";
import { createFakeFiles, createFakePrisma, fileOf } from "./fake-documents-db.js";

const COMPANY = "11111111-1111-7111-8111-111111111111";
const text = (buffer) => new PizZip(buffer).file("word/document.xml").asText().replace(/<[^>]+>/g, " ");

function setup() {
  const prisma = createFakePrisma();
  const files = createFakeFiles(prisma);
  const kinds = createKindRegistry();
  kinds.register(createGeneralManualDocumentKind());
  return {
    kinds,
    templates: createDocumentFileTemplateService({ prisma, files, kinds }),
    engine: createDocumentEngine({ prisma, files, kinds }),
  };
}

test("general.manual accepts any tag without warnings and is filled with caller values", async () => {
  const { templates, engine } = setup();
  const file = fileOf(buildMinimalDocx(paragraph("Hola {{cliente}}, total {{monto}}")), "carta.docx");
  const { template, warnings } = await templates.upload({ companyId: COMPANY, kind: "general.manual", file, publish: true, visibility: "company", isDefault: true });
  assert.deepEqual(template.version.placeholders.sort(), ["cliente", "monto"]);
  assert.equal(warnings.length, 0);

  const user = { companyId: COMPANY, kind: "general.manual", permissions: ["documents.templates.read"], isAdmin: false };
  const out = await engine.generate({ ...user, data: { cliente: "Ana", monto: "100" } });
  assert.match(text(out.buffer), /Hola Ana, total 100/);
  const preview = await engine.preview(user);
  assert.match(text(preview.buffer), /\[cliente\]/);
  await assert.rejects(engine.generate({ ...user, permissions: [], data: {} }), /permiso/);
});

test("general.manual declares free tags and an empty load", async () => {
  const kind = createGeneralManualDocumentKind();
  assert.equal(kind.freeTags, true);
  assert.deepEqual(kind.schema, []);
  assert.deepEqual(await kind.load(), {});
});
