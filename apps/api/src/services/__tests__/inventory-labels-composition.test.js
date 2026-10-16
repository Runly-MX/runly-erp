// inventory-labels-composition.test.js — text/QR alignment, QR scale, margin and
// gap in the shared label geometry, plus the legacy-output regression.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLayout, recommendedComposition, renderLabels, withNewTemplateDefaults, createPlaceholderQrUrl } from '../inventory-labels/index.js';
import { computeGeometry } from '../inventory-labels/geometry.js';
import { renderLabelSvg } from '../inventory-labels/png.js';
import { qrMatrix } from '../inventory-labels/qr-content.js';

// Frozen copy of computeGeometry before composition options existed (2026-10-15).
function legacyGeometry(layout, lines, content) {
  const PAD_MM = 1.5;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const truncate = (text, maxChars) => (text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 1))}…` : text);
  const { widthMm: w, heightMm: h, qrOptions } = layout;
  let qr = null;
  let area = { x: PAD_MM, y: PAD_MM, w: w - 2 * PAD_MM, h: h - 2 * PAD_MM };
  if (layout.layout !== 'text-only' && content != null) {
    const matrix = qrMatrix(content, qrOptions.errorCorrection);
    if (layout.layout === 'qr-only') {
      const size = Math.min(w, h) - 2 * PAD_MM;
      qr = { x: (w - size) / 2, y: (h - size) / 2, size };
      area = { x: 0, y: 0, w: 0, h: 0 };
    } else if (layout.layout === 'qr-left') {
      const size = Math.min(h - 2 * PAD_MM, w * 0.45);
      qr = { x: PAD_MM, y: (h - size) / 2, size };
      area = { x: PAD_MM * 2 + size, y: PAD_MM, w: w - size - PAD_MM * 3, h: h - 2 * PAD_MM };
    } else {
      const size = Math.min(h * (lines.length ? 0.55 : 0.9), w - 2 * PAD_MM);
      qr = { x: (w - size) / 2, y: PAD_MM, size };
      area = { x: PAD_MM, y: PAD_MM * 2 + size, w: w - 2 * PAD_MM, h: h - size - PAD_MM * 3 };
    }
    const quiet = Math.min(qrOptions.quietZoneMm, qr.size / 4);
    qr = { ...qr, quiet, matrix, moduleMm: (qr.size - 2 * quiet) / matrix.count };
  }
  const text = [];
  let overflow = 0;
  if (lines.length && !(area.w > 4 && area.h > 2)) overflow = lines.length;
  if (lines.length && area.w > 4 && area.h > 2) {
    const lineH = area.h / lines.length;
    if (lineH < 1.8) overflow += 1;
    const fixedFont = layout.textOptions?.fontMm ?? null;
    const fit = (line, wanted, em) => clamp(Math.min(wanted, area.w / (line.text.length * em)), 1.8, Math.max(1.8, wanted));
    const headWanted = fixedFont ? Math.min(fixedFont * 1.15, lineH * 0.95) : clamp(lineH * 0.9, 1.8, 5);
    const headFont = fit(lines[0], headWanted, 0.6);
    const bodyWanted = fixedFont ? Math.min(fixedFont, lineH * 0.9) : Math.min(clamp(lineH * 0.78, 1.8, 4), headFont);
    const bodyFont = lines.length > 1 ? Math.min(...lines.slice(1).map((line) => fit(line, bodyWanted, 0.52))) : bodyWanted;
    for (const [index, line] of lines.entries()) {
      const fontMm = index === 0 ? headFont : bodyFont;
      const maxChars = Math.max(3, Math.floor(area.w / (fontMm * (index === 0 ? 0.6 : 0.52))));
      if (line.text.length > maxChars) overflow += 1;
      text.push({ key: line.key, text: truncate(line.text, maxChars), x: area.x, y: area.y + index * lineH + (lineH - fontMm) / 2, w: area.w, fontMm, bold: index === 0 });
    }
  }
  return { widthMm: w, heightMm: h, qr, text, overflow };
}

// Rounds numbers so floating-point summation order does not matter; drops the
// QR matrix (same input -> same matrix) and the new `align` key.
const comparable = (g) => JSON.parse(JSON.stringify({ ...g, qr: g.qr ? { ...g.qr, matrix: g.qr.matrix.count } : null, text: g.text.map(({ align, ...t }) => t) }),
  (_, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v));

const LINES = [{ key: 'folio', text: 'TEL-CIS-CP7-1' }, { key: 'name', text: 'Telefono IP' }, { key: 'serial', text: 'S/N SN123' }];
const geo = (raw, lines = LINES) => computeGeometry(normalizeLayout({ preset: '60x40', fields: ['folio', 'name', 'serial'], ...raw }), lines, 'https://x/y');

describe('label composition', () => {
  it('default options reproduce the legacy geometry for every layout', () => {
    for (const preset of ['50x25', '60x40', '100x50']) {
      for (const layoutName of ['qr-left', 'qr-top', 'qr-only', 'text-only']) {
        for (const lines of [LINES, LINES.slice(0, 1), []]) {
          if (layoutName === 'text-only' && !lines.length) continue;
          for (const textOptions of [{}, { fontMm: 3 }]) {
            const layout = normalizeLayout({ preset, layout: layoutName, fields: ['folio'], textOptions });
            const content = layoutName === 'text-only' ? null : 'https://erp.example.com/app/p/inv/abc';
            assert.deepEqual(comparable(computeGeometry(layout, lines, content)), comparable(legacyGeometry(layout, lines, content)), `${preset} ${layoutName} ${lines.length}`);
          }
        }
      }
    }
  });

  it('aligns every text line left, centre or right', () => {
    for (const align of ['left', 'center', 'right']) {
      const g = geo({ layout: 'qr-top', textOptions: { align } });
      assert.ok(g.text.every((t) => t.align === align));
    }
    const png = renderLabelSvg(geo({ layout: 'qr-top', textOptions: { align: 'center' } }), 203);
    assert.match(png, /text-anchor="middle"/);
    const right = renderLabelSvg(geo({ layout: 'text-only', textOptions: { align: 'right' } }), 203);
    assert.match(right, /text-anchor="end"/);
  });

  it('places the text block top, middle or bottom of its area', () => {
    const opts = (valign) => geo({ layout: 'text-only', textOptions: { valign, fontMm: 2 } });
    const top = opts('top');
    const middle = opts('middle');
    const bottom = opts('bottom');
    const first = (g) => g.text[0].y;
    const lastEnd = (g) => g.text.at(-1).y + g.text.at(-1).fontMm;
    assert.ok(first(top) < 2.5);
    assert.ok(Math.abs((first(middle) - 1.5) - (40 - 1.5 - lastEnd(middle))) < 0.5, 'middle block is centred');
    assert.ok(lastEnd(bottom) > 37.5);
    assert.ok(first(top) < first(middle) && first(middle) < first(bottom));
  });

  it('scales and aligns the QR inside its zone', () => {
    const auto = geo({ layout: 'qr-top' });
    const small = geo({ layout: 'qr-top', qrOptions: { scalePct: 60 } });
    const big = geo({ layout: 'qr-top', qrOptions: { scalePct: 100 } });
    assert.ok(small.qr.size < big.qr.size);
    assert.ok(Math.abs(small.qr.size / big.qr.size - 0.6) < 1e-9);
    assert.ok(Math.abs(auto.qr.x + auto.qr.size / 2 - 30) < 1e-9);
    const left = geo({ layout: 'qr-top', qrOptions: { scalePct: 60, align: 'left' } });
    const right = geo({ layout: 'qr-top', qrOptions: { scalePct: 60, align: 'right' } });
    assert.equal(left.qr.x, 1.5);
    assert.ok(Math.abs(right.qr.x + right.qr.size - 58.5) < 1e-9);
    // Text starts right below the QR plus the gap.
    assert.ok(small.text[0].y >= small.qr.y + small.qr.size + 1.5 - 1e-9);
    // qr-left centred keeps the text column fixed while the QR shrinks.
    const c80 = geo({ qrOptions: { scalePct: 80, align: 'center' } });
    const c60 = geo({ qrOptions: { scalePct: 60, align: 'center' } });
    assert.equal(c80.text[0].x, c60.text[0].x);
    assert.ok(c60.qr.x > c80.qr.x);
  });

  it('applies the inner margin and the QR-to-text gap', () => {
    const g = geo({ textOptions: { marginMm: 3, gapMm: 4 } });
    assert.equal(g.qr.x, 3);
    assert.ok(Math.abs(g.text[0].x - (3 + g.qr.size + 4)) < 1e-9);
    assert.ok(Math.abs(g.text[0].x + g.text[0].w - 57) < 1e-9);
    const tiny = computeGeometry(normalizeLayout({ widthMm: 10, heightMm: 10, layout: 'text-only', fields: ['folio'], textOptions: { marginMm: 10 } }), LINES.slice(0, 1), null);
    assert.equal(tiny.text[0].x, 2.5, 'margin capped at a quarter of the label');
  });

  it('emits ZPL field blocks with the matching justification', async () => {
    const item = { id: '1', folio: 'F-1', name: 'Equipo' };
    const render = (textOptions) => renderLabels({
      layout: normalizeLayout({ preset: '60x40', layout: 'qr-top', fields: ['folio', 'name'], textOptions }), format: 'zpl',
      rows: [{ itemId: '1' }], items: [item], resolveItemQrUrl: createPlaceholderQrUrl('https://erp.example.com'),
    });
    assert.match((await render({})).body, /\^FB\d+,1,0,L,0\n\^FDF-1\^FS/);
    assert.match((await render({ align: 'center' })).body, /\^FB\d+,1,0,C,0\n\^FDF-1\^FS/);
    assert.match((await render({ align: 'right' })).body, /\^FB\d+,1,0,R,0\n\^FDEquipo\^FS/);
    const pdf = await renderLabels({
      layout: normalizeLayout({ preset: '60x40', layout: 'text-only', fields: ['folio'], textOptions: { align: 'center', valign: 'middle' } }), format: 'pdf',
      rows: [{ itemId: '1' }], items: [item],
    });
    assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-');
  });

  it('sanitizes composition options: clamps numbers, rejects bad values', () => {
    const l = normalizeLayout({ preset: '60x40', textOptions: { marginMm: 40, gapMm: -2 }, qrOptions: { scalePct: 20 } });
    assert.equal(l.textOptions.marginMm, 10);
    assert.equal(l.textOptions.gapMm, 0);
    assert.equal(l.qrOptions.scalePct, 50);
    assert.equal(normalizeLayout({ preset: '60x40', qrOptions: { scalePct: 'auto' } }).qrOptions.scalePct, null);
    assert.equal(normalizeLayout({ preset: '60x40', qrOptions: { scalePct: 140 } }).qrOptions.scalePct, 100);
    assert.equal(normalizeLayout({ preset: '60x40', layout: 'qr-left', qrOptions: { align: 'right' } }).qrOptions.align, 'center');
    assert.throws(() => normalizeLayout({ preset: '60x40', textOptions: { align: 'justify' } }), /Alineación del texto/);
    assert.throws(() => normalizeLayout({ preset: '60x40', textOptions: { valign: 'up' } }), /vertical/);
    assert.throws(() => normalizeLayout({ preset: '60x40', textOptions: { marginMm: 'abc' } }), /margen/);
    assert.throws(() => normalizeLayout({ preset: '60x40', qrOptions: { align: 'top' } }), /QR/);
    const legacy = normalizeLayout({ preset: '60x40' }).textOptions;
    assert.deepEqual(legacy, { showFieldNames: false, fontMm: null, align: 'left', valign: 'spread', marginMm: 1.5, gapMm: 1.5 });
  });

  it('new templates default to centred content for qr-top and text-only', () => {
    assert.equal(recommendedComposition('qr-top').align, 'center');
    assert.equal(recommendedComposition('qr-left').align, 'left');
    const created = normalizeLayout(withNewTemplateDefaults({ preset: '60x40', layout: 'text-only', fields: ['folio'] }));
    assert.equal(created.textOptions.align, 'center');
    assert.equal(created.textOptions.valign, 'middle');
    const kept = normalizeLayout(withNewTemplateDefaults({ preset: '60x40', layout: 'qr-top', textOptions: { align: 'right' } }));
    assert.equal(kept.textOptions.align, 'right');
  });
});
