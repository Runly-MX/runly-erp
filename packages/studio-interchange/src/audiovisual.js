// Audio/video in portable Website packages (packaged-media-v3). Pure: signature checks only. The bytes
// were fully decoded by the Developer Hub's isolated FFmpeg processor when the asset was confirmed;
// this reader never decodes media. Limits mirror the Hub processor policy av2.
import { packageError } from './errors.js'

export const AV_LIMITS = Object.freeze({ bytes: 64 * 1024 * 1024, durationMs: 180000 })
export const AV_EXTENSIONS = Object.freeze({ 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav' })
export const AV_MIMES = Object.freeze(Object.keys(AV_EXTENSIONS))
export const avKind = (mime) => (mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : null)

const fail = (message) => { throw packageError('av_asset_invalid', message) }

// Same signatures as the Hub processor (packages/contracts/audiovisual.js there).
export function audiovisualContainer(bytes) {
  if (bytes.length < 12 || bytes.length > AV_LIMITS.bytes) fail('El audio o video está vacío o supera el tamaño permitido.')
  const ascii = (start, end) => bytes.toString('ascii', start, end)
  if (ascii(4, 8) === 'ftyp' && bytes.readUInt32BE(0) >= 16 && bytes.readUInt32BE(0) <= bytes.length &&
    ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4A '].includes(ascii(8, 12))) return 'mp4'
  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) &&
    bytes.subarray(0, 4096).includes(Buffer.from([0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]))) return 'webm'
  if (ascii(0, 4) === 'OggS' && bytes[4] === 0) return 'ogg'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'wav'
  if (ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe6) === 0xe2)) return 'mp3'
  fail('La firma del audio o video no es un contenedor admitido.')
}

const CONTAINER_MIMES = { mp4: ['video/mp4', 'audio/mp4'], webm: ['video/webm'], ogg: ['audio/ogg'], wav: ['audio/wav'], mp3: ['audio/mpeg'] }
// The declared MIME must agree with the container signature (MP4 carries both video/mp4 and audio/mp4).
export function assertAudiovisual(input, mime) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input ?? [])
  if (!CONTAINER_MIMES[audiovisualContainer(bytes)].includes(mime)) fail('El MIME declarado no coincide con el contenedor del archivo.')
  return bytes
}
