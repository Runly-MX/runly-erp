// Credentials for External Identity. Passwords: scrypt with self-describing parameters, so they can be
// raised later without breaking stored hashes. Tokens (sessions, email links): 32 random bytes; only
// their SHA-256 is ever stored.
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const N = 2 ** 15, R = 8, P = 1, KEYLEN = 32
const derive = (password, salt, n, r, p) => new Promise((resolve, reject) =>
  scrypt(password, salt, KEYLEN, { N: n, r, p, maxmem: 128 * n * r * 2 }, (err, key) => err ? reject(err) : resolve(key)))

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await derive(password, salt, N, R, P)
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`
}

export async function verifyPassword(password, stored) {
  const [kind, n, r, p, salt, hash] = String(stored ?? '').split('$')
  if (kind !== 'scrypt' || !hash) return false
  const expected = Buffer.from(hash, 'base64url')
  const key = await derive(password, Buffer.from(salt, 'base64url'), Number(n), Number(r), Number(p))
  return key.length === expected.length && timingSafeEqual(key, expected)
}

// Compared against when the email is unknown, so a miss costs the same time as a wrong password.
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'))

export const newToken = () => randomBytes(32).toString('base64url')
export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex')
export const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase()
