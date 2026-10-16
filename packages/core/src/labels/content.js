// content.js — what the QR of a label encodes (pure helpers).

// Provisional link `<base>/app/p/inv/f-<folio>` (tests and the studio preview
// before the real public link is known; the API prints the token URL).
export function createPlaceholderQrUrl(publicBaseUrl) {
  const base = String(publicBaseUrl ?? '').replace(/\/+$/, '');
  return (item) => `${base}/app/p/inv/f-${encodeURIComponent(item.folio || item.id)}`;
}

// "embedded" mode: plain text folio|serial|model for offline scanners. It can
// go stale when the item changes (the UI warns about it).
export function embeddedQrText(item) {
  return [item.folio ?? '', item.serialNumber ?? '', item.model ?? item.modelName ?? '']
    .map((part) => String(part).replace(/\|/g, '/'))
    .join('|');
}

export function qrContent(item, qrOptions, resolveItemQrUrl) {
  return qrOptions.contentMode === 'embedded' ? embeddedQrText(item) : resolveItemQrUrl(item);
}
