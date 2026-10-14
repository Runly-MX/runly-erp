// Document template engines (docx + xlsx) with synthetic templates built in-test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import PizZip from 'pizzip';
import ExcelJS from 'exceljs';
import { inspectDocx, renderDocx } from '../document-templates/docx-template.js';
import { inspectXlsx, renderXlsx } from '../document-templates/xlsx-template.js';
import { buildMinimalDocx, paragraph, table } from '../document-templates/minimal-docx.js';
import {
  buildCustodyTemplateData, buildDefaultCustodyTemplate, inspectCustodyTemplate, unknownCustodyTags,
} from '../document-templates/custody-template-data.js';
import { TemplateError } from '../document-templates/template-tags.js';

// 1x1 transparent PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const custody = {
  folio: 'RES-2026-0007',
  kind: 'DELIVERY',
  date: new Date('2026-03-05T00:00:00Z'),
  comments: 'Equipo nuevo',
  delivererName: 'Persona Entrega',
  employee: { firstName: 'Ana', lastName: 'Ejemplo', employeeCode: 'E-01', department: 'Sistemas', jobTitle: 'Analista', workEmail: 'ana@example.com' },
  items: [
    { typeBrand: 'Laptop Marca', model: 'M1', serialNumber: 'SN-1', assetTag: 'A-1', invoiceNumber: 'F-1', features: '16 GB' },
    { typeBrand: 'Monitor Marca', model: 'M2', serialNumber: 'SN-2', assetTag: 'A-2', invoiceNumber: 'F-2', features: '' },
    { typeBrand: 'Teclado Marca', model: 'M3', serialNumber: 'SN-3', assetTag: 'A-3', invoiceNumber: '', features: '' },
  ],
};
const company = { name: 'Empresa Demo', legalName: 'Empresa Demo SA', rfc: 'XAXX010101000' };

const documentText = (buffer) => new PizZip(buffer).file('word/document.xml').asText().replace(/<[^>]+>/g, '');

describe('docx template engine', () => {
  const template = buildMinimalDocx([
    paragraph('Folio {{folio}} {{date}} {{company.name}} {{unknownThing}}'),
    table([['Serie', 'Modelo'], ['{{#items}}{{serialNumber}}', '{{model}}{{/items}}']]),
    paragraph('{{%receiverSignature}}'),
  ].join(''));

  it('inspect returns tags with loop scope', () => {
    const { tags } = inspectDocx(template);
    assert.ok(tags.includes('folio'));
    assert.ok(tags.includes('company.name'));
    assert.ok(tags.includes('#items'));
    assert.ok(tags.includes('items.serialNumber'));
    assert.ok(tags.includes('%receiverSignature'));
  });

  it('renders scalars, expands loops and embeds the signature', () => {
    const data = buildCustodyTemplateData({ custody, company, hasReceiverSignature: true });
    const out = renderDocx(template, data, { images: { receiverSignature: PNG } });
    const textOut = documentText(out);
    assert.ok(!textOut.includes('{{'));
    assert.ok(textOut.includes('RES-2026-0007'));
    assert.ok(textOut.includes('05/03/2026'));
    assert.ok(textOut.includes('Empresa Demo'));
    for (const serial of ['SN-1', 'SN-2', 'SN-3']) assert.ok(textOut.includes(serial));
    assert.ok(Object.keys(new PizZip(out).files).some((name) => name.startsWith('word/media/')));
  });

  it('rejects a malformed template', () => {
    const broken = buildMinimalDocx(paragraph('{{#items}} sin cierre'));
    assert.throws(() => inspectDocx(broken), TemplateError);
  });

  it('built-in template renders without leftovers and pads to minRows', () => {
    const data = buildCustodyTemplateData({ custody: { ...custody, items: [custody.items[0]] }, company });
    assert.equal(data.items.length, 2);
    const textOut = documentText(renderDocx(buildDefaultCustodyTemplate(), data));
    assert.ok(!textOut.includes('{{'));
    assert.ok(textOut.includes('Ana Ejemplo'));
  });
});

describe('xlsx template engine', () => {
  async function xlsxTemplate() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Resguardo');
    sheet.getCell('A1').value = 'Folio {{folio}}';
    sheet.getCell('B1').value = '{{receiverName}}';
    sheet.getCell('A3').value = '{{#items}}{{assetNumber}}';
    sheet.getCell('B3').value = '{{serialNumber}}{{/items}}';
    sheet.getCell('A5').value = 'Firma';
    sheet.getCell('A6').value = '{{%receiverSignature}}';
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  it('inspect returns tags', async () => {
    const { tags } = await inspectXlsx(await xlsxTemplate());
    assert.deepEqual(tags.sort(), ['#items', '%receiverSignature', 'folio', 'items.assetNumber', 'items.serialNumber', 'receiverName'].sort());
  });

  it('repeats the item row, fills scalars and places the image', async () => {
    const data = buildCustodyTemplateData({ custody, company, hasReceiverSignature: true });
    const out = await renderXlsx(await xlsxTemplate(), data, { images: { receiverSignature: PNG } });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(out);
    const sheet = workbook.getWorksheet('Resguardo');
    assert.equal(sheet.getCell('A1').value, 'Folio RES-2026-0007');
    assert.equal(sheet.getCell('A3').value, 'A-1');
    assert.equal(sheet.getCell('B5').value, 'SN-3');
    assert.equal(sheet.getCell('A7').value, 'Firma');
    sheet.eachRow((row) => row.eachCell((cell) => assert.ok(!String(cell.value ?? '').includes('{{'))));
    assert.equal(sheet.getImages().length, 1);
  });
});

describe('custody template contract', () => {
  it('warns on unknown tags only', async () => {
    assert.deepEqual(unknownCustodyTags(['folio', 'items.model', 'items.folio', '%receiverSignature', 'nope', 'items.nope', '#other']), ['nope', 'items.nope', '#other']);
    const result = await inspectCustodyTemplate(buildMinimalDocx(paragraph('{{folio}} {{foo}}')), 'docx');
    assert.deepEqual(result.warnings, ['Etiqueta desconocida: {{foo}}']);
  });
});
