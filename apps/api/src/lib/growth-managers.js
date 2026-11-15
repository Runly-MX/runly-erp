import { COMPANY_ADMIN_ROLE_KEYS, SYSTEM_ADMIN_ROLE_KEYS } from "./tenant-context.js";

// Active company admins plus anyone whose role grants growth.properties.manage.
export async function resolveGrowthManagerUserIds(prisma, companyId) {
  const memberships = await prisma.membership.findMany({
    where: { companyId, enabled: true, company: { enabled: true } },
    include: {
      role: { include: { permissions: { include: { permission: { select: { key: true } } } } } },
    },
  });
  const userIds = memberships
    .filter((membership) => membership.role?.enabled !== false)
    .filter((membership) => {
      const roleKey = membership.role?.key;
      if (COMPANY_ADMIN_ROLE_KEYS.has(roleKey) || SYSTEM_ADMIN_ROLE_KEYS.has(roleKey)) return true;
      return (membership.role?.permissions ?? []).some(
        (rolePermission) => rolePermission.permission?.key === "growth.properties.manage",
      );
    })
    .map((membership) => membership.userId);
  return [...new Set(userIds)];
}
