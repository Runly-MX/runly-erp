// geometry.js — millimetre geometry of one label, shared by every renderer so
// ZPL, PDF and PNG put the QR and the text in the same place.
import { qrMatrix } from './qr-content.js';

const PAD_MM = 1.5;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function truncate(text, maxChars) {
  return text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 1))}…` : text;
}

// lines: [{ key, text }] already selected; content: QR payload or null.
export function computeGeometry(layout, lines, content) {
  const { widthMm: w, heightMm: h, qrOptions } = layout;
  let qr = null;
  let area = { x: PAD_MM, y: PAD_MM, w: w - 2 * PAD_MM, h: h - 2 * PAD_MM };
  if (layout.layout !== 'text-only' && content != null) {
    const matrix = qrMatrix(content, qrOptions.errorCorrection);
    if (layout.layout === 'qr-left') {
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
  if (lines.length && area.w > 4 && area.h > 2) {
    const lineH = area.h / lines.length;
    // The first line (folio) is a larger heading; the others share one size.
    // Fonts shrink to fit the width (down to 1.8 mm) before text is truncated.
    const fit = (line, wanted, em) => clamp(Math.min(wanted, area.w / (line.text.length * em)), 1.8, wanted);
    const headFont = fit(lines[0], clamp(lineH * 0.9, 1.8, 5), 0.6);
    const bodyWanted = Math.min(clamp(lineH * 0.78, 1.8, 4), headFont);
    const bodyFont = lines.length > 1 ? Math.min(...lines.slice(1).map((line) => fit(line, bodyWanted, 0.52))) : bodyWanted;
    for (const [index, line] of lines.entries()) {
      const fontMm = index === 0 ? headFont : bodyFont;
      const maxChars = Math.max(3, Math.floor(area.w / (fontMm * (index === 0 ? 0.6 : 0.52))));
      text.push({
        key: line.key,
        text: truncate(line.text, maxChars),
        x: area.x,
        y: area.y + index * lineH + (lineH - fontMm) / 2,
        w: area.w,
        fontMm,
        bold: index === 0,
      });
    }
  }
  return { widthMm: w, heightMm: h, qr, text };
}
