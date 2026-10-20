// inventory-guest-service.js - external supplier guests of runly.inventory (spec
// 2026-10-20-inventory-areas-scoping, phase 3): invitations (manager side) and sessions (guest side).
// Modeled on the LMS guest invites: only hashes are stored (link token, session token, access code),
// failed code attempts lock the invite for a while, and a mail failure never loses the invite (the
// response carries the link so the manager can share it by hand).
import { InventoryServiceError, assertCompany } from './inventory-guards.js';
import { resolveAppBaseUrl } from './email-templates.js';
import { describeMailError } from './smtp-service.js';
import { createAttemptGuard, formatAccessCode, hashAccessCode, newAccessCode, verifyAccessCode } from '../routes/lms/lms-invite-core.js';
import {
  GUEST_ROLES, GUEST_TOKEN_RE, INVITE_TTL_DAYS, SESSION_TTL_HOURS, addDays, addHours, codeRequired, guestLinkPath, hashGuestToken,
  invalidCode, invalidLink, newGuestToken, normalizeGuestEmail, parseGuestAuthorization, sessionInvalid,
} from './inventory-guest-core.js';

const TOUCH_MS = 10 * 60_000;
const DUMMY_HASH = hashAccessCode('AAAAAAAA', 'dummy');
const MAIL_ERRORS = {
  MAIL_OFF: 'El envío de correo no está configurado. Copia el enlace y envíalo tú.',
  NO_BASE_URL: 'No se conoce la dirección pública de la aplicación. Copia el enlace y envíalo tú.',
  MAIL_FAILED: 'No se pudo enviar el correo. Copia el enlace y envíalo tú.',
};
// Viewers never hold capabilities: demoting clears them, undefined leaves a flag untouched.
function capabilityFlags(role, { canCreateModels, canImport }) {
  if (role !== 'editor') return { canCreateModels: false, canImport: false };
  return {
    ...(canCreateModels !== undefined ? { canCreateModels: Boolean(canCreateModels) } : {}),
    ...(canImport !== undefined ? { canImport: Boolean(canImport) } : {}),
  };
}
const iso = (value) => (value ? new Date(value).toISOString() : null);

// sendMail / buildMail / getBrand / isMailConfigured are optional: without them invites are still created
// and the response carries the link (and code) to share by hand.
export function createInventoryGuestService({
  prisma, sendMail = null, buildMail = null, getBrand = null, isMailConfigured = null,
  appBaseUrl = () => resolveAppBaseUrl(process.env), attemptGuard = createAttemptGuard(), now = () => new Date(),
}) {
  const mailConfigured = async (companyId) => {
    if (!sendMail || !buildMail) return false;
    if (!isMailConfigured) return true;
    return Boolean(await isMailConfigured(companyId).catch(() => false));
  };

  // ---- sessions (guest side) ------------------------------------------------------------------
  const inviteUsable = (invite, at) => Boolean(invite && !invite.revokedAt && new Date(invite.expiresAt) > at);

  // Public: trades the emailed link token (+ code when the invite has one) for a session token.
  async function startSession({ token, code = null }) {
    const at = now();
    const raw = String(token ?? '');
    const invite = GUEST_TOKEN_RE.test(raw)
      ? await prisma.invGuestInvite.findUnique({ where: { tokenHash: hashGuestToken(raw) }, include: { guest: true } })
      : null;
    if (!invite) {
      verifyAccessCode(code, 'dummy', DUMMY_HASH); // same work as a real check
      throw invalidLink();
    }
    if (!inviteUsable(invite, at) || !invite.guest?.enabled) throw invalidLink();
    const locked = attemptGuard.lockedFor(invite.id);
    if (locked) throw new InventoryServiceError(`Demasiados intentos. Intenta de nuevo en ${Math.max(1, Math.ceil(locked / 60))} min.`, 429, 'INVITE_LOCKED');
    if (invite.codeHash) {
      if (!String(code ?? '').trim()) throw codeRequired();
      if (!verifyAccessCode(code, invite.tokenHash, invite.codeHash)) {
        attemptGuard.fail(invite.id);
        throw invalidCode();
      }
      attemptGuard.clear(invite.id);
    }
    const sessionToken = newGuestToken();
    const expiresAt = new Date(Math.min(addHours(at, SESSION_TTL_HOURS).getTime(), new Date(invite.expiresAt).getTime()));
    await prisma.invGuestSession.create({
      data: { companyId: invite.companyId, guestId: invite.guestId, inviteId: invite.id, tokenHash: hashGuestToken(sessionToken), expiresAt, lastSeenAt: at },
    });
    await prisma.invGuestInvite.update({ where: { id: invite.id }, data: { usedAt: invite.usedAt ?? at } });
    await prisma.invGuest.update({ where: { id: invite.guestId }, data: { lastSeenAt: at } });
    const company = await prisma.company.findUnique({ where: { id: invite.companyId }, select: { name: true } }).catch(() => null);
    return {
      sessionToken,
      expiresAt: iso(expiresAt),
      guest: { id: invite.guest.id, name: invite.guest.name, email: invite.guest.email },
      company: { name: company?.name ?? null },
    };
  }

  // `Authorization: Guest <token>` -> { guest, session, invite, companyId } or null. Checked on every
  // request, so revoking an invite, disabling the guest or expiring the session cuts access at once.
  async function authenticate(authorization) {
    const raw = parseGuestAuthorization(authorization);
    if (!raw) return null;
    const session = await prisma.invGuestSession.findUnique({
      where: { tokenHash: hashGuestToken(raw) },
      include: { guest: true, invite: true },
    });
    const at = now();
    if (!session || session.revokedAt || new Date(session.expiresAt) <= at) return null;
    if (!session.guest?.enabled || !inviteUsable(session.invite, at)) return null;
    if (session.guest.companyId !== session.companyId) return null;
    if (!session.lastSeenAt || at.getTime() - new Date(session.lastSeenAt).getTime() > TOUCH_MS) {
      await prisma.invGuestSession.update({ where: { id: session.id }, data: { lastSeenAt: at } }).catch(() => null);
      await prisma.invGuest.update({ where: { id: session.guestId }, data: { lastSeenAt: at } }).catch(() => null);
    }
    return { guest: session.guest, session, invite: session.invite, companyId: session.companyId };
  }

  // Sliding session while the invite is valid; the same token gets a new expiry.
  async function refresh(auth) {
    if (!auth) throw sessionInvalid();
    const at = now();
    const expiresAt = new Date(Math.min(addHours(at, SESSION_TTL_HOURS).getTime(), new Date(auth.invite.expiresAt).getTime()));
    await prisma.invGuestSession.update({ where: { id: auth.session.id }, data: { expiresAt, lastSeenAt: at } });
    return { expiresAt: iso(expiresAt) };
  }

  async function logout(auth) {
    if (auth) await prisma.invGuestSession.update({ where: { id: auth.session.id }, data: { revokedAt: now() } });
    return { ok: true };
  }

  // ---- invitations (manager side) -------------------------------------------------------------
  async function getArea(companyId, id) {
    const area = await prisma.invArea.findFirst({ where: { id, companyId, enabled: true }, select: { id: true, name: true } });
    if (!area) throw new InventoryServiceError('Area no encontrada.', 404);
    return area;
  }

  async function getGuest(companyId, id) {
    const guest = await prisma.invGuest.findFirst({ where: { id, companyId, enabled: true } });
    if (!guest) throw new InventoryServiceError('Proveedor no encontrado.', 404);
    return guest;
  }

  // Creates the invite and tries to email it. Never throws on mail problems.
  async function issueInvite(guest, { actorId = null, requireCode = false, ttlDays = INVITE_TTL_DAYS } = {}) {
    const at = now();
    const token = newGuestToken();
    const code = requireCode ? newAccessCode() : null;
    const tokenHash = hashGuestToken(token);
    const invite = await prisma.invGuestInvite.create({
      data: {
        companyId: guest.companyId, guestId: guest.id, tokenHash, codeHash: code ? hashAccessCode(code, tokenHash) : null,
        expiresAt: addDays(at, ttlDays), createdById: actorId,
      },
    });
    const base = appBaseUrl();
    const link = `${base ?? ''}${guestLinkPath(token)}`;
    const result = { invite, link, code: code ? formatAccessCode(code) : null, sent: false, mailError: null };
    const fail = (reason, extra = '') => ({ ...result, mailError: { code: reason, message: `${MAIL_ERRORS[reason]}${extra}` } });
    if (!(await mailConfigured(guest.companyId))) return fail('MAIL_OFF');
    if (!base) return fail('NO_BASE_URL');
    try {
      const memberships = await prisma.invAreaMember.findMany({ where: { guestId: guest.id }, include: { area: { select: { name: true, enabled: true } } } });
      const areaNames = memberships.filter((m) => m.area?.enabled).map((m) => m.area.name);
      const brand = getBrand ? await getBrand(guest.companyId).catch(() => null) : null;
      const mail = buildMail({ inviteUrl: link, accessCode: result.code, name: guest.name, areaNames, expiresAt: invite.expiresAt, brand });
      await sendMail({ to: guest.email, subject: mail.subject, html: mail.html, text: mail.text, fromName: brand?.name ?? undefined, companyId: guest.companyId });
    } catch (error) {
      if (/no configurado/i.test(error?.message ?? '')) return fail('MAIL_OFF');
      const why = describeMailError(error);
      console.error('[runly.inventory] guest invite mail failed', { code: why.code, responseCode: why.responseCode, source: why.source });
      return fail('MAIL_FAILED', ` ${why.text}`);
    }
    const sent = await prisma.invGuestInvite.update({ where: { id: invite.id }, data: { sentAt: at } });
    return { ...result, invite: sent, sent: true };
  }

  // Creates (or reuses) the guest, adds the area membership and sends a fresh link.
  async function inviteToArea({ companyId, actorId = null, areaId, email, name = null, role = 'viewer', contactId = null, requireCode = false, canCreateModels, canImport }) {
    assertCompany(companyId);
    if (!GUEST_ROLES.includes(role)) throw new InventoryServiceError('Los proveedores solo pueden ser lectores o editores.', 400);
    const area = await getArea(companyId, areaId);
    const address = normalizeGuestEmail(email);
    const cleanName = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 150) || null;
    if (contactId) {
      const contact = await prisma.contact.findFirst({ where: { id: contactId, companyId }, select: { id: true } });
      if (!contact) throw new InventoryServiceError('El contacto no pertenece a la empresa actual.', 400);
    }
    // Enabled guests are unique per (company, email); a revoked one is brought back with no old areas.
    let guest = await prisma.invGuest.findFirst({ where: { companyId, email: address, enabled: true } });
    if (!guest) {
      const revoked = await prisma.invGuest.findFirst({ where: { companyId, email: address, enabled: false } });
      guest = revoked
        ? await prisma.invGuest.update({ where: { id: revoked.id }, data: { enabled: true, name: cleanName ?? revoked.name, contactId: contactId ?? revoked.contactId } })
        : await prisma.invGuest.create({ data: { companyId, email: address, name: cleanName, contactId, createdById: actorId } });
    } else if ((cleanName && cleanName !== guest.name) || (contactId && contactId !== guest.contactId)) {
      guest = await prisma.invGuest.update({ where: { id: guest.id }, data: { name: cleanName ?? guest.name, contactId: contactId ?? guest.contactId } });
    }
    // Capabilities only exist on an editor membership; undefined keeps the stored value on re-invite.
    const flags = capabilityFlags(role, { canCreateModels, canImport });
    const member = await prisma.invAreaMember.upsert({
      where: { areaId_guestId: { areaId: area.id, guestId: guest.id } },
      create: { areaId: area.id, guestId: guest.id, role, invitedById: actorId, canCreateModels: flags.canCreateModels ?? false, canImport: flags.canImport ?? false },
      update: { role, ...flags },
    });
    const delivery = await issueInvite(guest, { actorId, requireCode });
    return { guest: serializeGuest(guest, delivery.invite, member), link: delivery.link, code: delivery.code, sent: delivery.sent, mailError: delivery.mailError };
  }

  function status(guest, invite) {
    if (!guest.enabled) return 'revoked';
    if (!invite || invite.revokedAt) return 'revoked';
    if (new Date(invite.expiresAt) <= now()) return 'expired';
    return invite.usedAt ? 'active' : 'pending';
  }

  function serializeGuest(guest, invite, member = null) {
    return {
      kind: 'guest',
      id: guest.id,
      memberId: member?.id ?? null,
      areaId: member?.areaId ?? null,
      role: member?.role ?? null,
      canCreateModels: member ? Boolean(member.canCreateModels) && member.role === 'editor' : false,
      canImport: member ? Boolean(member.canImport) && member.role === 'editor' : false,
      email: guest.email,
      name: guest.name,
      contactId: guest.contactId ?? null,
      status: status(guest, invite),
      lastSeenAt: iso(guest.lastSeenAt),
      sentAt: iso(invite?.sentAt),
      inviteExpiresAt: iso(invite?.expiresAt),
    };
  }

  // Guests that are members of an area, with the state of their latest invite.
  async function listForArea(companyId, areaId) {
    assertCompany(companyId);
    await getArea(companyId, areaId);
    const members = await prisma.invAreaMember.findMany({
      where: { areaId, guestId: { not: null }, guest: { companyId, enabled: true } },
      orderBy: { createdAt: 'asc' },
      include: { guest: true },
    });
    const ids = members.map((m) => m.guestId);
    const invites = ids.length ? await prisma.invGuestInvite.findMany({ where: { guestId: { in: ids } }, orderBy: { createdAt: 'desc' } }) : [];
    const latest = new Map();
    for (const invite of invites) if (!latest.has(invite.guestId)) latest.set(invite.guestId, invite);
    return members.map((m) => serializeGuest(m.guest, latest.get(m.guestId) ?? null, m));
  }

  // Changes the role and/or capabilities of a guest inside one area (no new link is sent).
  async function updateMember({ companyId, areaId, guestId, role, canCreateModels, canImport }) {
    assertCompany(companyId);
    if (role !== undefined && !GUEST_ROLES.includes(role)) throw new InventoryServiceError('Los proveedores solo pueden ser lectores o editores.', 400);
    await getArea(companyId, areaId);
    const guest = await getGuest(companyId, guestId);
    const member = await prisma.invAreaMember.findFirst({ where: { areaId, guestId: guest.id } });
    if (!member) throw new InventoryServiceError('Ese proveedor no es miembro de esta area.', 404);
    const nextRole = role ?? member.role;
    const data = { ...(role !== undefined ? { role } : {}), ...capabilityFlags(nextRole, { canCreateModels, canImport }) };
    const saved = await prisma.invAreaMember.update({ where: { id: member.id }, data });
    const invite = await prisma.invGuestInvite.findFirst({ where: { guestId: guest.id }, orderBy: { createdAt: 'desc' } });
    return serializeGuest(guest, invite, saved);
  }

  // New link (the previous ones stop working, and with them their sessions).
  async function resend({ companyId, actorId = null, guestId, requireCode = false }) {
    assertCompany(companyId);
    const guest = await getGuest(companyId, guestId);
    await prisma.invGuestInvite.updateMany({ where: { guestId: guest.id, revokedAt: null }, data: { revokedAt: now() } });
    const delivery = await issueInvite(guest, { actorId, requireCode });
    return { guest: serializeGuest(guest, delivery.invite), link: delivery.link, code: delivery.code, sent: delivery.sent, mailError: delivery.mailError };
  }

  async function removeFromArea({ companyId, areaId, guestId }) {
    assertCompany(companyId);
    await getArea(companyId, areaId);
    const guest = await getGuest(companyId, guestId);
    const { count } = await prisma.invAreaMember.deleteMany({ where: { areaId, guestId: guest.id } });
    if (!count) throw new InventoryServiceError('Ese proveedor no es miembro de esta area.', 404);
    return { areaId, guestId: guest.id };
  }

  // Immediate: invites and sessions are revoked, the guest disabled and its areas removed.
  async function revoke({ companyId, guestId }) {
    assertCompany(companyId);
    const guest = await getGuest(companyId, guestId);
    const at = now();
    await prisma.invGuestSession.updateMany({ where: { guestId: guest.id, revokedAt: null }, data: { revokedAt: at } });
    await prisma.invGuestInvite.updateMany({ where: { guestId: guest.id, revokedAt: null }, data: { revokedAt: at } });
    await prisma.invAreaMember.deleteMany({ where: { guestId: guest.id } });
    await prisma.invGuest.update({ where: { id: guest.id }, data: { enabled: false } });
    return { id: guest.id, status: 'revoked' };
  }

  // Area ids where the guest is a member (used by the routes to authorize area managers).
  async function areaIdsOf(companyId, guestId) {
    const rows = await prisma.invAreaMember.findMany({ where: { guestId, guest: { companyId } }, select: { areaId: true } });
    return rows.map((r) => r.areaId);
  }

  return { startSession, authenticate, refresh, logout, inviteToArea, updateMember, listForArea, resend, removeFromArea, revoke, areaIdsOf };
}
