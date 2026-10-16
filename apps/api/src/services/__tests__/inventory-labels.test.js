// inventory-labels.test.js — layout model and ZPL/PDF/PNG rendering (pure, no DB).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLayout, normalizeSheet, selectLines, expandQueue, renderLabels, createPlaceholderQrUrl, embeddedQrText, DEFAULT_TEMPLATES,
} from '../inventory-labels/index.js';
import { computeGeometry } from '../inventory-labels/geometry.js';
import { sheetCells } from '../inventory-labels/pdf.js';

const item = (id, extra = {}) => ({
  id, folio: `TEL-CIS-CP7-${id}`, name: 'Telefono IP', serialNumber: 'SN123', model: 'CP7821', locationName: 'Oficina', assetTag: null, ...extra,
});
const resolveItemQrUrl = createPlaceholderQrUrl('https://erp.example.com/');

describe('label layout', () => {
  it('applies presets, keeps field order and drops duplicates', () => {
    const layout = normalizeLayout({ preset: '50x25', fields: ['serial', 'folio', 'serial'] });
    assert.equal(layout.widthMm, 50);
    assert.equal(layout.heightMm, 25);
    assert.deepEqual(layout.fields, ['serial', 'folio']);
    assert.equal(layout.qrOptions.errorCorrection, 'M');
  });

  it('rejects unknown fields, layouts and sizes', () => {
    assert.throws(() => normalizeLayout({ preset: '50x25', fields: ['nope'] }), /Campo de etiqueta/);
    assert.throws(() => normalizeLayout({ preset: '50x25', layout: 'diagonal' }), /Distribución/);
    assert.throws(() => normalizeLayout({ widthMm: 1, heightMm: 25 }), /ancho/);
  });

  it('selects only non-empty fields in template order', () => {
    const layout = normalizeLayout({ preset: '60x40', fields: ['folio', 'assetTag', 'serial', 'company'] });
    const lines = selectLines(layout, item('1'), { companyName: 'Acme' });
    assert.deepEqual(lines.map((l) => l.key), ['folio', 'serial', 'company']);
    assert.equal(lines[1].text, 'S/N SN123');
  });

  it('ships three default templates with valid layouts', () => {
    assert.equal(DEFAULT_TEMPLATES.length, 3);
    for (const t of DEFAULT_TEMPLATES) assert.doesNotThrow(() => normalizeLayout(t));
  });

  it('expands quantities per row and skips unknown items', () => {
    const items = [item('1'), item('2')];
    const labels = expandQueue([{ itemId: '1', quantity: 2 }, { itemId: '2' }, { itemId: 'x', quantity: 5 }], items);
    assert.deepEqual(labels.map((l) => l.id), ['1', '1', '2']);
    assert.throws(() => expandQueue([{ itemId: '1', quantity: 500 }, { itemId: '2', quantity: 500 }, { itemId: '1', quantity: 500 }], items), /Máximo/);
  });
});

describe('QR content', () => {
  it('uses the injected resolver and the embedded folio|serial|model mode', () => {
    assert.equal(resolveItemQrUrl(item('7')), 'https://erp.example.com/app/p/inv/f-TEL-CIS-CP7-7');
    assert.equal(embeddedQrText(item('7')), 'TEL-CIS-CP7-7|SN123|CP7821');
  });
});

describe('label rendering', () => {
  const layout = normalizeLayout({ preset: '60x40', layout: 'qr-left', fields: ['folio', 'name'] });
  const base = { layout, items: [item('1')], companyName: 'Acme', resolveItemQrUrl };

  it('emits ZPL with exact dimensions, native QR, text and quantity', async () => {
    const out = await renderLabels({ ...base, format: 'zpl', rows: [{ itemId: '1', quantity: 3 }] });
    const zpl = out.body;
    assert.equal(out.labelCount, 3);
    assert.match(zpl, /^\^XA\n\^CI28\n\^PW480\n\^LL320\n/); // 60x40 mm at 203 dpi
    assert.match(zpl, /\^BQN,2,\d+/);
    assert.match(zpl, /\^FDMA,https:\/\/erp\.example\.com\/app\/p\/inv\/f-TEL-CIS-CP7-1\^FS/);
    assert.match(zpl, /\^FDTEL-CIS-CP7-1\^FS/);
    assert.match(zpl, /\^PQ3,0,1,N\n\^XZ$/);
  });

  it('text-only layout omits the QR', async () => {
    const textOnly = normalizeLayout({ preset: '50x25', layout: 'text-only', fields: ['folio'] });
    const out = await renderLabels({ ...base, layout: textOnly, format: 'zpl', rows: [{ itemId: '1', quantity: 1 }] });
    assert.doesNotMatch(out.body, /\^BQ/);
  });

  it('renders a PDF page per label and a PNG preview', async () => {
    const pdf = await renderLabels({ ...base, format: 'pdf', rows: [{ itemId: '1', quantity: 2 }] });
    assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-');
    assert.equal((pdf.body.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length, 2);
    const png = await renderLabels({ ...base, format: 'png', rows: [{ itemId: '1', quantity: 1 }] });
    assert.deepEqual([...png.body.subarray(1, 4)], [0x50, 0x4e, 0x47]);
  });

  it('rejects an empty queue and unknown formats', async () => {
    await assert.rejects(renderLabels({ ...base, format: 'zpl', rows: [{ itemId: 'zzz' }] }), /No hay equipos/);
    await assert.rejects(renderLabels({ ...base, format: 'gif', rows: [{ itemId: '1' }] }), /Formato/);
  });
});

describe('studio options (text, qr-only, sheet)', () => {
  it('prints field names and a fixed font size, and flags overflow', () => {
    const layout = normalizeLayout({ preset: '50x25', fields: ['folio', 'serial'], textOptions: { showFieldNames: true, fontMm: 3 } });
    const lines = selectLines(layout, item('1'), {});
    assert.deepEqual(lines.map((l) => l.text), ['Folio: TEL-CIS-CP7-1', 'Serie: SN123']);
    const fine = computeGeometry(layout, lines, 'x');
    assert.ok(fine.text[1].fontMm <= 3);
    const long = computeGeometry(layout, [{ key: 'name', text: 'Nombre larguisimo '.repeat(6) }], 'x');
    assert.ok(long.overflow > 0);
    assert.throws(() => normalizeLayout({ preset: '50x25', textOptions: { fontMm: 40 } }), /tamaño del texto/);
  });

  it('qr-only centres the code and prints no text', () => {
    const layout = normalizeLayout({ preset: '50x25', layout: 'qr-only', fields: ['folio'] });
    assert.deepEqual(selectLines(layout, item('1'), {}), []);
    const g = computeGeometry(layout, [], 'https://x');
    assert.equal(g.text.length, 0);
    assert.ok(Math.abs(g.qr.x + g.qr.size / 2 - 25) < 0.01);
  });

  it('validates the letter sheet and lays the grid centred from the top margin', () => {
    assert.equal(normalizeSheet(null, { widthMm: 60, heightMm: 40 }), null);
    const sheet = normalizeSheet({ columns: 3, rows: 6, gapMm: 3, marginMm: 8 }, { widthMm: 60, heightMm: 40 });
    const cells = sheetCells(sheet, 60, 40);
    assert.equal(cells.length, 18);
    assert.ok(Math.abs(cells[0].x - (215.9 - 186) / 2) < 0.001);
    assert.equal(cells[3].y, 8 + 43);
    assert.throws(() => normalizeSheet({ columns: 4, rows: 1, gapMm: 3, marginMm: 8 }, { widthMm: 60, heightMm: 40 }), /ancho/);
  });

  it('renders a multi-page letter PDF only for the pdf format', async () => {
    const layout = normalizeLayout({ preset: '60x40', fields: ['folio'] });
    const base = { layout, items: [item('1')], companyName: 'Acme', resolveItemQrUrl };
    const pdf = await renderLabels({ ...base, format: 'pdf', rows: [{ itemId: '1', quantity: 7 }], sheet: { columns: 3, rows: 2, gapMm: 2, marginMm: 5 } });
    assert.equal((pdf.body.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length, 2);
    assert.equal(pdf.overflow, 0);
  });
});
