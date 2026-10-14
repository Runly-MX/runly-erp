// Handwritten signature PNG validation shared by custody records and saved
// user signatures: raw base64 or a data URL, at most 300 KB, PNG magic bytes.
export const MAX_SIGNATURE_BYTES = 300 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class SignaturePngError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SignaturePngError';
    this.status = 400;
  }
}

// Returns the PNG buffer or throws SignaturePngError (Spanish message).
export function decodePngSignature(input) {
  const raw = String(input ?? '').replace(/^data:image\/png;base64,/i, '').trim();
  if (!raw || !/^[A-Za-z0-9+/=\s]+$/.test(raw)) throw new SignaturePngError('La firma no es una imagen PNG válida.');
  const buffer = Buffer.from(raw, 'base64');
  if (buffer.length > MAX_SIGNATURE_BYTES) throw new SignaturePngError('La firma supera 300 KB.');
  if (buffer.length < PNG_MAGIC.length || !buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new SignaturePngError('La firma no es una imagen PNG válida.');
  }
  return buffer;
}
