// Plain read of the fiscal UUID (folio fiscal) of a CFDI XML: the `UUID`
// attribute of tfd:TimbreFiscalDigital. No signature or schema validation.
const TIMBRE = /<(?:[\w.-]+:)?TimbreFiscalDigital\b([^>]*)>/i;
const UUID_ATTR = /\bUUID\s*=\s*["']([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})["']/;

export function extractCfdiUuid(xml) {
  if (xml === undefined || xml === null) return null;
  const text = Buffer.isBuffer(xml) ? xml.toString('utf8') : String(xml);
  const timbre = text.match(TIMBRE);
  if (!timbre) return null;
  const uuid = timbre[1].match(UUID_ATTR);
  return uuid ? uuid[1].toUpperCase() : null;
}

// Label used by the purchases UI for invoice attachments (pdf / xml).
export function purchaseFileLabel(fileName, mimeType) {
  const name = String(fileName ?? '').toLowerCase();
  if (mimeType === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (/xml/.test(mimeType ?? '') || name.endsWith('.xml')) return 'xml';
  return null;
}
