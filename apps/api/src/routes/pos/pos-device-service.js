// Registers opened from a link. The device pairs once (it shows a 6-digit code
// that an admin approves, as attendance kiosks do); each cashier then enters
// with a PIN and gets a short-lived operator token. That token resolves to the
// cashier's own user and permissions and is accepted only on /pos/v2/*.
import { createHmac, timingSafeEqual } from "node:crypto";
import { openWithSecret, randomDigits, randomToken, sealWithSecret, sha256 } from "../attendance/attendance-core.js";
import { PosServiceError, requireCompanyId, writeAudit } from "./service-helpers.js";

const PAIRING_TTL_MS = 30 * 60_000;
const OPERATOR_TTL_MS = 12 * 60 * 60_000;
const MAX_PIN_ATTEMPTS = 5;
const LOCK_MS = 5 * 60_000;
const CHECK_CACHE_MS = 30_000;
export const OPERATOR_PREFIX = "posop.";

const fail = (message, status, code) => { throw Object.assign(new PosServiceError(message, status), { code }); };

export function createPosDeviceService({ prisma, secret = process.env.POS_DEVICE_SECRET || process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET, now = () => Date.now() }) {
  const checks = new Map(); // linkId -> { at, pairedAt } (revocation checked at most every 30 s)

  const hmac = (value) => createHmac("sha256", secret).update(value).digest("base64url");
  const pinHash = (companyId, pin) => hmac(`pin:${companyId}:${pin}`);
  const requireSecret = () => { if (!secret) fail("El acceso por enlace no está configurado en este servidor.", 503, "NOT_CONFIGURED"); };

  // ── Admin ────────────────────────────────────────────────────────────────
  async function list({ companyId }) {
    const scoped = requireCompanyId(companyId);
    const rows = await prisma.posDeviceLink.findMany({
      where: { companyId: scoped, revokedAt: null },
      include: { terminal: { select: { name: true, outlet: { select: { name: true } } } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id, name: row.name, terminalId: row.terminalId, linkToken: row.linkToken,
      terminalName: row.terminal?.name ?? null, outletName: row.terminal?.outlet?.name ?? null,
      paired: Boolean(row.deviceTokenHash), pairedAt: row.pairedAt, lastSeenAt: row.lastSeenAt,
      pairingPending: Boolean(!row.deviceTokenHash && row.pairingCode && row.pairingRequestedAt && now() - row.pairingRequestedAt.getTime() < PAIRING_TTL_MS),
      pairingLabel: row.pairingLabel,
    }));
  }

  async function create({ companyId, actorId, data }) {
    const scoped = requireCompanyId(companyId);
    const terminal = await prisma.posTerminal.findFirst({ where: { id: data.terminalId, companyId: scoped, enabled: true } });
    if (!terminal) fail("Caja no encontrada.", 404);
    const row = await prisma.posDeviceLink.create({
      data: { companyId: scoped, terminalId: terminal.id, name: data.name?.trim() || terminal.name, linkToken: randomToken(18), createdById: actorId },
    });
    await writeAudit(prisma, { actorId, entityType: "PosDeviceLink", entityId: row.id, action: "pos.device_link.create", after: { id: row.id, terminalId: row.terminalId } });
    return row;
  }

  async function own(companyId, id) {
    const row = await prisma.posDeviceLink.findFirst({ where: { id, companyId: requireCompanyId(companyId), revokedAt: null } });
    if (!row) fail("Enlace no encontrado.", 404);
    return row;
  }

  async function approve({ companyId, actorId, id, code }) {
    const row = await own(companyId, id);
    if (row.deviceTokenHash) fail("Este enlace ya tiene un dispositivo. Restablécelo para cambiarlo.", 409);
    const fresh = row.pairingRequestedAt && now() - row.pairingRequestedAt.getTime() < PAIRING_TTL_MS;
    if (!fresh || !row.pairingCode || String(code).trim() !== row.pairingCode) fail("El código no coincide o expiró. Pide al dispositivo uno nuevo.", 400);
    await prisma.posDeviceLink.update({ where: { id }, data: { approvedAt: new Date(now()) } });
    await writeAudit(prisma, { actorId, entityType: "PosDeviceLink", entityId: id, action: "pos.device_link.approve" });
    return { ok: true };
  }

  // Unpairs the device; every operator token issued for it stops working.
  async function reset({ companyId, actorId, id }) {
    await own(companyId, id);
    await prisma.posDeviceLink.update({ where: { id }, data: { deviceTokenHash: null, pairingCode: null, pairingSecretHash: null, pairingTokenEnc: null, approvedAt: null, pairedAt: null, failedPinAttempts: 0, pinLockedUntil: null } });
    checks.delete(id);
    await writeAudit(prisma, { actorId, entityType: "PosDeviceLink", entityId: id, action: "pos.device_link.reset" });
    return { ok: true };
  }

  async function revoke({ companyId, actorId, id }) {
    await own(companyId, id);
    await prisma.posDeviceLink.update({ where: { id }, data: { revokedAt: new Date(now()), deviceTokenHash: null, pairingTokenEnc: null } });
    checks.delete(id);
    await writeAudit(prisma, { actorId, entityType: "PosDeviceLink", entityId: id, action: "pos.device_link.revoke" });
    return { ok: true };
  }

  // Company members (never bots) with whether they have a PIN.
  async function listPins({ companyId }) {
    const scoped = requireCompanyId(companyId);
    const [members, pins] = await Promise.all([
      prisma.membership.findMany({ where: { companyId: scoped, enabled: true, user: { enabled: true, isBot: false } }, select: { user: { select: { id: true, displayName: true } } } }),
      prisma.posOperatorPin.findMany({ where: { companyId: scoped }, select: { userId: true } }),
    ]);
    const withPin = new Set(pins.map((p) => p.userId));
    return members.map((m) => ({ userId: m.user.id, displayName: m.user.displayName, hasPin: withPin.has(m.user.id) }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
  }

  async function setPin({ companyId, actorId, userId, pin }) {
    requireSecret();
    const scoped = requireCompanyId(companyId);
    if (!/^\d{4,6}$/.test(String(pin))) fail("El PIN debe tener de 4 a 6 dígitos.", 400);
    const member = await prisma.membership.findFirst({ where: { companyId: scoped, userId, enabled: true, user: { isBot: false } } });
    if (!member) fail("La persona no pertenece a la empresa.", 404);
    const hash = pinHash(scoped, pin);
    const taken = await prisma.posOperatorPin.findFirst({ where: { companyId: scoped, pinHash: hash, userId: { not: userId } } });
    if (taken) fail("Ese PIN ya lo usa otra persona. Elige otro.", 409);
    await prisma.posOperatorPin.upsert({
      where: { companyId_userId: { companyId: scoped, userId } },
      update: { pinHash: hash },
      create: { companyId: scoped, userId, pinHash: hash },
    });
    await writeAudit(prisma, { actorId, entityType: "PosOperatorPin", entityId: userId, action: "pos.operator_pin.set" });
    return { ok: true };
  }

  async function removePin({ companyId, actorId, userId }) {
    const scoped = requireCompanyId(companyId);
    await prisma.posOperatorPin.deleteMany({ where: { companyId: scoped, userId } });
    await writeAudit(prisma, { actorId, entityType: "PosOperatorPin", entityId: userId, action: "pos.operator_pin.remove" });
    return { ok: true };
  }

  // ── Public (device) ──────────────────────────────────────────────────────
  async function byLink(linkToken) {
    const row = linkToken ? await prisma.posDeviceLink.findUnique({ where: { linkToken: String(linkToken) } }) : null;
    if (!row || row.revokedAt) fail("Este enlace de caja no existe o fue desactivado.", 404, "LINK_NOT_FOUND");
    return row;
  }

  async function info(linkToken) {
    const row = await byLink(linkToken);
    const [terminal, company] = await Promise.all([
      prisma.posTerminal.findFirst({ where: { id: row.terminalId }, select: { id: true, name: true, outletId: true, outlet: { select: { name: true } } } }),
      prisma.company.findUnique({ where: { id: row.companyId }, select: { name: true } }),
    ]);
    return { name: row.name, companyName: company?.name ?? null, terminalName: terminal?.name ?? null, outletName: terminal?.outlet?.name ?? null, paired: Boolean(row.deviceTokenHash) };
  }

  async function pair(linkToken, label) {
    const row = await byLink(linkToken);
    if (row.deviceTokenHash) fail("Este enlace ya está emparejado con otro dispositivo. Pide a un administrador que lo restablezca.", 409, "ALREADY_PAIRED");
    const code = randomDigits(6);
    const pollSecret = randomToken(24);
    await prisma.posDeviceLink.update({
      where: { id: row.id },
      data: { pairingCode: code, pairingSecretHash: sha256(pollSecret), pairingLabel: String(label ?? "").trim().slice(0, 80) || null, pairingRequestedAt: new Date(now()), approvedAt: null, pairingTokenEnc: null },
    });
    return { code, pollSecret };
  }

  async function pairStatus(linkToken, pollSecret) {
    const row = await byLink(linkToken);
    if (!pollSecret || !row.pairingSecretHash || sha256(pollSecret) !== row.pairingSecretHash) fail("Solicitud de emparejamiento no válida.", 401, "BAD_POLL_SECRET");
    if (row.pairingRequestedAt && now() - row.pairingRequestedAt.getTime() > PAIRING_TTL_MS && !row.deviceTokenHash) return { status: "expired" };
    // The same poll secret gets the token again until the device uses it (lost response).
    if (row.deviceTokenHash && row.pairingTokenEnc) {
      const again = openWithSecret(row.pairingTokenEnc, pollSecret);
      return again ? { status: "paired", deviceToken: again } : { status: "expired" };
    }
    if (!row.approvedAt) return { status: "pending", code: row.pairingCode };
    const deviceToken = randomToken(32);
    await prisma.posDeviceLink.update({
      where: { id: row.id },
      data: { deviceTokenHash: sha256(deviceToken), pairingTokenEnc: sealWithSecret(deviceToken, pollSecret), pairedAt: new Date(now()), pairingCode: null, approvedAt: null, lastSeenAt: new Date(now()) },
    });
    return { status: "paired", deviceToken };
  }

  async function device(linkToken, deviceToken) {
    const row = await byLink(linkToken);
    if (!deviceToken || !row.deviceTokenHash || sha256(deviceToken) !== row.deviceTokenHash) fail("Dispositivo no autorizado.", 401, "DEVICE_UNAUTHORIZED");
    return row;
  }

  async function operatorLogin(linkToken, deviceToken, pin) {
    requireSecret();
    const row = await device(linkToken, deviceToken);
    if (row.pinLockedUntil && row.pinLockedUntil.getTime() > now()) fail("Demasiados intentos. Espera unos minutos.", 423, "PIN_LOCKED");
    const found = /^\d{4,6}$/.test(String(pin ?? "")) ? await prisma.posOperatorPin.findFirst({ where: { companyId: row.companyId, pinHash: pinHash(row.companyId, pin) } }) : null;
    const member = found ? await prisma.membership.findFirst({
      where: { companyId: row.companyId, userId: found.userId, enabled: true, user: { enabled: true, isBot: false } },
      select: { user: { select: { id: true, authUserId: true, displayName: true, firstName: true } } },
    }) : null;
    if (!member) {
      const attempts = row.failedPinAttempts + 1;
      await prisma.posDeviceLink.update({ where: { id: row.id }, data: attempts >= MAX_PIN_ATTEMPTS ? { failedPinAttempts: 0, pinLockedUntil: new Date(now() + LOCK_MS) } : { failedPinAttempts: attempts } });
      fail("PIN incorrecto.", 401, "BAD_PIN");
    }
    await prisma.posDeviceLink.update({ where: { id: row.id }, data: { failedPinAttempts: 0, pinLockedUntil: null, lastSeenAt: new Date(now()), pairingTokenEnc: null } });
    const terminal = await prisma.posTerminal.findFirst({ where: { id: row.terminalId, companyId: row.companyId }, select: { id: true, outletId: true } });
    const expiresAt = now() + OPERATOR_TTL_MS;
    const payload = Buffer.from(JSON.stringify({ u: member.user.authUserId, c: row.companyId, l: row.id, p: row.pairedAt?.getTime() ?? 0, exp: expiresAt })).toString("base64url");
    await writeAudit(prisma, { actorId: member.user.id, entityType: "PosDeviceLink", entityId: row.id, action: "pos.device.operator_login" });
    return {
      operatorToken: `${OPERATOR_PREFIX}${payload}.${hmac(payload)}`,
      expiresAt: new Date(expiresAt).toISOString(),
      companyId: row.companyId,
      terminalId: terminal?.id ?? null,
      outletId: terminal?.outletId ?? null,
      profile: { id: member.user.id, displayName: member.user.displayName, firstName: member.user.firstName },
    };
  }

  // Bearer `posop.` tokens: valid signature, not expired, only on /pos/v2/*,
  // same company as the request header, and the link still paired as issued.
  async function verifyOperatorToken(token, { path, companyHeader }) {
    if (!secret || !String(token).startsWith(OPERATOR_PREFIX)) return null;
    if (!String(path).startsWith("/pos/v2/")) return null;
    const [payload, signature] = String(token).slice(OPERATOR_PREFIX.length).split(".");
    if (!payload || !signature) return null;
    const expected = Buffer.from(hmac(payload));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    let claims;
    try { claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return null; }
    if (!claims?.u || !claims?.c || !claims?.l || !(claims.exp > now())) return null;
    if (companyHeader !== claims.c) return null;
    const cached = checks.get(claims.l);
    let pairedAt = cached && now() - cached.at < CHECK_CACHE_MS ? cached.pairedAt : undefined;
    if (pairedAt === undefined) {
      const row = await prisma.posDeviceLink.findFirst({ where: { id: claims.l, companyId: claims.c }, select: { pairedAt: true, revokedAt: true, deviceTokenHash: true } });
      pairedAt = row && !row.revokedAt && row.deviceTokenHash ? row.pairedAt?.getTime() ?? 0 : null;
      checks.set(claims.l, { at: now(), pairedAt });
    }
    if (pairedAt === null || pairedAt !== claims.p) return null;
    return { authUserId: claims.u, companyId: claims.c };
  }

  return { list, create, approve, reset, revoke, listPins, setPin, removePin, info, pair, pairStatus, operatorLogin, verifyOperatorToken };
}
