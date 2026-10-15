// inventory-labels.test.js — layout model and ZPL/PDF/PNG rendering (pure, no DB).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLayout, selectLines, expandQueue, renderLabels, createPlaceholderQrUrl, embeddedQrText, DEFAULT_TEMPLATES,
} from '../inventory-labels/index.js';

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
