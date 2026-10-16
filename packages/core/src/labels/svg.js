// svg.js — SVG of one label from the shared geometry. The API rasterizes it to
// PNG (sharp); the Etiquetas studio shows it inline as the live preview.
const ANCHOR = { left: 'start', center: 'middle', right: 'end' };
const esc = (text) => String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

// dpi sets the pixel size; fluid: width/height 100% (scales with its container).
export function renderLabelSvg(geometry, dpi, { fluid = false } = {}) {
  const px = (mm) => (mm * dpi) / 25.4;
  const size = fluid ? 'width="100%" height="100%"' : `width="${Math.round(px(geometry.widthMm))}" height="${Math.round(px(geometry.heightMm))}"`;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" ${size} viewBox="0 0 ${px(geometry.widthMm)} ${px(geometry.heightMm)}">`,
    '<rect width="100%" height="100%" fill="white"/>',
  ];
  const { qr } = geometry;
  if (qr) {
    const { count, isDark } = qr.matrix;
    const module = px(qr.moduleMm);
    const ox = px(qr.x + qr.quiet);
    const oy = px(qr.y + qr.quiet);
    let path = '';
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (isDark(row, col)) path += `M${(ox + col * module).toFixed(2)} ${(oy + row * module).toFixed(2)}h${module.toFixed(2)}v${module.toFixed(2)}h-${module.toFixed(2)}z`;
      }
    }
    parts.push(`<path d="${path}" fill="black" shape-rendering="crispEdges"/>`);
  }
  for (const line of geometry.text) {
    const fontPx = px(line.fontMm);
    const anchor = ANCHOR[line.align] ?? 'start';
    const x = line.align === 'center' ? line.x + line.w / 2 : line.align === 'right' ? line.x + line.w : line.x;
    parts.push(`<text x="${px(x)}" text-anchor="${anchor}" y="${px(line.y) + fontPx * 0.85}" font-family="Arial, Helvetica, sans-serif" font-size="${fontPx}" font-weight="${line.bold ? 700 : 400}" fill="black">${esc(line.text)}</text>`);
  }
  parts.push('</svg>');
  return parts.join('');
}
