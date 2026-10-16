// qr-content.js — what the QR of a label encodes and its module matrix.
// The default resolver builds the provisional `<base>/app/p/inv/f-<folio>`;
// the label service injects resolveItemQrUrl(item) with the public token URL.
import QRCode from 'qrcode';

export { createPlaceholderQrUrl, embeddedQrText, qrContent } from '@runly/core/labels';

// Boolean module matrix: { count, isDark(row, col) }.
export function qrMatrix(content, errorCorrection = 'M') {
  const { modules } = QRCode.create(content, { errorCorrectionLevel: errorCorrection });
  const count = modules.size;
  return { count, isDark: (row, col) => modules.data[row * count + col] === 1 };
}
