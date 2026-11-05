// External Identity engine (docs/architecture/external-identity-realms.md). Module-agnostic: a consumer
// module owns a realm (moduleKey + ownerId) and decides how a request maps to it; this service only ever
// works inside the realm it is given, so an account, session or token of one realm is never valid in another.
import { DUMMY_HASH, hashPassword, hashToken, newToken, normalizeEmail, verifyPassword } from './crypto.js'

export class ExternalIdentityError extends Error {
  constructor(message, status, code) { super(message); this.name = 'ExternalIdentityError'; this.status = status; this.code = code }
}
const fail = (message, status, code) => new ExternalIdentityError(message, status, code)
const invalidCredentials = () => fail('Correo o contraseña incorrectos.', 401, 'INVALID_CREDENTIALS')
const invalidToken = () => fail('El enlace no es válido o ya expiró.', 400, 'TOKEN_INVALID')

export const MAX_FAILED_LOGINS = 10
export const LOCK_MS = 15 * 60 * 1000
export const TOKEN_TTL_MS = { verify_email: 24 * 3600 * 1000, reset_password: 3600 * 1000 }
export const PASSWORD_MIN = 10, PASSWORD_MAX = 128

export const publicAccount = (a) => ({ id: a.id, email: a.email, displayName: a.displayName, phone: a.phone ?? null, emailVerified: Boolean(a.emailVerifiedAt), avatarFileId: a.avatarFileId ?? null })

function assertPassword(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX)
    throw fail(`La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres.`, 422, 'VALIDATION_ERROR')
}

// notify({ realm, account, kind, token, context }) is supplied by the consumer: it builds the link and sends the email.
// kind: 'verify_email' | 'reset_password' | 'already_registered'. onRegistered({ realm, account }) runs after
// an account is created (website uses it to link a Contact). Both are best effort: a failure never undoes the account.
export function createExternalIdentity({ prisma, notify = async () => {}, onRegistered = async () => {}, now = () => new Date() }) {
  const later = (ms) => new Date(now().getTime() + ms)
  const quiet = async (fn) => { try { await fn() } catch (error) { console.warn('[external-identity] side effect failed:', error?.code ?? error?.name ?? 'Error') } }

  async function ensureRealm({ companyId, moduleKey, ownerId }) {
    return prisma.externalRealm.upsert({ where: { moduleKey_ownerId: { moduleKey, ownerId } }, create: { companyId, moduleKey, ownerId }, update: {} })
  }
  const findRealm = ({ moduleKey, ownerId }) => prisma.externalRealm.findUnique({ where: { moduleKey_ownerId: { moduleKey, ownerId } } })
  const updateRealm = (realm, data) => prisma.externalRealm.update({ where: { id: realm.id }, data })

  async function createSession(realm, account, userAgent) {
    const token = newToken()
    await prisma.externalSession.create({ data: { accountId: account.id, realmId: realm.id, tokenHash: hashToken(token), expiresAt: later(realm.sessionDays * 86400 * 1000), userAgent: userAgent?.slice(0, 300) ?? null } })
    return { token, maxAgeSeconds: realm.sessionDays * 86400 }
  }

  async function issueToken(account, purpose) {
    const token = newToken()
    await prisma.externalAccountToken.create({ data: { accountId: account.id, purpose, tokenHash: hashToken(token), expiresAt: later(TOKEN_TTL_MS[purpose]) } })
    return token
  }

  async function consumeToken(realm, token, purpose) {
    const row = await prisma.externalAccountToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { account: true } })
    if (!row || row.purpose !== purpose || row.account.realmId !== realm.id || row.usedAt || row.expiresAt <= now()) throw invalidToken()
    // Conditional update: two concurrent uses of the same link cannot both succeed.
    const { count } = await prisma.externalAccountToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now() } })
    if (count !== 1) throw invalidToken()
    return row.account
  }

  const revokeAll = (accountId, exceptSessionId = null) => prisma.externalSession.updateMany({
    where: { accountId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) }, data: { revokedAt: now() } })

  async function register({ realm, email, password, displayName, phone = null, userAgent = null, context = null }) {
    if (!realm.allowSignup) throw fail('El registro está cerrado en este sitio.', 403, 'SIGNUP_CLOSED')
    assertPassword(password)
    email = normalizeEmail(email)
    const existing = await prisma.externalAccount.findUnique({ where: { realmId_email: { realmId: realm.id, email } } })
    if (existing) {
      // With verification on, the answer is identical to a new sign-up and only the owner of the inbox learns more.
      if (realm.requireEmailVerification) { await quiet(() => notify({ realm, account: existing, kind: 'already_registered', token: null, context })); return { verificationRequired: true } }
      throw fail('Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.', 409, 'EMAIL_TAKEN')
    }
    let account
    try {
      account = await prisma.externalAccount.create({ data: { realmId: realm.id, companyId: realm.companyId, email, displayName: String(displayName).trim(), phone, passwordHash: await hashPassword(password) } })
    } catch (error) {
      if (error?.code === 'P2002') return realm.requireEmailVerification ? { verificationRequired: true } : Promise.reject(fail('Ese correo ya tiene una cuenta.', 409, 'EMAIL_TAKEN'))
      throw error
    }
    await quiet(() => onRegistered({ realm, account }))
    if (realm.requireEmailVerification) {
      await quiet(async () => notify({ realm, account, kind: 'verify_email', token: await issueToken(account, 'verify_email'), context }))
      return { verificationRequired: true }
    }
    return { account: publicAccount(account), session: await createSession(realm, account, userAgent) }
  }

  async function login({ realm, email, password, userAgent = null }) {
    const account = await prisma.externalAccount.findUnique({ where: { realmId_email: { realmId: realm.id, email: normalizeEmail(email) } } })
    if (!account) { await verifyPassword(String(password ?? ''), DUMMY_HASH); throw invalidCredentials() }
    if (account.lockedUntil && account.lockedUntil > now()) throw fail('Demasiados intentos. Intenta de nuevo en unos minutos.', 423, 'LOCKED')
    if (!(await verifyPassword(String(password ?? ''), account.passwordHash))) {
      const failed = account.failedLogins + 1
      await prisma.externalAccount.update({ where: { id: account.id }, data: failed >= MAX_FAILED_LOGINS ? { failedLogins: 0, lockedUntil: later(LOCK_MS) } : { failedLogins: failed } })
      throw invalidCredentials()
    }
    if (account.status !== 'active') throw invalidCredentials()
    if (realm.requireEmailVerification && !account.emailVerifiedAt) throw fail('Verifica tu correo para entrar. Revisa tu bandeja.', 403, 'EMAIL_NOT_VERIFIED')
    const updated = await prisma.externalAccount.update({ where: { id: account.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: now() } })
    return { account: publicAccount(updated), session: await createSession(realm, updated, userAgent) }
  }

  // The only way a request becomes "signed in": the token must belong to this realm, be live, and its account active.
  async function sessionFromToken({ realm, token }) {
    if (!token) return null
    const session = await prisma.externalSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { account: true } })
    if (!session || session.realmId !== realm.id || session.account.realmId !== realm.id || session.revokedAt || session.expiresAt <= now()) return null
    if (session.account.status !== 'active') { await revokeAll(session.accountId); return null }
    return { session, account: session.account }
  }

  async function logout({ token }) {
    if (token) await prisma.externalSession.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: now() } })
  }

  async function requestEmailVerification({ realm, account, context = null }) {
    if (account.emailVerifiedAt) return
    await notify({ realm, account, kind: 'verify_email', token: await issueToken(account, 'verify_email'), context })
  }

  async function verifyEmail({ realm, token }) {
    const account = await consumeToken(realm, token, 'verify_email')
    return publicAccount(await prisma.externalAccount.update({ where: { id: account.id }, data: { emailVerifiedAt: account.emailVerifiedAt ?? now() } }))
  }

  async function requestPasswordReset({ realm, email, context = null }) {
    const account = await prisma.externalAccount.findUnique({ where: { realmId_email: { realmId: realm.id, email: normalizeEmail(email) } } })
    if (!account || account.status !== 'active') return
    await quiet(async () => notify({ realm, account, kind: 'reset_password', token: await issueToken(account, 'reset_password'), context }))
  }

  async function resetPassword({ realm, token, password }) {
    assertPassword(password)
    const account = await consumeToken(realm, token, 'reset_password')
    // Opening the emailed link proves inbox ownership, so it also verifies the email.
    await prisma.externalAccount.update({ where: { id: account.id }, data: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null, emailVerifiedAt: account.emailVerifiedAt ?? now() } })
    await revokeAll(account.id)
  }

  async function updateProfile({ account, displayName, phone }) {
    const data = {}
    if (displayName !== undefined) data.displayName = String(displayName).trim()
    if (phone !== undefined) data.phone = phone || null
    return publicAccount(await prisma.externalAccount.update({ where: { id: account.id }, data }))
  }

  async function changePassword({ account, session, currentPassword, newPassword }) {
    assertPassword(newPassword)
    if (!(await verifyPassword(String(currentPassword ?? ''), account.passwordHash))) throw fail('La contraseña actual no es correcta.', 422, 'INVALID_PASSWORD')
    await prisma.externalAccount.update({ where: { id: account.id }, data: { passwordHash: await hashPassword(newPassword) } })
    await revokeAll(account.id, session.id)
  }

  // Admin side: always scoped by realm, never by a bare account id.
  async function listAccounts({ realm, search = '', status = null, limit = 50, offset = 0 }) {
    const where = { realmId: realm.id, ...(status ? { status } : {}),
      ...(search ? { OR: [{ email: { contains: search, mode: 'insensitive' } }, { displayName: { contains: search, mode: 'insensitive' } }] } : {}) }
    const [rows, total] = await Promise.all([
      prisma.externalAccount.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(Number(limit) || 50, 1), 200), skip: Math.max(Number(offset) || 0, 0) }),
      prisma.externalAccount.count({ where }),
    ])
    return { data: rows.map((a) => ({ ...publicAccount(a), status: a.status, contactId: a.contactId, lastLoginAt: a.lastLoginAt, createdAt: a.createdAt })), total }
  }

  async function accountInRealm(realm, accountId) {
    const account = await prisma.externalAccount.findFirst({ where: { id: accountId, realmId: realm.id } })
    if (!account) throw fail('Cuenta no encontrada.', 404, 'NOT_FOUND')
    return account
  }

  async function setAccountStatus({ realm, accountId, status }) {
    const before = await accountInRealm(realm, accountId)
    const after = await prisma.externalAccount.update({ where: { id: before.id }, data: { status } })
    if (status !== 'active') await revokeAll(before.id)
    return { before, after }
  }

  async function revokeSessions({ realm, accountId }) {
    await revokeAll((await accountInRealm(realm, accountId)).id)
  }

  return {
    ensureRealm, findRealm, updateRealm, register, login, sessionFromToken, logout,
    requestEmailVerification, verifyEmail, requestPasswordReset, resetPassword, updateProfile, changePassword,
    listAccounts, setAccountStatus, revokeSessions,
  }
}
