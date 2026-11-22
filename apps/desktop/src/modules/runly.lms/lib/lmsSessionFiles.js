// Evaluation deliveries (spec 2026-11-21 phase 3): checks before uploading,
// SHA-256 of the file, and the upload with progress. The server re-checks type,
// size and hash on the stored bytes; these checks only spare a useless upload.

const ext = (name) => (/\.([a-z0-9]{1,8})$/i.exec(String(name ?? '').trim())?.[1] ?? '').toLowerCase()

// acceptedTypes: [{ key, label, ext }] from the session payload.
export const acceptAttr = (types = []) => types.map((type) => `.${type.ext}`).join(',') || '*/*'
export const formatsLabel = (types = []) => types.map((type) => type.ext.toUpperCase()).join(', ')

// Spanish message when the file cannot go, or null.
export function precheckFile(file, { acceptedTypes = [], maxFileMb = 50 } = {}) {
  const allowed = acceptedTypes.map((type) => type.ext)
  // xls/jpg families: the server knows jpeg as jpg.
  const own = ext(file?.name) === 'jpeg' ? 'jpg' : ext(file?.name)
  if (allowed.length && !allowed.includes(own)) return `«${file.name}» no es de un formato admitido (${formatsLabel(acceptedTypes)}).`
  if (!file?.size) return `«${file?.name ?? 'El archivo'}» está vacío.`
  if (file.size > maxFileMb * 1024 * 1024) return `«${file.name}» supera ${maxFileMb} MB.`
  return null
}

export async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

// PUT to the signed URL with upload progress (fetch has none). Resolves on 2xx.
export function putWithProgress(url, body, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100)) }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(Object.assign(new Error('La transferencia no se completó.'), { code: 'TRANSFER_FAILED' })))
    xhr.onerror = () => reject(Object.assign(new Error('Se perdió la conexión durante la subida.'), { code: 'TRANSFER_FAILED' }))
    xhr.send(body)
  })
}

// Server codes that mean the file itself was refused (retrying the same file is
// useless). Size/hash mismatches are transfer damage: a fresh upload may work.
export const REJECTED_CODES = new Set(['TYPE_NOT_ALLOWED', 'CONTENT_MISMATCH', 'TOO_LARGE'])
// Codes after which the same authorization can be retried (the object is not stored yet).
export const RETRY_SAME_AUTH = new Set(['TRANSFER_FAILED', 'NOT_UPLOADED'])
