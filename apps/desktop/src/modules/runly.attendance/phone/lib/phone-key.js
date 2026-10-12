// Phone-key crypto: a non-extractable ECDSA P-256 private key stays on the
// device; only the public JWK is sent to the server. The rotating QR payload is
// `RA1.<personId>.<unixSeconds>.<sigB64u>`, signed (raw r||s) over `<personId>.<unixSeconds>`.
import { bytesToBase64Url } from '../../kiosk/lib/encoding.js'

export const ROTATE_SECONDS = 20

export async function generatePhoneKey(subtle = globalThis.crypto.subtle) {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
  const { kty, crv, x, y } = await subtle.exportKey('jwk', pair.publicKey)
  return { privateKey: pair.privateKey, publicJwk: { kty, crv, x, y } }
}

export async function buildPhonePayload(personId, privateKey, now = Date.now(), subtle = globalThis.crypto.subtle) {
  const ts = Math.floor(now / 1000)
  const message = new TextEncoder().encode(`${personId}.${ts}`)
  const signature = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, message)
  return { payload: `RA1.${personId}.${ts}.${bytesToBase64Url(signature)}`, ts }
}
