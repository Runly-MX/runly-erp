// zpl.js — ZPL II renderer (Zebra ZD/DS). Uses the native ^BQ QR command and
// scalable font 0; ^CI28 selects UTF-8 so accents print. One ^XA..^XZ block per
// queue row, repeated with ^PQ for the quantity.
const JUSTIFY = { left: 'L', center: 'C', right: 'R' };
const dots = (mm, dpi) => Math.max(0, Math.round((mm * dpi) / 25.4));

// ^ and ~ start ZPL commands; control characters never belong in a field.
const safe = (text) => String(text).replace(/[\^~\\]/g, ' ').replace(/[\u0000-\u001f]/g, ' ');

export function renderLabelZpl(geometry, dpi, quantity = 1, errorCorrection = 'M') {
  const out = [
    '^XA',
    '^CI28',
    `^PW${dots(geometry.widthMm, dpi)}`,
    `^LL${dots(geometry.heightMm, dpi)}`,
    '^LH0,0',
  ];
  if (geometry.qr) {
    const { qr } = geometry;
    // ^BQ magnification is an integer number of dots per module (1-10).
    const magnification = Math.max(1, Math.min(10, Math.floor((qr.moduleMm * dpi) / 25.4)));
    out.push(`^FO${dots(qr.x + qr.quiet, dpi)},${dots(qr.y + qr.quiet, dpi)}`);
    out.push(`^BQN,2,${magnification}`);
    out.push(`^FD${errorCorrection}A,${safe(qr.content)}^FS`);
  }
  for (const line of geometry.text) {
    const height = dots(line.fontMm, dpi);
    const width = line.bold ? Math.round(height * 1.1) : height;
    out.push(`^FO${dots(line.x, dpi)},${dots(line.y, dpi)}`);
    out.push(`^A0N,${height},${width}`);
    // ^FB justification lets the printer centre/right-align with its own font metrics.
    out.push(`^FB${dots(line.w, dpi)},1,0,${JUSTIFY[line.align] ?? 'L'},0`);
    out.push(`^FD${safe(line.text)}^FS`);
  }
  out.push(`^PQ${Math.max(1, quantity)},0,1,N`, '^XZ');
  return out.join('\n');
}
