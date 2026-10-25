import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractPdfTextItems } from '../document-templates/pdf-text-items.js';
import { detectPdfFields, fillPdf, inspectPdf } from '../document-templates/pdf-template.js';

const PAGE = { width: 612, height: 792 };

async function formPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([PAGE.width, PAGE.height]);
  page.drawText('Nombre:', { x: 60, y: 700, size: 12, font });
  page.drawText('Fecha:', { x: 60, y: 660, size: 12, font });
  return Buffer.from(await doc.save());
}

test('detectPdfFields finds a box next to a "Nombre:" label', async () => {
  const result = await detectPdfFields(await formPdf(), { labels: { nombre: 'name' }, important: ['name'] });
  assert.equal(result.fields.length, 1);
  const [box] = result.fields;
  assert.equal(box.key, 'name');
  assert.ok(box.x > 60 && box.w > 40 && box.h > 0 && box.fontSize >= 8);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.page, PAGE);
});

test('fillPdf writes the value text at the box and rejects non-PDF input', async () => {
  const pdf = await formPdf();
  const { fields } = await detectPdfFields(pdf, { labels: { nombre: 'name' } });
  const out = await fillPdf({ buffer: pdf, layout: { page: PAGE, fields }, data: { name: 'María Pérez' } });
  const { items } = await extractPdfTextItems(out);
  assert.ok(items.some((item) => item.str.includes('María Pérez')));
  await assert.rejects(() => inspectPdf(Buffer.from('hola'), 'x.pdf'), /PDF válido/);
});
