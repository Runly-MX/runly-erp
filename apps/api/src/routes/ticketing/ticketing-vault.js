// runly.ticketing F6E credential vault. The QR secret of the current credential is sealed
// with AES-256-GCM so a still-valid QR can be e-mailed again (resend) without changing it.
// - Keys live outside the database: TICKETING_CREDENTIAL_KEYS="k2:<base64 32 bytes>,k1:<...>";
//   the first one seals, all of them open (rotation: add a new first key, re-seal, drop the old).
// - Each row has a random 12-byte nonce and the GCM tag; the AAD binds it to company, ticket
//   and credential version, so a ciphertext copied to another row or version never opens.
// - Validation never uses this: gates keep comparing SHA-256 hashes (F6D unchanged).
// - Without keys nothing is sealed: tickets are still issued and admitted, but cannot be
//   resent; staff reissue instead (explicit REISSUE_REQUIRED).
import crypto from 'node:crypto'

const KEY_ID = /^[A-Za-z0-9_-]{1,32}$/

export function parseVaultKeys(value) {
  const keys = []
  for (const part of String(value ?? '').split(',').map((p) => p.trim()).filter(Boolean)) {
    const at = part.indexOf(':')
    const id = part.slice(0, at), raw = Buffer.from(part.slice(at + 1), 'base64')
    if (at < 1 || !KEY_ID.test(id) || raw.length !== 32) throw new Error('TICKETING_CREDENTIAL_KEYS inválido: use id:base64 de 32 bytes separados por comas')
    if (keys.some((k) => k.id === id)) throw new Error(`TICKETING_CREDENTIAL_KEYS repite la clave ${id}`)
    keys.push({ id, key: raw })
  }
  return keys
}

const aad = ({ companyId, ticketId, version }) => Buffer.from(`runly.ticketing.credential:v1:${companyId}:${ticketId}:${version}`)

export function createTicketingVault({ env = process.env } = {}) {
  const keys = parseVaultKeys(env.TICKETING_CREDENTIAL_KEYS)
  const enabled = keys.length > 0

  function seal({ companyId, ticketId, version, secret }) {
    if (!enabled) return null
    const [{ id, key }] = keys
    const nonce = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce)
    cipher.setAAD(aad({ companyId, ticketId, version }))
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
    return { keyId: id, nonce, ciphertext, tag: cipher.getAuthTag() }
  }

  // Throws on a wrong key, a tampered row or a row moved to another ticket/version.
  function open(row) {
    const entry = keys.find((k) => k.id === row.key_id)
    if (!entry) throw new Error(`Clave de credenciales no disponible: ${row.key_id}`)
    const decipher = crypto.createDecipheriv('aes-256-gcm', entry.key, row.nonce)
    decipher.setAAD(aad({ companyId: row.company_id, ticketId: row.ticket_id, version: row.credential_version }))
    decipher.setAuthTag(row.tag)
    return Buffer.concat([decipher.update(row.ciphertext), decipher.final()]).toString('utf8')
  }

  // In the issuing transaction: replaces whatever copy the ticket had (old versions die).
  async function store(tx, { companyId, ticketId, version, secret }) {
    const sealed = seal({ companyId, ticketId, version, secret })
    if (!sealed) { await forget(tx, ticketId); return false }
    await tx.$executeRaw`
      INSERT INTO ticket_credential_secret (ticket_id, company_id, credential_version, key_id, nonce, ciphertext, tag)
      VALUES (${ticketId}::uuid, ${companyId}::uuid, ${version}, ${sealed.keyId}, ${sealed.nonce}, ${sealed.ciphertext}, ${sealed.tag})
      ON CONFLICT (ticket_id) DO UPDATE SET credential_version = EXCLUDED.credential_version, key_id = EXCLUDED.key_id,
        nonce = EXCLUDED.nonce, ciphertext = EXCLUDED.ciphertext, tag = EXCLUDED.tag, created_at = now()`
    return true
  }
  const forget = (tx, ticketId) => tx.$executeRaw`DELETE FROM ticket_credential_secret WHERE ticket_id = ${ticketId}::uuid`

  // Mail worker only: the plaintext of the ticket's CURRENT credential, or null when the
  // ticket predates F6E, the copy belongs to an older version, or it is no longer valid.
  async function reveal(db, { companyId, ticketId }) {
    const row = (await db.$queryRaw`
      SELECT s.* FROM ticket_credential_secret s JOIN ticket t ON t.id = s.ticket_id AND t.company_id = s.company_id
       WHERE s.ticket_id = ${ticketId}::uuid AND s.company_id = ${companyId}::uuid
         AND t.status = 'ISSUED' AND t.credential_version = s.credential_version AND t.credential_hash IS NOT NULL`)[0]
    if (!row) return null
    const secret = open(row)
    // Belt and braces: the copy must still match the hash gates use.
    const current = (await db.$queryRaw`SELECT credential_hash FROM ticket WHERE id = ${ticketId}::uuid`)[0]?.credential_hash
    return crypto.createHash('sha256').update(secret).digest('hex') === current ? secret : null
  }

  return { enabled, seal, open, store, forget, reveal, currentKeyId: keys[0]?.id ?? null }
}
