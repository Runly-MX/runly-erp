// pdf.js — PDF renderer: one page per physical label at the exact label size,
// so any printer driver prints it without scaling. The QR is drawn from the
// same module matrix as the other renderers.
import PDFDocument from 'pdfkit';

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
    doc.text(line.text, pt(line.x), pt(line.y), { width: pt(line.w), height: pt(line.fontMm * 1.3), lineBreak: false, ellipsis: true });
  }
}

// geometries: one entry per physical label (already expanded by quantity).
export function renderPdf(geometries, title = 'Etiquetas') {
  return new Promise((resolve, reject) => {
    const first = geometries[0];
    const size = [pt(first.widthMm), pt(first.heightMm)];
    const doc = new PDFDocument({ size, margin: 0, autoFirstPage: false, info: { Title: title } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    for (const geometry of geometries) {
      doc.addPage({ size, margin: 0 });
      drawLabel(doc, geometry);
    }
    doc.end();
  });
}
