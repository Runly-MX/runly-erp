// Inventory custody on the documents hub: kind contract, rendering through
// hub.engine (built-in default, company default, missing template fallback,
// native file when Office is not configured) and the deprecated templates proxy.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import PizZip from 'pizzip';
import { createDocumentEngine } from '../../routes/documents/document-engine.js';
import { createDocumentFileTemplateService } from '../../routes/documents/document-file-template-service.js';
import { createKindRegistry } from '../../routes/documents/kinds/kind-registry.js';
import { createInventoryCustodyDocumentKind, INVENTORY_CUSTODY_SCHEMA } from '../../routes/documents/kinds/inventory-custody-kind.js';
import { scanTemplate } from '../../routes/documents/document-template-files.js';
import { createFakeFiles, createFakePrisma, fileOf } from '../../routes/documents/__tests__/fake-documents-db.js';
import { buildDefaultCustodyTemplate, CUSTODY_IMAGE_TAGS, CUSTODY_ITEM_TAGS, CUSTODY_SCALAR_TAGS } from '../document-templates/custody-template-data.js';
import { buildMinimalDocx, paragraph } from '../document-templates/minimal-docx.js';
import { createCustodyDocumentRenderer } from '../inventory-custody-document.js';
import { createInventoryDocumentTemplateService } from '../inventory-document-template-service.js';
import { serializeCustody } from '../inventory-custody-service.js';

const COMPANY = '01900000-0000-7000-8000-0000000000c1';
const text = (buffer) => new PizZip(buffer).file('word/document.xml').asText().replace(/<[^>]+>/g, ' ');
const CUSTODY = {
  id: '01900000-0000-7000-8000-0000000000d1', companyId: COMPANY, folio: 'RES-2026-0009', kind: 'DELIVERY',
  date: new Date(Date.UTC(2026, 2, 5)), comments: 'Sin novedades', delivererName: 'Ana',
  employee: { firstName: 'Luis', lastName: 'Perez' },
  items: [{ itemId: 'i1', typeBrand: 'Laptop', model: 'ZX', serialNumber: 'S1', assetTag: 'A1' }],
};

function setup({ convert = async () => null } = {}) {
  const prisma = createFakePrisma();
  prisma.company = { findUnique: async () => ({ name: 'Acme', legalName: 'Acme SA', rfc: 'XAXX' }) };
  const files = createFakeFiles(prisma);
  const kinds = createKindRegistry();
  kinds.register(createInventoryCustodyDocumentKind({ prisma }));
  const engine = createDocumentEngine({ prisma, files, kinds, convert });
  const fileTemplates = createDocumentFileTemplateService({ prisma, files, kinds });
  const custodyFiles = { findAsset: async () => null, read: async () => null };
  const renderer = createCustodyDocumentRenderer({ prisma, files: custodyFiles, engine });
  return { prisma, files, kinds, engine, fileTemplates, renderer };
}

describe('inventory.custody kind', () => {
  it('exposes the existing tag contract as its schema', () => {
    const tags = INVENTORY_CUSTODY_SCHEMA.map((e) => e.tag);
    for (const tag of [...CUSTODY_SCALAR_TAGS, 'items', ...CUSTODY_IMAGE_TAGS]) assert.ok(tags.includes(tag), tag);
    const items = INVENTORY_CUSTODY_SCHEMA.find((e) => e.tag === 'items');
    assert.deepEqual(items.fields.map((f) => f.tag), CUSTODY_ITEM_TAGS);
    assert.deepEqual(INVENTORY_CUSTODY_SCHEMA.filter((e) => e.type === 'image').map((e) => e.tag), CUSTODY_IMAGE_TAGS);
  });

  it('the built-in default template has no unknown tags for the kind', async () => {
    const { kinds } = setup();
    const scanned = await scanTemplate('docx', buildDefaultCustodyTemplate(), kinds.getKind('inventory.custody'));
    assert.deepEqual(scanned.unknown, []);
  });

  it('suggests tags with the custody vocabulary', async () => {
    const { fileTemplates } = setup();
    const form = buildMinimalDocx(paragraph('Folio:') + paragraph('Fecha:'));
    const { template } = await fileTemplates.upload({ companyId: COMPANY, kind: 'inventory.custody', file: fileOf(form, 'form.docx'), publish: true });
    const result = await fileTemplates.suggest({ companyId: COMPANY, templateId: template.id, versionId: template.version.id });
    assert.equal(result.supported, true);
    assert.ok(Array.isArray(result.applied));
  });
});

describe('custody document rendering through the hub', () => {
  it('uses the built-in default and keeps the native file when Office is not configured', async () => {
    const { renderer } = setup();
    const doc = await renderer.render(CUSTODY, { pdf: true });
    assert.equal(doc.format, 'docx');
    assert.equal(doc.fileName, 'Resguardo RES-2026-0009.docx');
    assert.match(text(doc.buffer), /RES-2026-0009/);
    assert.match(text(doc.buffer), /Luis Perez/);
  });

  it('returns the PDF when conversion succeeds', async () => {
    const { renderer } = setup({ convert: async () => Buffer.from('%PDF-1.4 x') });
    const doc = await renderer.render(CUSTODY, { pdf: true });
    assert.equal(doc.format, 'pdf');
    assert.equal(doc.mimeType, 'application/pdf');
  });

  it('uses the chosen company template and falls back to the company default when it is gone', async () => {
    const { renderer, fileTemplates } = setup();
    const own = buildMinimalDocx(paragraph('Documento propio {{folio}}'));
    const { template } = await fileTemplates.upload({ companyId: COMPANY, kind: 'inventory.custody', file: fileOf(own, 'propio.docx'), publish: true });
    const chosen = await renderer.render({ ...CUSTODY, documentTemplateId: template.id });
    assert.match(text(chosen.buffer), /Documento propio RES-2026-0009/);
    const missing = await renderer.render({ ...CUSTODY, documentTemplateId: '01900000-0000-7000-8000-0000000000ff' });
    assert.match(text(missing.buffer), /Documento propio/);
  });

  it('generate records a GeneratedDocument for the custody', async () => {
    const { renderer, prisma } = setup();
    await renderer.render(CUSTODY, { record: true });
    assert.equal(prisma.generatedDocument.rows.length, 1);
    assert.equal(prisma.generatedDocument.rows[0].kind, 'inventory.custody');
    assert.equal(prisma.generatedDocument.rows[0].sourceId, CUSTODY.id);
  });
});

describe('deprecated templates proxy and custody serialization', () => {
  it('lists, uploads and soft-deletes through the hub with the old shape', async () => {
    const { prisma, fileTemplates } = setup();
    const service = createInventoryDocumentTemplateService({ prisma, hub: { fileTemplates } });
    const upload = await service.upload({ companyId: COMPANY, file: fileOf(buildDefaultCustodyTemplate(), 'mi.docx'), name: 'Mi formato' });
    assert.equal(upload.template.kind, 'custody');
    assert.equal(upload.template.isDefault, true);
    assert.deepEqual(upload.warnings, []);
    assert.equal((await service.list(COMPANY)).length, 1);
    await service.remove(upload.template.id, COMPANY);
    assert.equal((await service.list(COMPANY)).length, 0);
  });

  it('keeps templateId and template in the custody API from the hub columns', () => {
    const out = serializeCustody({ id: '1', items: [], documentTemplateId: 't1', documentTemplate: { id: 't1', name: 'X' } });
    assert.equal(out.templateId, 't1');
    assert.equal(out.template.name, 'X');
    assert.equal('documentTemplate' in out, false);
  });
});
