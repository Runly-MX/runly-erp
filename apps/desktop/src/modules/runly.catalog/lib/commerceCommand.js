// apps/desktop/src/modules/runly.catalog/lib/commerceCommand.js
//
// Client side of the C1/C5 command contract: every write carries an
// Idempotency-Key that identifies one logical attempt. A retry after a lost
// response must resend the same key with the same body (the server replays
// the confirmed result); editing the form starts a new attempt.

function randomHex(bytes) {
  const values = new Uint8Array(bytes)
  globalThis.crypto.getRandomValues(values)
  return [...values].map((v) => v.toString(16).padStart(2, '0')).join('')
}

export function newAttemptKey(prefix = 'catalog') {
  return `${prefix}-${Date.now().toString(36)}-${randomHex(12)}`
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

// Keeps one key per distinct body until the attempt is confirmed (reset).
export function createAttemptTracker(prefix) {
  let pending = null
  return {
    keyFor(body) {
      const signature = canonical(body)
      if (!pending || pending.signature !== signature) pending = { signature, key: newAttemptKey(prefix) }
      return pending.key
    },
    reset() { pending = null },
    get pendingKey() { return pending?.key ?? null },
  }
}

const MESSAGES = {
  FORBIDDEN: 'No tienes permiso para esta acción. Pide a un administrador que te lo asigne.',
  INSUFFICIENT_STOCK: 'No hay existencias suficientes en esa ubicación.',
  RECONCILIATION_REQUIRED: 'El saldo de este artículo no coincide con sus ubicaciones y necesita conciliación antes de moverlo.',
  IDEMPOTENCY_CONFLICT: 'Este intento ya se usó con otros datos. Revisa el formulario y vuelve a guardar.',
  IDEMPOTENCY_REQUIRED: 'No se pudo identificar el intento. Vuelve a guardar.',
  CONFIGURATION_REQUIRED: 'Configura primero la moneda e impuestos del punto de venta.',
  VARIANT_REQUIRED: 'Elige una variante: este producto tiene existencias por variante.',
  NOT_FOUND: 'El registro ya no existe o fue eliminado.',
}

// kind: lost (unknown outcome, retry with the same key), forbidden, conflict,
// stock, validation, notFound, config, error.
export function classifyCommerceError(error) {
  const status = Number(error?.status) || 0
  const code = error?.code ?? null
  const serverMessage = typeof error?.message === 'string' ? error.message : ''
  if (!status || status >= 500 || status === 408) {
    return {
      kind: 'lost',
      code,
      retrySameKey: true,
      message: 'No recibimos la confirmación. Puede que se haya guardado: reintenta y no se duplicará.',
    }
  }
  if (status === 401 || status === 403 || code === 'FORBIDDEN') return { kind: 'forbidden', code, message: MESSAGES.FORBIDDEN }
  if (code === 'IDEMPOTENCY_CONFLICT') return { kind: 'conflict', code, message: MESSAGES.IDEMPOTENCY_CONFLICT }
  if (code === 'INSUFFICIENT_STOCK' || code === 'RECONCILIATION_REQUIRED') {
    return { kind: 'stock', code, message: MESSAGES[code] }
  }
  if (code === 'CONFIGURATION_REQUIRED') return { kind: 'config', code, message: MESSAGES.CONFIGURATION_REQUIRED }
  if (status === 404 || code === 'NOT_FOUND') {
    return { kind: 'notFound', code, message: /[áéíóúñ]/i.test(serverMessage) ? serverMessage : MESSAGES.NOT_FOUND }
  }
  if (code && MESSAGES[code]) return { kind: 'validation', code, message: MESSAGES[code] }
  if (status === 409) return { kind: 'conflict', code, message: serverMessage || 'Otro cambio llegó primero. Recarga y vuelve a intentarlo.' }
  // New routes answer in Spanish; legacy zod messages are English defaults.
  const spanish = serverMessage && !/^(Internal error|Not found|Invalid|Too |Expected|Required)/i.test(serverMessage)
  return { kind: 'validation', code, message: spanish ? serverMessage : 'Revisa los datos e inténtalo de nuevo.' }
}
