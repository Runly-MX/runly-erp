// Who may appear as "quien entrega" on a custody record (spec §9.5): enabled
// human members of the company (never MirAI or other bot users).
import { InventoryServiceError } from './inventory-guards.js';
import { attachUserAvatarUrls } from '../lib/attach-user-avatars.js';

const personName = (user) => user.displayName?.trim() || [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email;

export function createCustodyDeliverers({ prisma, supabaseAdmin = null }) {
  const memberWhere = (companyId) => ({ isBot: false, enabled: true, memberships: { some: { companyId, enabled: true } } });

  async function assertMember(companyId, delivererId) {
    const user = await prisma.userProfile.findFirst({ where: { id: delivererId, ...memberWhere(companyId) }, select: { id: true } });
    if (!user) throw new InventoryServiceError('Quien entrega debe ser un usuario de esta empresa.', 400);
  }

  // Without deliver_on_behalf only the caller is eligible.
  async function list(companyId, profileId, { canDeliverOnBehalf = false } = {}) {
    const rows = await prisma.userProfile.findMany({
      where: { ...memberWhere(companyId), ...(canDeliverOnBehalf ? {} : { id: profileId }) },
      select: {
        id: true, displayName: true, firstName: true, lastName: true, email: true, avatarFileId: true,
        savedSignature: { select: { allowDelegation: true } },
      },
      orderBy: [{ displayName: 'asc' }],
      take: 500,
    });
    const people = rows.map((row) => ({
      id: row.id,
      name: personName(row),
      email: row.email,
      avatarFileId: row.avatarFileId,
      hasSavedSignature: Boolean(row.savedSignature),
      allowDelegation: row.savedSignature?.allowDelegation ?? false,
    }));
    await attachUserAvatarUrls(people, { prisma, supabaseAdmin }).catch(() => null);
    return { users: people.map(({ avatarFileId, ...rest }) => ({ ...rest, avatarUrl: rest.avatarUrl ?? null })) };
  }

  async function names(ids) {
    const rows = await prisma.userProfile.findMany({
      where: { id: { in: [...new Set(ids.filter(Boolean))] } },
      select: { id: true, displayName: true, firstName: true, lastName: true, email: true },
    });
    return new Map(rows.map((row) => [row.id, personName(row)]));
  }

  return { assertMember, list, names };
}
