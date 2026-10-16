// inventory-labels-text.test.js — uniform, wrapping label text (2026-10-15):
// every selected field is printed, long values wrap instead of being cut, one
// font size for all rows, and textOptions.fontMm is honoured.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLayout, renderLabels, selectLines, createPlaceholderQrUrl } from '../inventory-labels/index.js';
import { computeGeometry } from '../inventory-labels/geometry.js';
import { TEXT_FLOOR_MM, wrapText } from '@runly/core/labels';

const ITEM = { id: '1', folio: 'INV-000123', serialNumber: 'NC312399U23-XK44-2209-ABCDEF', assetTag: '4501-2233' };
const layoutFor = (raw = {}) => normalizeLayout({ preset: '60x40', layout: 'qr-left', fields: ['folio', 'serial', 'assetTag'], ...raw });
const build = (raw) => {
  const layout = layoutFor(raw);
  return computeGeometry(layout, selectLines(layout, ITEM, {}), 'https://erp.example.com/app/p/inv/abc');
};
const joined = (g, key) => g.text.filter((t) => t.key === key).map((t) => t.text).join(' ');

describe('label text', () => {
  it('renders every selected field and wraps long values without losing characters', () => {
    const g = build({});
    assert.deepEqual([...new Set(g.text.map((t) => t.key))], ['folio', 'serial', 'assetTag']);
    assert.equal(g.overflow, 0);
    assert.equal(joined(g, 'serial').replace(/ /g, ''), 'S/NNC312399U23-XK44-2209-ABCDEF');
    assert.ok(g.text.filter((t) => t.key === 'serial').length > 1, 'long serial wraps');
    assert.ok(g.text.every((t) => !t.text.includes('…')));
    // Rows stay inside the text area and the label.
    for (const t of g.text) assert.ok(t.y >= 0 && t.y + t.fontMm <= 40 + 1e-6);
  });

  it('uses one font size and weight for every row', () => {
    for (const raw of [{}, { textOptions: { fontMm: 3 } }, { layout: 'qr-top' }, { layout: 'text-only' }]) {
      const g = build(raw);
      assert.equal(new Set(g.text.map((t) => t.fontMm)).size, 1, JSON.stringify(raw));
      assert.ok(g.text.every((t) => t.bold === false));
    }
  });

  it('honours the chosen text size and shrinks it only when the block does not fit', () => {
    assert.equal(build({ textOptions: { fontMm: 2.5 } }).text[0].fontMm, 2.5);
    assert.equal(build({ textOptions: { fontMm: 4 } }).text[0].fontMm, 4);
    assert.ok(build({ textOptions: { fontMm: 2 } }).text[0].fontMm < build({ textOptions: { fontMm: 4 } }).text[0].fontMm);
    const huge = build({ textOptions: { fontMm: 10 } });
    assert.ok(huge.text[0].fontMm < 10 && huge.text[0].fontMm >= TEXT_FLOOR_MM);
    assert.equal(huge.overflow, 0);
  });

  it('centres the block vertically with the QR in qr-left', () => {
    const g = build({ textOptions: { valign: 'middle' } });
    const top = g.text[0].y;
    const bottom = g.text.at(-1).y + g.text.at(-1).fontMm;
    assert.ok(Math.abs((top + bottom) / 2 - (g.qr.y + g.qr.size / 2)) < 0.01);
  });

  it('clips with an overflow count only below the floor size', () => {
    const layout = normalizeLayout({ preset: '50x25', layout: 'qr-left', fields: ['name'] });
    const g = computeGeometry(layout, [{ key: 'name', text: 'palabra '.repeat(200) }], 'x');
    assert.ok(g.overflow > 0);
    assert.equal(g.text[0].fontMm, TEXT_FLOOR_MM);
  });

  it('wrapText breaks at spaces and hard-splits only long words', () => {
    assert.deepEqual(wrapText('S/N NC312399U23', 11), { rows: ['S/N', 'NC312399U23'], hard: false });
    assert.deepEqual(wrapText('ABCDEFGHIJ', 4), { rows: ['ABCD', 'EFGH', 'IJ'], hard: true });
  });

  it('API renders still work with wrapped rows (ZPL, PDF, PNG)', async () => {
    const base = { layout: layoutFor(), rows: [{ itemId: '1' }], items: [ITEM], resolveItemQrUrl: createPlaceholderQrUrl('https://erp.example.com') };
    const zpl = await renderLabels({ ...base, format: 'zpl' });
    assert.match(zpl.body, /\^FDINV-000123\^FS/);
    assert.equal(zpl.overflow, 0);
    const heights = [...zpl.body.matchAll(/\^A0N,(\d+),(\d+)/g)].map((m) => `${m[1]},${m[2]}`);
    assert.equal(new Set(heights).size, 1, 'one ZPL font size');
    const pdf = await renderLabels({ ...base, format: 'pdf' });
    assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-');
    const png = await renderLabels({ ...base, format: 'png' });
    assert.equal(png.body.subarray(1, 4).toString(), 'PNG');
  });
});
