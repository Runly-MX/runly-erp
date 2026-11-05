// Client for the site's customer accounts (/public/website/account/*). Same origin as the page: the session is an
// httpOnly cookie set by this host. Mutations always send JSON (the API rejects anything else as CSRF protection).
import { readAtlasConfig } from './catalogPublicClient.js'

const MESSAGES = {
  INVALID_CREDENTIALS: 'Correo o contraseña incorrectos.',
  LOCKED: 'Por seguridad bloqueamos la cuenta unos minutos tras varios intentos fallidos. Intenta más tarde.',
  EMAIL_NOT_VERIFIED: 'Confirma tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.',
  RATE_LIMITED: 'Demasiados intentos. Espera un momento e intenta de nuevo.',
  SIGNUP_CLOSED: 'Por ahora este sitio no acepta cuentas nuevas.',
  EMAIL_TAKEN: 'Ya existe una cuenta con ese correo.',
  TOKEN_INVALID: 'El enlace no es válido o ya expiró. Solicita uno nuevo.',
  VALIDATION_ERROR: 'Revisa los datos del formulario.',
  INVALID_PASSWORD: 'La contraseña actual no es correcta.',
  CHALLENGE_FAILED: 'No pudimos verificar que eres una persona. Intenta de nuevo.',
  UNAUTHENTICATED: 'Tu sesión terminó. Inicia sesión de nuevo.',
}

export const accountErrorMessage = (error) => MESSAGES[error?.code] ?? 'No se pudo completar la solicitud. Intenta de nuevo.'

// Resolves to the JSON body (null on 204). Rejects with { status, code } so callers can branch on 401/404.
export async function accountApi(path, body) {
  const base = readAtlasConfig()?.apiUrl ?? ''
  const init = body === undefined
    ? { credentials: 'same-origin' }
    : { method: path === '/me' ? 'PATCH' : 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  const res = await fetch(`${base}/public/website/account${path}`, init)
  if (res.status === 204) return null
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(json.error || `HTTP ${res.status}`), { status: res.status, code: json.code })
  return json
}
