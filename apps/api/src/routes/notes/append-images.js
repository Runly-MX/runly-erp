// apps/api/src/routes/notes/append-images.js
//
// Images for "append to a note" (MCP / MirAI). An image arrives as an https
// URL only (proposals are persisted as JSON, so inline bytes are not accepted);
// it is validated, fetched, type-checked
// by magic bytes, uploaded to the same public `runly-notes` bucket the editor
// uses and turned into an `image` block carrying the public URL.
//
// Fetching a caller-supplied URL is an SSRF vector, so every URL (and every
// redirect hop) must be https on port 443, carry no credentials and resolve
// only to public addresses. The body is streamed with a hard size cap and the
// real type comes from the bytes, never from Content-Type.
import net from 'node:net'
import { lookup as dnsLookup } from 'node:dns/promises'

export const MAX_IMAGES_PER_APPEND = 5
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const FETCH_TIMEOUT_MS = 10000
export const MAX_REDIRECTS = 3
export const NOTES_BUCKET = 'runly-notes'
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export class ImageAppendError extends Error {
  constructor(message, status = 422) {
    super(message)
    this.name = 'ImageAppendError'
    this.status = status
  }
}

// ---------------------------------------------------------------------------
// Address classification
// ---------------------------------------------------------------------------

function ipv4ToInt(address) {
  return address.split('.').reduce((acc, part) => acc * 256 + Number(part), 0)
}

const V4_RANGES = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 3], // multicast + reserved + broadcast (224.0.0.0 - 255.255.255.255)
].map(([base, bits]) => ({ start: ipv4ToInt(base), size: 2 ** (32 - bits) }))

export function isBlockedIpv4(address) {
  const n = ipv4ToInt(address)
  return V4_RANGES.some(({ start, size }) => n >= start && n < start + size)
}

// Expands any valid IPv6 text (including an embedded dotted IPv4 tail) into
// eight 16-bit groups.
function expandIpv6(address) {
  let text = address.toLowerCase()
  const tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (tail) {
    const [a, b, c, d] = tail[1].split('.').map(Number)
    text = text.slice(0, -tail[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const [head, rest] = text.split('::')
  const headGroups = head ? head.split(':') : []
  const restGroups = rest !== undefined ? (rest ? rest.split(':') : []) : null
  const groups = restGroups === null
    ? headGroups
    : [...headGroups, ...Array(8 - headGroups.length - restGroups.length).fill('0'), ...restGroups]
  return groups.map((g) => parseInt(g, 16))
}

export function isBlockedIpv6(address) {
  if (address.includes('%')) return true
  const g = expandIpv6(address)
  if (g.length !== 8 || g.some((x) => !Number.isInteger(x))) return true
  const embedded = () => `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    // ::, ::1, IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d)
    if (g[5] === 0 && g[6] === 0 && g[7] <= 1) return true
    return isBlockedIpv4(embedded())
  }
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isBlockedIpv4(embedded()) // NAT64
  if (g[0] === 0x2002) return isBlockedIpv4(`${g[1] >> 8}.${g[1] & 255}.${g[2] >> 8}.${g[2] & 255}`) // 6to4
  if ((g[0] & 0xfe00) === 0xfc00) return true // unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true // link local
  if ((g[0] & 0xff00) === 0xff00) return true // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true // documentation
  return false
}

export function isBlockedAddress(address) {
  if (net.isIPv4(address)) return isBlockedIpv4(address)
  if (net.isIPv6(address)) return isBlockedIpv6(address)
  return true
}

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

// Static checks only (no DNS): usable synchronously when preparing an action.
export function parseSafeImageUrl(raw) {
  let url
  try { url = new URL(String(raw)) } catch { throw new ImageAppendError('La URL de la imagen no es válida.') }
  if (url.protocol !== 'https:') throw new ImageAppendError('Solo se aceptan imágenes con enlace https.')
  if (url.username || url.password) throw new ImageAppendError('La URL de la imagen no puede incluir credenciales.')
  if (url.port && url.port !== '443') throw new ImageAppendError('La URL de la imagen debe usar el puerto 443.')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host) && isBlockedAddress(host)) throw new ImageAppendError('La URL de la imagen apunta a una dirección no permitida.')
  return url
}

// Full check: static rules plus DNS resolution to public addresses only.
export async function assertSafeImageUrl(raw, { lookupImpl = dnsLookup } = {}) {
  const url = parseSafeImageUrl(raw)
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host)) return url
  let addresses
  try { addresses = await lookupImpl(host, { all: true }) } catch { addresses = [] }
  if (!addresses?.length) throw new ImageAppendError(`No se pudo resolver el dominio ${host}.`)
  if (addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new ImageAppendError('La URL de la imagen apunta a una dirección no permitida.')
  }
  return url
}

// Host only, so logs and confirmation text never carry query strings/tokens.
export function hostOfUrl(raw) {
  try { return new URL(String(raw)).hostname } catch { return '(url no válida)' }
}

// ---------------------------------------------------------------------------
// Magic bytes + dimensions
// ---------------------------------------------------------------------------

const EXT_BY_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

export function detectImageType(buf) {
  if (!buf || buf.length < 12) return null
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  const head = buf.subarray(0, 6).toString('latin1')
  if (head === 'GIF87a' || head === 'GIF89a') return { mime: 'image/gif', ext: 'gif' }
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
  return null
}

// Pixel size from the header, or null when it cannot be read.
export function readImageSize(buf, mime) {
  try {
    if (mime === 'image/png' && buf.length >= 24) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
    if (mime === 'image/gif' && buf.length >= 10) return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
    if (mime === 'image/jpeg') {
      let i = 2
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue }
        const marker = buf[i + 1]
        if (marker === 0xff) { i++; continue }
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) }
        }
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
        i += 2 + buf.readUInt16BE(i + 2)
      }
      return null
    }
    if (mime === 'image/webp' && buf.length >= 30) {
      const chunk = buf.subarray(12, 16).toString('latin1')
      if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
      if (chunk === 'VP8L') {
        const b = buf.subarray(21, 25)
        return { width: 1 + (b[0] | ((b[1] & 0x3f) << 8)), height: 1 + ((b[1] >> 6) | (b[2] << 2) | ((b[3] & 0x0f) << 10)) }
      }
      if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) }
    }
  } catch { /* fall through */ }
  return null
}

// Mirrors computeInitialImageWidthPct in the editor (imageSize.js) with an
// assumed 720px content column, since the server cannot measure the real one.
export function initialImageWidthPct(size, columnWidthPx = 720) {
  const DEFAULT = 60, MIN = 20, MAX_HEIGHT = 480
  if (!size?.width || !size?.height) return DEFAULT
  const forHeightCap = ((MAX_HEIGHT * (size.width / size.height)) / columnWidthPx) * 100
  return Math.round(Math.min(100, Math.max(MIN, Math.min(DEFAULT, forHeightCap))))
}

// ---------------------------------------------------------------------------
// Bytes in
// ---------------------------------------------------------------------------

function verifyBytes(buffer) {
  if (!buffer.length) throw new ImageAppendError('La imagen está vacía.')
  if (buffer.length > MAX_IMAGE_BYTES) throw new ImageAppendError('La imagen supera 10 MB.')
  const type = detectImageType(buffer)
  if (!type) throw new ImageAppendError('Formato no admitido: solo PNG, JPEG, WebP o GIF.')
  return { buffer, ...type, size: readImageSize(buffer, type.mime) }
}

export async function fetchImageBytes(rawUrl, { fetchImpl = fetch, lookupImpl = dnsLookup } = {}) {
  let url = await assertSafeImageUrl(rawUrl, { lookupImpl })
  let response
  for (let hop = 0; ; hop++) {
    try {
      response = await fetchImpl(url.toString(), { redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { accept: 'image/png,image/jpeg,image/webp,image/gif' } })
    } catch {
      throw new ImageAppendError(`No se pudo descargar la imagen de ${url.hostname}.`)
    }
    if (response.status < 300 || response.status >= 400) break
    const location = response.headers.get('location')
    if (!location || hop >= MAX_REDIRECTS) throw new ImageAppendError('La imagen tiene demasiadas redirecciones.')
    let next
    try { next = new URL(location, url).toString() } catch { throw new ImageAppendError('Redirección no válida.') }
    url = await assertSafeImageUrl(next, { lookupImpl })
  }
  if (!response.ok) throw new ImageAppendError(`El servidor de ${url.hostname} respondió ${response.status}.`)
  if (Number(response.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) throw new ImageAppendError('La imagen supera 10 MB.')
  const chunks = []
  let size = 0
  try {
    for await (const chunk of response.body) {
      size += chunk.length
      if (size > MAX_IMAGE_BYTES) throw new ImageAppendError('La imagen supera 10 MB.')
      chunks.push(chunk)
    }
  } catch (err) {
    if (err instanceof ImageAppendError) throw err
    throw new ImageAppendError(`No se pudo descargar la imagen de ${url.hostname}.`)
  }
  return verifyBytes(Buffer.concat(chunks))
}

// ---------------------------------------------------------------------------
// Resolve + upload
// ---------------------------------------------------------------------------

// Collects every image to attach, in document order: markdown image lines
// first (where they appear among the blocks), then the `images` array.
export function collectImageRequests(blocks, images = []) {
  const requests = []
  for (const b of blocks) if (b.type === 'image') requests.push({ block: b, source: { url: b.url }, alt: b.alt })
  for (const img of images) {
    const block = { type: 'image', alt: img.alt ?? '' }
    blocks.push(block)
    requests.push({ block, source: img, alt: img.alt })
  }
  if (requests.length > MAX_IMAGES_PER_APPEND) throw new ImageAppendError(`Máximo ${MAX_IMAGES_PER_APPEND} imágenes por llamada.`, 400)
  return requests
}

export function createNoteImageAppender({ supabaseAdmin = null, fetchImpl = fetch, lookupImpl = dnsLookup } = {}) {
  // Validates, downloads and uploads ALL images before returning; on any
  // failure the already uploaded objects are removed and the error rethrown,
  // so the caller can leave the note untouched. Mutates the image blocks in
  // `blocks` (src/width/aspectRatio) and appends the `images` array ones.
  async function attach({ blocks, images = [], companyId, userId, noteId }) {
    const requests = collectImageRequests(blocks, images)
    if (!requests.length) return 0
    if (!supabaseAdmin?.storage) throw new ImageAppendError('El almacenamiento de imágenes no está disponible en este momento.', 503)
    for (const r of requests) if (r.source.url) parseSafeImageUrl(r.source.url)
    const uploaded = []
    try {
      for (const r of requests) {
        if (!r.source.url) throw new ImageAppendError('Las imagenes se indican solo por URL https.', 400)
        const loaded = await fetchImageBytes(r.source.url, { fetchImpl, lookupImpl })
        const prefix = companyId ? `companies/${companyId}/notes/${noteId}` : `notes/${userId}/${noteId}`
        const key = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${EXT_BY_MIME[loaded.mime]}`
        const { error } = await supabaseAdmin.storage.from(NOTES_BUCKET).upload(key, loaded.buffer, { contentType: loaded.mime, upsert: false })
        if (error) throw new ImageAppendError('No se pudo guardar la imagen en el almacenamiento.', 502)
        uploaded.push(key)
        const { data } = supabaseAdmin.storage.from(NOTES_BUCKET).getPublicUrl(key)
        r.block.src = data.publicUrl
        r.block.alt = String(r.alt ?? '').slice(0, 200)
        r.block.width = initialImageWidthPct(loaded.size)
        r.block.aspectRatio = loaded.size?.width && loaded.size?.height ? Number((loaded.size.width / loaded.size.height).toFixed(4)) : null
      }
    } catch (err) {
      if (uploaded.length) await supabaseAdmin.storage.from(NOTES_BUCKET).remove(uploaded).catch(() => {})
      throw err
    }
    return requests.length
  }
  return { attach }
}
