// png.js — PNG preview (also usable by thermal printers that take images).
// Builds an SVG from the shared geometry and rasterizes it with sharp.
import sharp from 'sharp';

const esc = (text) => String(text).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

export function renderLabelSvg(geometry, dpi) {
  const px = (mm) => (mm * dpi) / 25.4;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(px(geometry.widthMm))}" height="${Math.round(px(geometry.heightMm))}" viewBox="0 0 ${px(geometry.widthMm)} ${px(geometry.heightMm)}">`,
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
    const size = px(line.fontMm);
    parts.push(`<text x="${px(line.x)}" y="${px(line.y) + size * 0.85}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${line.bold ? 700 : 400}" fill="black">${esc(line.text)}</text>`);
  }
  parts.push('</svg>');
  return parts.join('');
}

export async function renderPng(geometry, dpi) {
  return sharp(Buffer.from(renderLabelSvg(geometry, dpi))).png().toBuffer();
}
