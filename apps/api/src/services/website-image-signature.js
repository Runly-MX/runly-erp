import { validateSvg } from '@runly/studio-interchange/svg'
import { assertAudiovisual, AV_MIMES } from '@runly/studio-interchange/audiovisual'

export const PUBLISHABLE_IMAGE_MIME = /^image\/(?:png|jpeg|webp|gif|avif|svg\+xml)$/
export const PUBLISHABLE_AV_MAX_BYTES = 64 * 1024 * 1024
export const isPublishableAudiovisual = (mimeType) => AV_MIMES.includes(mimeType)

// Audio/video: the container signature must match the MIME (the bytes were decoded by the Hub's isolated processor).
export function audiovisualSignatureMatches(mimeType, bytes) {
  try { assertAudiovisual(bytes, mimeType); return true } catch { return false }
}

// Release-time check that the bytes really are what the file claims. SVG has no signature: it must be
// the canonical sanitized document (the same bytes Hub/ERP imports store), never an arbitrary upload.
export function imageSignatureMatches(mimeType, bytes) {
  switch (mimeType) {
    case 'image/png': return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    case 'image/jpeg': return bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    case 'image/gif': return bytes.subarray(0, 4).toString() === 'GIF8'
    case 'image/webp': return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
    case 'image/avif': return bytes.subarray(4, 12).toString() === 'ftypavif'
    case 'image/svg+xml':
      try { validateSvg(bytes); return true } catch { return false }
    default: return false
  }
}
