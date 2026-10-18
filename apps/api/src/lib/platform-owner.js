// Platform owner: the single user who administers instance-wide settings
// (instance general settings, Web Push) when the installation hosts more than
// one company. Stored in InstanceConfig under PLATFORM_OWNER_KEY.
// Spec: docs/superpowers/specs/2026-10-18-platform-owner-design.md
//
// Pure decision helpers (isInstanceAdminAllowed, validateOwnerTransfer,
// checkOwnerRemoval) are unit-tested without a database; the rest take prisma.

export const PLATFORM_OWNER_KEY = "platform_owner_profile_id";
export const OWNER_REMOVAL_ERROR = "Transfiere la propiedad de la plataforma antes de dar de baja esta cuenta.";
export const INSTANCE_ADMIN_ERROR = "Estos ajustes afectan a todas las empresas de la instancia. Solo el propietario de la plataforma puede cambiarlos.";

export async function readPlatformOwnerId(prisma) {
  const row = await prisma.instanceConfig.findUnique({ where: { key: PLATFORM_OWNER_KEY }, select: { value: true } });
  return row?.value || null;
}

export function isOwnerProfile(ownerId, profileId) {
  return Boolean(ownerId && profileId && ownerId === profileId);
}

// Owner always; otherwise only a single-company instance's own admin.
export function isInstanceAdminAllowed({ tenant, enabledCompanyCount }) {
  if (tenant?.isPlatformOwner) return true;
  return enabledCompanyCount === 1 && Boolean(tenant?.isCompanyAdmin && tenant?.companyId);
}

export async function countEnabledCompanies(prisma) {
  return prisma.company.count({ where: { enabled: true } });
}

// Hono middleware; must run after requirePermission (needs tenantContext).
export function createRequireInstanceAdmin({ prisma }) {
  return async (c, next) => {
    const tenant = c.get("tenantContext");
    const allowed = tenant?.isPlatformOwner
      || isInstanceAdminAllowed({ tenant, enabledCompanyCount: await countEnabledCompanies(prisma) });
    if (!allowed) return c.json({ error: INSTANCE_ADMIN_ERROR }, 403);
    await next();
  };
}

// target: { id, enabled, isBot, hasEnabledMembership } | null
export function validateOwnerTransfer({ isOwner, actorId, target }) {
  if (!isOwner) return { ok: false, status: 403, error: "Solo el propietario de la plataforma puede transferir la propiedad." };
  if (!target) return { ok: false, status: 404, error: "Usuario no encontrado." };
  if (target.id === actorId) return { ok: false, status: 400, error: "Ya eres el propietario de la plataforma." };
  if (!target.enabled || target.isBot) return { ok: false, status: 400, error: "El usuario seleccionado no puede ser propietario de la plataforma." };
  if (!target.hasEnabledMembership) return { ok: false, status: 400, error: "El usuario seleccionado no tiene acceso activo a ninguna empresa." };
  return { ok: true };
}

// account: the whole account is being disabled/deleted.
// remainingEnabledMemberships: enabled memberships (in enabled companies) the
// owner keeps after the operation.
export function checkOwnerRemoval({ ownerId, targetUserIds, account = false, remainingEnabledMemberships = 1 }) {
  const ids = Array.isArray(targetUserIds) ? targetUserIds : [targetUserIds];
  if (!ownerId || !ids.includes(ownerId)) return { ok: true };
  if (account || remainingEnabledMemberships < 1) return { ok: false, status: 409, error: OWNER_REMOVAL_ERROR };
  return { ok: true };
}

function enabledMembershipWhere(userId) {
  return { userId, enabled: true, company: { enabled: true } };
}

// Route guard: returns a { status, error } failure or null. Pass companyId to
// exclude every membership in that company, or membershipId to exclude one.
export async function guardOwnerRemoval(prisma, { userIds, account = false, companyId = null, membershipId = null }) {
  const ownerId = await readPlatformOwnerId(prisma);
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  if (!ownerId || !ids.includes(ownerId)) return null;
  let remaining = 1;
  if (!account) {
    const where = enabledMembershipWhere(ownerId);
    if (companyId) where.companyId = { not: companyId };
    if (membershipId) where.id = { not: membershipId };
    remaining = await prisma.membership.count({ where });
  }
  const check = checkOwnerRemoval({ ownerId, targetUserIds: ids, account, remainingEnabledMemberships: remaining });
  return check.ok ? null : check;
}

function serializeOwner(profile) {
  return profile ? { id: profile.id, displayName: profile.displayName, email: profile.email } : null;
}

export async function getPlatformOwner(prisma, { actorProfileId }) {
  const [ownerId, enabledCompanyCount] = await Promise.all([readPlatformOwnerId(prisma), countEnabledCompanies(prisma)]);
  const profile = ownerId
    ? await prisma.userProfile.findUnique({ where: { id: ownerId }, select: { id: true, displayName: true, email: true } })
    : null;
  return {
    owner: serializeOwner(profile),
    isOwner: isOwnerProfile(ownerId, actorProfileId),
    multiCompany: enabledCompanyCount > 1,
  };
}

export async function transferPlatformOwner(prisma, { actorProfileId, targetProfileId, companyId = null }) {
  const ownerId = await readPlatformOwnerId(prisma);
  const isOwner = isOwnerProfile(ownerId, actorProfileId);
  const profile = isOwner && targetProfileId
    ? await prisma.userProfile.findUnique({
        where: { id: targetProfileId },
        select: { id: true, displayName: true, email: true, enabled: true, isBot: true },
      })
    : null;
  const hasEnabledMembership = profile
    ? (await prisma.membership.count({ where: enabledMembershipWhere(profile.id) })) > 0
    : false;
  const check = validateOwnerTransfer({
    isOwner,
    actorId: actorProfileId,
    target: profile ? { ...profile, hasEnabledMembership } : null,
  });
  if (!check.ok) return check;

  await prisma.$transaction([
    prisma.instanceConfig.upsert({
      where: { key: PLATFORM_OWNER_KEY },
      update: { value: profile.id },
      create: { key: PLATFORM_OWNER_KEY, value: profile.id },
    }),
    prisma.auditLog.create({
      data: {
        companyId,
        actorId: actorProfileId,
        moduleKey: "runly.core",
        entityType: "UserProfile",
        entityId: profile.id,
        action: "platform.owner.transferred",
        before: { ownerProfileId: ownerId },
        after: { ownerProfileId: profile.id },
      },
    }),
  ]);
  return { ok: true, owner: serializeOwner(profile) };
}
