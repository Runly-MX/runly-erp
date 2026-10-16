// pdf.js — PDF renderer: one page per physical label at the exact label size,
// so any printer driver prints it without scaling. The QR is drawn from the
// same module matrix as the other renderers.
import PDFDocument from 'pdfkit';
import { LETTER } from './layout.js';

const PT_PER_MM = 72 / 25.4;
const pt = (mm) => mm * PT_PER_MM;

function drawLabel(doc, geometry) {
  const { qr } = geometry;
  if (qr) {
    const origin = { x: qr.x + qr.quiet, y: qr.y + qr.quiet };
    const { count, isDark } = qr.matrix;
    doc.fillColor('black');
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (!isDark(row, col)) continue;
        // Slight overlap avoids hairline gaps between modules in some viewers.
        doc.rect(pt(origin.x + col * qr.moduleMm), pt(origin.y + row * qr.moduleMm), pt(qr.moduleMm) + 0.2, pt(qr.moduleMm) + 0.2).fill();
      }
    }
  }
  for (const line of geometry.text) {
    doc.fillColor('black').font(line.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(pt(line.fontMm));
    // Rows are already wrapped by the geometry: one row per call, never re-broken.
    doc.text(line.text, pt(line.x), pt(line.y), { width: pt(line.w), lineBreak: false, align: line.align ?? 'left' });
  }
}

// Top-left corner (mm) of each cell of a letter sheet; the grid is centred
// horizontally and starts at the top margin (same rule as the client preview).
export function sheetCells(sheet, widthMm, heightMm) {
  const gridW = sheet.columns * widthMm + (sheet.columns - 1) * sheet.gapMm;
  const x0 = (LETTER.widthMm - gridW) / 2;
  const cells = [];
  for (let row = 0; row < sheet.rows; row += 1) {
    for (let col = 0; col < sheet.columns; col += 1) {
      cells.push({ x: x0 + col * (widthMm + sheet.gapMm), y: sheet.marginMm + row * (heightMm + sheet.gapMm) });
    }
  }
  return cells;
}

function collect(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// geometries: one entry per physical label (already expanded by quantity).
// sheet (normalizeSheet) lays them out on letter pages; otherwise one page per
// label at the exact label size.
export function renderPdf(geometries, title = 'Etiquetas', sheet = null) {
  const first = geometries[0];
  if (sheet) {
    const size = [pt(LETTER.widthMm), pt(LETTER.heightMm)];
    const doc = new PDFDocument({ size, margin: 0, autoFirstPage: false, info: { Title: title } });
    const done = collect(doc);
    const cells = sheetCells(sheet, first.widthMm, first.heightMm);
    geometries.forEach((geometry, index) => {
      const slot = index % cells.length;
      if (slot === 0) doc.addPage({ size, margin: 0 });
      const cell = cells[slot];
      doc.save();
      doc.translate(pt(cell.x), pt(cell.y));
      if (sheet.guides) doc.lineWidth(0.3).strokeColor('#bbbbbb').rect(0, 0, pt(geometry.widthMm), pt(geometry.heightMm)).stroke();
      drawLabel(doc, geometry);
      doc.restore();
    });
    doc.end();
    return done;
  }
  const size = [pt(first.widthMm), pt(first.heightMm)];
  const doc = new PDFDocument({ size, margin: 0, autoFirstPage: false, info: { Title: title } });
  const done = collect(doc);
  for (const geometry of geometries) {
    doc.addPage({ size, margin: 0 });
    drawLabel(doc, geometry);
  }
  doc.end();
  return done;
}
