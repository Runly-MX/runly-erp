// Text items of the first page of a PDF ({ page, items: [{ str, x, y, w, h }] },
// top-left points, h = font size), extracted by pdfjs in a worker thread.
import { Worker } from 'node:worker_threads';
import { TemplateError } from './template-tags.js';

const TIMEOUT_MS = 15_000;

export function extractPdfTextItems(buffer) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pdf-text-items-worker.js', import.meta.url), {
      workerData: buffer,
      resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 },
    });
    let settled = false;
    const finish = (fn, value) => { if (settled) return; settled = true; clearTimeout(timer); void worker.terminate(); fn(value); };
    const timer = setTimeout(() => finish(reject, new TemplateError('El PDF tardó demasiado en procesarse.')), TIMEOUT_MS);
    worker.once('message', (msg) => (msg?.error ? finish(reject, new TemplateError('No se pudo leer el texto del PDF.')) : finish(resolve, msg)));
    worker.once('error', () => finish(reject, new TemplateError('No se pudo leer el texto del PDF.')));
    worker.once('exit', () => finish(reject, new TemplateError('No se pudo leer el texto del PDF.')));
  });
}
