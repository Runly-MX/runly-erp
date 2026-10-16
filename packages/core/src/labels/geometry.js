// geometry.js — millimetre geometry of one inventory label, shared by every
// renderer (API ZPL/PDF/PNG and the studio SVG preview) so the QR and the text
// land in the same place everywhere. Pure: the QR module matrix comes from an
// injected `qrMatrix(content, errorCorrection)` ({ count, isDark(row, col) }).
//
// Text rules: ONE font size for every line; long values wrap onto continuation
// lines inside the text area (at spaces, hard-split only when a word is longer
// than the line); when the block does not fit, the single size shrinks down to
// TEXT_FLOOR_MM and only then lines are clipped (counted in `overflow`).
import { LEGACY_COMPOSITION } from './layout.js';

// Average glyph width (in em) used to measure lines; errs wide for uppercase/digits.
export const TEXT_EM = 0.62;
// Line pitch as a multiple of the font size.
export const TEXT_LEADING = 1.25;
// Smallest automatic size before text is clipped.
export const TEXT_FLOOR_MM = 1.7;
const STEP_MM = 0.05;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Horizontal offset of a box of `size` inside [start, start + span] for an alignment.
const alignOffset = (align, start, span, size) => (align === 'center' ? start + (span - size) / 2 : align === 'right' ? start + span - size : start);

// QR square + remaining text area. m = inner margin, gap = QR-to-text gap.
// scale null keeps the automatic size; otherwise a % of the largest square the zone allows.
function placeQr(layout, lineCount, m, gap) {
  const { widthMm: w, heightMm: h, qrOptions } = layout;
  const scale = qrOptions.scalePct == null ? null : qrOptions.scalePct / 100;
  if (layout.layout === 'qr-only') {
    const size = (Math.min(w, h) - 2 * m) * (scale ?? 1);
    return { qr: { x: (w - size) / 2, y: (h - size) / 2, size }, area: { x: 0, y: 0, w: 0, h: 0 } };
  }
  if (layout.layout === 'qr-left') {
    const auto = Math.min(h - 2 * m, w * 0.45);
    const zone = scale == null ? auto : Math.min(h - 2 * m, (w - 2 * m - gap) * 0.6);
    const size = scale == null ? auto : zone * scale;
    // 'center' keeps the column at the zone width so the text does not move while resizing.
    const column = qrOptions.align === 'center' ? zone : size;
    const x = m + (column - size) / 2;
    return { qr: { x, y: (h - size) / 2, size }, area: { x: m + column + gap, y: m, w: w - column - 2 * m - gap, h: h - 2 * m } };
  }
  // qr-top: the code on top, the text block below it.
  const auto = Math.min(h * (lineCount ? 0.55 : 0.9), w - 2 * m);
  const reserve = lineCount ? Math.min(lineCount * 2.5, (h - 2 * m) * 0.6) + gap : 0;
  const size = scale == null ? auto : Math.min(h - 2 * m - reserve, w - 2 * m) * scale;
  const x = alignOffset(qrOptions.align ?? 'center', m, w - 2 * m, size);
  return { qr: { x, y: m, size }, area: { x: m, y: m + size + gap, w: w - 2 * m, h: h - size - 2 * m - gap } };
}

// Splits one text into rows of at most maxChars characters, breaking at spaces;
// a word longer than a row is hard-split. Returns { rows, hard }.
export function wrapText(text, maxChars) {
  const rows = [];
  let hard = false;
  let current = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    let rest = word;
    if (current && current.length + 1 + rest.length <= maxChars) {
      current += ` ${rest}`;
      continue;
    }
    if (current) rows.push(current);
    current = '';
    while (rest.length > maxChars) {
      hard = true;
      rows.push(rest.slice(0, maxChars));
      rest = rest.slice(maxChars);
    }
    current = rest;
  }
  if (current) rows.push(current);
  return { rows, hard };
}

const charsPerRow = (widthMm, fontMm) => Math.max(1, Math.floor(widthMm / (fontMm * TEXT_EM)));
const blockHeight = (rowCount, fontMm) => (rowCount ? (rowCount - 1) * fontMm * TEXT_LEADING + fontMm : 0);

function wrapAll(lines, widthMm, fontMm) {
  const maxChars = charsPerRow(widthMm, fontMm);
  let hard = false;
  const rows = lines.flatMap((line) => {
    const wrapped = wrapText(line.text, maxChars);
    hard ||= wrapped.hard;
    return wrapped.rows.map((text, index) => ({ key: line.key, text, cont: index > 0 }));
  });
  return { rows, hard, fontMm };
}

// Automatic size: proportional to the label, never taller than one slot per field.
export function autoFontMm(layout, area, lineCount) {
  const bySize = clamp(Math.min(layout.widthMm, layout.heightMm) * 0.09, 2.2, 5);
  return Math.max(TEXT_FLOOR_MM, Math.min(bySize, area.h / Math.max(1, lineCount) / TEXT_LEADING));
}

// Picks the single font size: the wanted one if the wrapped block fits; else the
// largest smaller size that fits without splitting words, then with splits; else
// the floor (clipped). The floor never exceeds a smaller explicit size.
// auto: first accept up to 20 % smaller if that keeps every field on one row.
export function fitText(lines, area, wantedMm, { auto = false } = {}) {
  const floor = Math.min(TEXT_FLOOR_MM, wantedMm);
  const fits = (r) => blockHeight(r.rows.length, r.fontMm) <= area.h + 1e-6;
  const candidates = [];
  for (let f = wantedMm; f >= floor - 1e-9; f -= STEP_MM) candidates.push(f);
  if (candidates.at(-1) > floor + 1e-9) candidates.push(floor);
  if (auto) {
    for (const f of candidates) {
      if (f < Math.max(floor, wantedMm * 0.8)) break;
      const r = wrapAll(lines, area.w, f);
      if (r.rows.length === lines.length && fits(r)) return r;
    }
  }
  const first = wrapAll(lines, area.w, wantedMm);
  if (fits(first) && !first.hard) return first;
  for (const f of candidates) {
    const r = wrapAll(lines, area.w, f);
    if (fits(r) && !r.hard) return r;
  }
  if (fits(first)) return first;
  for (const f of candidates) {
    const r = wrapAll(lines, area.w, f);
    if (fits(r)) return r;
  }
  return wrapAll(lines, area.w, floor);
}

// lines: [{ key, text }] already selected; content: QR payload or null.
// qrMatrix: (content, errorCorrection) -> { count, isDark(row, col) }.
// Returns { widthMm, heightMm, qr, text: [{ key, text, x, y, w, fontMm, bold, align, cont }], overflow }.
export function computeGeometry(layout, lines, content, { qrMatrix } = {}) {
  const { widthMm: w, heightMm: h, qrOptions } = layout;
  const opts = { ...LEGACY_COMPOSITION, ...(layout.textOptions ?? {}) };
  // Margins never eat more than a quarter of the label.
  const m = Math.min(opts.marginMm, Math.min(w, h) / 4);
  const gap = Math.min(opts.gapMm, Math.min(w, h) / 4);
  let qr = null;
  let area = { x: m, y: m, w: w - 2 * m, h: h - 2 * m };
  if (layout.layout !== 'text-only' && content != null) {
    if (typeof qrMatrix !== 'function') throw new Error('computeGeometry needs a qrMatrix function to place a QR.');
    const matrix = qrMatrix(content, qrOptions.errorCorrection);
    const placed = placeQr(layout, lines.length, m, gap);
    area = placed.area;
    const size = Math.max(1, placed.qr.size);
    const quiet = Math.min(qrOptions.quietZoneMm, size / 4);
    qr = { ...placed.qr, size, quiet, matrix, moduleMm: (size - 2 * quiet) / matrix.count };
  }
  const text = [];
  // overflow: text rows clipped because the block does not fit even at the floor size.
  let overflow = 0;
  if (lines.length && !(area.w > 4 && area.h > 2)) overflow = lines.length;
  if (lines.length && area.w > 4 && area.h > 2) {
    const wanted = opts.fontMm ?? autoFontMm(layout, area, lines.length);
    const { rows, fontMm } = fitText(lines, area, wanted, { auto: opts.fontMm == null });
    const pitch = fontMm * TEXT_LEADING;
    // How many rows fit; the rest are clipped.
    const capacity = Math.max(1, Math.floor((area.h - fontMm) / pitch + 1e-6) + 1);
    const shown = rows.slice(0, capacity);
    overflow = rows.length - shown.length;
    // 'spread' gives every row an equal slot of the area; top/middle/bottom
    // stack the rows at the leading and place the block in the area.
    const spread = opts.valign === 'spread';
    const slot = spread ? area.h / shown.length : pitch;
    const block = spread ? area.h : blockHeight(shown.length, fontMm);
    const y0 = area.y + (spread ? 0 : opts.valign === 'middle' ? (area.h - block) / 2 : opts.valign === 'bottom' ? area.h - block : 0);
    shown.forEach((row, index) => {
      text.push({
        key: row.key,
        text: row.text,
        x: area.x,
        y: spread ? y0 + index * slot + (slot - fontMm) / 2 : y0 + index * pitch,
        w: area.w,
        fontMm,
        bold: false,
        align: opts.align,
        cont: row.cont,
      });
    });
  }
  return { widthMm: w, heightMm: h, qr, text, overflow };
}
