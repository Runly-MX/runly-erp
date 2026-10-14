import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import PizZip from 'pizzip';
import { buildMinimalDocx, paragraph, table } from '../document-templates/minimal-docx.js';
import { suggestDocxTags } from '../document-templates/docx-autotag.js';
import { inspectDocx } from '../document-templates/docx-template.js';

const documentXml = (buffer) => new PizZip(buffer).file('word/document.xml').asText();

// A blank company form: labels with empty cells, an equipment table with spare
// empty rows, a comments section and two signature labels.
function blankForm() {
  return buildMinimalDocx([
    table([['Resguardo de equipo', 'Fecha:', '']], { headerRow: false }),
    table([
      ['Nombre', ''],
      ['Número de empleado', ''],
      ['Área de adscripción', ''],
    ], { headerRow: false }),
    table([
      ['Tipo / Marca', 'Modelo', 'Serie', 'Núm. Activo', 'Factura', 'Características'],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', ''],
    ]),
    table([['Comentarios'], ['']], { headerRow: false }),
    paragraph('Puesto: ________'),
    table([['', ''], ['Recibí equipo', 'Entrega']], { headerRow: false }),
  ].join(''));
}

describe('suggestDocxTags', () => {
  it('places scalar, item loop and signature tags in a blank form', () => {
    const { buffer, applied, missing } = suggestDocxTags(blankForm());
    const tags = applied.map((a) => a.tag);
    for (const tag of ['date', 'receiverName', 'receiverEmployeeNumber', 'receiverDepartment', 'comments', 'receiverJobTitle',
      'typeBrand', 'model', 'serialNumber', 'assetNumber', 'invoiceNumber', 'features', '#items', 'receiverSignature', 'delivererSignature']) {
      assert.ok(tags.includes(tag), `missing ${tag}`);
    }
    assert.deepEqual(missing, []);
    const xml = documentXml(buffer);
    assert.ok(xml.includes('{{#items}}{{typeBrand}}'));
    assert.ok(xml.includes('{{features}}{{/items}}'));
    assert.ok(xml.includes('Puesto: {{receiverJobTitle}}'));
    // The two spare empty equipment rows are removed; the loop row grows the table.
    assert.equal((xml.match(/\{\{model\}\}/g) ?? []).length, 1);
    // The result is a valid template docxtemplater can compile.
    const inspected = inspectDocx(buffer);
    assert.ok((inspected.tags ?? inspected).includes('%receiverSignature'));
  });

  it('refuses templates that already have tags and reports what it cannot place', () => {
    const tagged = buildMinimalDocx(paragraph('Fecha {{date}}'));
    assert.throws(() => suggestDocxTags(tagged), /ya tiene etiquetas/);
    const nothing = suggestDocxTags(buildMinimalDocx(paragraph('Texto libre sin campos')));
    assert.deepEqual(nothing.applied, []);
    assert.ok(nothing.missing.includes('#items'));
  });
});
