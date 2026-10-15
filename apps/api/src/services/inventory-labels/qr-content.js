// qr-content.js — what the QR of a label encodes.
//
// PHASE 2 PLACEHOLDER: the default resolver builds `<base>/app/p/inv/f-<folio>`
// so labels can be printed before Phase 3. Phase 3 (public page) replaces it by
// injecting a resolveItemQrUrl(item) that returns the opaque revocable token
// URL `<base>/app/p/inv/<token>`; nothing else in this package changes.
import QRCode from 'qrcode';

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

// Boolean module matrix: { count, isDark(row, col) }.
export function qrMatrix(content, errorCorrection = 'M') {
  const { modules } = QRCode.create(content, { errorCorrectionLevel: errorCorrection });
  const count = modules.size;
  return { count, isDark: (row, col) => modules.data[row * count + col] === 1 };
}
