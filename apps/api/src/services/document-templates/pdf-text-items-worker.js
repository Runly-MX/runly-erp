// Worker: text items of the first PDF page with their positions, for
// "Detectar campos" on uploaded certificate PDFs. Untrusted input, so it runs
// off the API event loop with memory limits set by the caller.
import { parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const MAX_ITEMS = 2000;
const task = getDocument({ data: new Uint8Array(workerData), isEvalSupported: false, useSystemFonts: false,
  disableFontFace: true, useWasm: false,
  standardFontDataUrl: fileURLToPath(new URL('./standard_fonts/', import.meta.resolve('pdfjs-dist/package.json'))).replaceAll('\\', '/') });
try {
  const pdf = await task.promise;
  const page = await pdf.getPage(1);
  const [x0, y0, x1, y1] = page.view;
  const content = await page.getTextContent();
  const items = [];
  for (const item of content.items) {
    if (!item?.str?.trim() || items.length >= MAX_ITEMS) continue;
    const [a, b, c, d, e, f] = item.transform;
    // Horizontal text only; rotated labels are ignored.
    if (Math.abs(b) > 0.01 * Math.abs(a) || Math.abs(c) > 0.01 * Math.abs(d)) continue;
    const size = Math.abs(d) || item.height || 0;
    if (!size) continue;
    items.push({ str: item.str, x: e - x0, y: (y1 - f) - size, w: item.width || 0, h: size });
  }
  parentPort.postMessage({ page: { width: x1 - x0, height: y1 - y0 }, items });
} catch { parentPort.postMessage({ error: true }); }
finally { await task.destroy(); }
