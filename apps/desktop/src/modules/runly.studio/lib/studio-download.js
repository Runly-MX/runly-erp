// Download flow helpers: readable file names and error messages that never
// expose tokens, private URLs or server internals.
export const downloadName = (name, extension) => `${String(name ?? '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 80) || 'diseño'}.${extension}`

const BY_STATUS = {
  401: 'Tu sesión terminó. Vuelve a iniciar sesión y descarga de nuevo.',
  403: 'No tienes permiso para descargar este diseño.',
  404: 'El diseño ya no está disponible.',
  408: 'El servidor tardó demasiado en responder. Vuelve a intentarlo.',
  413: 'El archivo es demasiado grande para generarlo. Elige un tamaño menor.',
  429: 'Hay demasiadas descargas a la vez. Espera un momento y vuelve a intentarlo.',
}
const GENERIC = 'No se pudo generar el archivo. Vuelve a intentarlo.'
// Anything that looks like a URL, credential, path or stack trace is dropped.
const UNSAFE = /https?:\/\/|\bwww\.|bearer|authorization|apikey|token|secret|password|eyJ[\w-]{10,}|[A-Za-z0-9+/_-]{32,}|[a-z]:\\|\/(?:app|home|usr|var|srv)\/|\bat\s+\S+\s*\(|\.(?:js|mjs|jsx|ts):\d+|ECONN|ENOTFOUND|getaddrinfo|127\.0\.0\.1|localhost/i

export function sanitizeExportError(error) {
  const status = Number(error?.status)
  if (BY_STATUS[status]) return BY_STATUS[status]
  if (status >= 500) return 'El servidor no pudo generar el archivo. Vuelve a intentarlo en unos minutos.'
  if (error?.name === 'TypeError' || /failed to fetch|networkerror|load failed/i.test(String(error?.message))) return 'No se pudo conectar con el servidor. Revisa tu conexión y vuelve a intentarlo.'
  const message = String(error?.message ?? '').replace(/\s+/g, ' ').trim()
  return message && message.length <= 220 && !UNSAFE.test(message) ? message : GENERIC
}

// Lets the browser paint the progress notice before a long synchronous render.
export const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))
