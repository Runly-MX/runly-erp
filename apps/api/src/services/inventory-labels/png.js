// png.js — PNG of one label (also usable by thermal printers that take images):
// the shared SVG (@runly/core/labels) rasterized with sharp.
import sharp from 'sharp';
import { renderLabelSvg } from '@runly/core/labels';

export { renderLabelSvg };

export async function renderPng(geometry, dpi) {
  return sharp(Buffer.from(renderLabelSvg(geometry, dpi))).png().toBuffer();
}
