// geometry.js — millimetre geometry of one label, shared by every renderer so
// ZPL, PDF and PNG put the QR and the text in the same place.
// Composition (textOptions.align/valign/marginMm/gapMm, qrOptions.scalePct/align)
// defaults to LEGACY_COMPOSITION, which reproduces the pre-composition output.
import { qrMatrix } from './qr-content.js';
import { LEGACY_COMPOSITION } from './layout.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function truncate(text, maxChars) {
  return text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 1))}…` : text;
}

// Horizontal offset of a box of `size` inside [start, start + span] for an alignment.
const alignOffset = (align, start, span, size) => (align === 'center' ? start + (span - size) / 2 : align === 'right' ? start + span - size : start);

// QR square + remaining text area. m = inner margin, gap = QR-to-text gap.
// scale null keeps the automatic (legacy) size; otherwise a % of the largest
// square the zone allows.
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

// lines: [{ key, text }] already selected; content: QR payload or null.
export function computeGeometry(layout, lines, content) {
  const { widthMm: w, heightMm: h, qrOptions } = layout;
  const opts = { ...LEGACY_COMPOSITION, ...(layout.textOptions ?? {}) };
  // Margins never eat more than a quarter of the label.
  const m = Math.min(opts.marginMm, Math.min(w, h) / 4);
  const gap = Math.min(opts.gapMm, Math.min(w, h) / 4);
  let qr = null;
  let area = { x: m, y: m, w: w - 2 * m, h: h - 2 * m };
  if (layout.layout !== 'text-only' && content != null) {
    const matrix = qrMatrix(content, qrOptions.errorCorrection);
    const placed = placeQr(layout, lines.length, m, gap);
    area = placed.area;
    const size = Math.max(1, placed.qr.size);
    const quiet = Math.min(qrOptions.quietZoneMm, size / 4);
    qr = { ...placed.qr, size, quiet, matrix, moduleMm: (size - 2 * quiet) / matrix.count };
  }
  const text = [];
  // overflow: lines truncated or squeezed below a readable height (shown as a
  // warning in the Etiquetas preview).
  let overflow = 0;
  if (lines.length && !(area.w > 4 && area.h > 2)) overflow = lines.length;
  if (lines.length && area.w > 4 && area.h > 2) {
    const lineH = area.h / lines.length;
    if (lineH < 1.8) overflow += 1;
    // The first line (folio) is a larger heading; the others share one size.
    // Fonts shrink to fit the width (down to 1.8 mm) before text is truncated.
    // textOptions.fontMm replaces the automatic size (still capped by the line height).
    const fixedFont = layout.textOptions?.fontMm ?? null;
    const fit = (line, wanted, em) => clamp(Math.min(wanted, area.w / (line.text.length * em)), 1.8, Math.max(1.8, wanted));
    const headWanted = fixedFont ? Math.min(fixedFont * 1.15, lineH * 0.95) : clamp(lineH * 0.9, 1.8, 5);
    const headFont = fit(lines[0], headWanted, 0.6);
    const bodyWanted = fixedFont ? Math.min(fixedFont, lineH * 0.9) : Math.min(clamp(lineH * 0.78, 1.8, 4), headFont);
    const bodyFont = lines.length > 1 ? Math.min(...lines.slice(1).map((line) => fit(line, bodyWanted, 0.52))) : bodyWanted;
    const fonts = lines.map((_, index) => (index === 0 ? headFont : bodyFont));
    // 'spread' gives every line an equal slot of the area; top/middle/bottom
    // stack the lines at ~1.3x their font and place the block in the area.
    const pitches = fonts.map((fontMm) => (opts.valign === 'spread' ? lineH : Math.min(lineH, fontMm * 1.3)));
    const block = pitches.reduce((sum, p) => sum + p, 0);
    let y = area.y + (opts.valign === 'middle' ? (area.h - block) / 2 : opts.valign === 'bottom' ? area.h - block : 0);
    for (const [index, line] of lines.entries()) {
      const fontMm = fonts[index];
      const maxChars = Math.max(3, Math.floor(area.w / (fontMm * (index === 0 ? 0.6 : 0.52))));
      if (line.text.length > maxChars) overflow += 1;
      text.push({
        key: line.key,
        text: truncate(line.text, maxChars),
        x: area.x,
        y: y + (pitches[index] - fontMm) / 2,
        w: area.w,
        fontMm,
        bold: index === 0,
        align: opts.align,
      });
      y += pitches[index];
    }
  }
  return { widthMm: w, heightMm: h, qr, text, overflow };
}
