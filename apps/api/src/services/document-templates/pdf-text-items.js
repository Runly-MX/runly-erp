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
    // Never terminate a worker that is still tearing pdfjs down (native
    // access violation on Windows): let it exit by itself once it has
    // answered, and only force-terminate on timeout.
    let settled = false;
    let result;
    const fail = () => new TemplateError('No se pudo leer el texto del PDF.');
    const finish = (fn, value) => { if (settled) return; settled = true; clearTimeout(timer); fn(value); };
    const timer = setTimeout(() => {
      void worker.terminate();
      finish(reject, new TemplateError('El PDF tardó demasiado en procesarse.'));
    }, TIMEOUT_MS);
    worker.once('message', (msg) => { result = msg; });
    worker.once('error', () => finish(reject, fail()));
    worker.once('exit', () => (result && !result.error ? finish(resolve, result) : finish(reject, fail())));
  });
}
