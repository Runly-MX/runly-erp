// Converts an Office document to PDF through Collabora's convert-to endpoint
// (`POST {internalUrl}/cool/convert-to/pdf`, multipart field `data`).
// Returns null when Office is not configured or the conversion fails, so the
// caller keeps the filled DOCX/XLSX as the final document.
import { readOfficeConfig } from '../office/config.js';

const TIMEOUT_MS = 30_000;

export async function convertToPdf(buffer, filename, { env = process.env, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  let config;
  try {
    config = readOfficeConfig(env);
  } catch {
    return null;
  }
  if (!config?.enabled || !config.internalUrl) return null;
  try {
    const form = new FormData();
    form.append('data', new Blob([buffer]), filename);
    const response = await fetchImpl(`${config.internalUrl}/cool/convert-to/pdf`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const pdf = Buffer.from(await response.arrayBuffer());
    return pdf.subarray(0, 5).toString('latin1') === '%PDF-' ? pdf : null;
  } catch {
    return null;
  }
}
