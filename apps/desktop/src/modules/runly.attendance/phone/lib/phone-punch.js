// Scan-with-phone punch: the kiosk shows a challenge QR (`RK1.<kioskId>.<unixSeconds>.<mac>`),
// the phone signs `${personId}|${challenge}` with its non-extractable key and POSTs it.
import { bytesToBase64Url } from '../../kiosk/lib/encoding.js'
import { getApiUrl } from '../../../../lib/runtimeConfig.js'

export const CHALLENGE_PREFIX = 'RK1.'

export const isChallenge = (text) => typeof text === 'string' && /^RK1\.[^.\s]+\.\d+\.[^.\s]+$/.test(text.trim())

export async function signChallenge(personId, challenge, privateKey, subtle = globalThis.crypto.subtle) {
  const message = new TextEncoder().encode(`${personId}|${challenge}`)
  const signature = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, message)
  return bytesToBase64Url(signature)
}

const REVOKED = 'Este teléfono ya no está autorizado. Pide una nueva invitación a tu administrador.'
const ERROR_MESSAGES = {
  BAD_CHALLENGE: 'Ese código ya no es válido. Escanea el que muestra el kiosko ahora.',
  REPLAY: 'Ese código ya se usó. Espera al siguiente.',
  UNKNOWN_PERSON: REVOKED,
  BAD_SIGNATURE: REVOKED,
  KIOSK_NOT_FOUND: 'No se encontró ese kiosko. Avisa a tu administrador.',
}
export const OFFLINE_MESSAGE = 'Necesitas conexión a internet para checar escaneando. Si no hay señal usa Mostrar mi QR.'

export function phonePunchErrorMessage({ code, status } = {}) {
  if (code === 'NETWORK' || status === 0) return OFFLINE_MESSAGE
  if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  if (status === 429) return 'Demasiados intentos. Espera unos segundos e inténtalo de nuevo.'
  return 'No se pudo registrar la checada. Inténtalo de nuevo.'
}

// Never blocks the punch: resolves to null after `timeoutMs` or on any failure/denial.
export function currentPosition(timeoutMs = 4000, geo = globalThis.navigator?.geolocation) {
  if (!geo) return Promise.resolve(null)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs)
    try {
      geo.getCurrentPosition(
        (pos) => { clearTimeout(timer); resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }) },
        () => { clearTimeout(timer); resolve(null) },
        { timeout: timeoutMs, maximumAge: 60_000 },
      )
    } catch { clearTimeout(timer); resolve(null) }
  })
}

export async function postPhonePunch({ challenge, personId, signature, position }, fetchImpl = fetch) {
  let response
  try {
    response = await fetchImpl(`${getApiUrl()}/public/attendance/phone-punch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge, personId, signature, ...(position ?? {}) }),
    })
  } catch {
    const error = new Error(OFFLINE_MESSAGE)
    error.code = 'NETWORK'
    error.status = 0
    throw error
  }
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(phonePunchErrorMessage({ code: json.code, status: response.status }))
    error.code = json.code ?? null
    error.status = response.status
    throw error
  }
  return json.data
}
