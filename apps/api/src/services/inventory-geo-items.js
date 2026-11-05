import { scopeWhere } from './inventory-scope.js'

// shortcut: one capped query with no paging; upgrade to bbox queries if a company passes MAX_POINTS geolocated items.
export const MAX_POINTS = 5000

const personName = (p) => (p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || null : null)

// Geolocated, non-deregistered items for the inventory map (scope: caller's areas).
export async function listGeoItems(prisma, companyId, scope = null) {
  const rows = await prisma.invItem.findMany({
    where: { companyId, enabled: true, adminStatus: { not: 'deregistered' }, latitude: { not: null }, longitude: { not: null }, ...(scopeWhere(scope) ?? {}) },
    select: {
      id: true, name: true, folio: true, assetTag: true, serialNumber: true, status: true, latitude: true, longitude: true,
      category: { select: { name: true } },
      location: { select: { name: true } },
      assignedTo: { select: { firstName: true, lastName: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: MAX_POINTS + 1,
  })
  return {
    truncated: rows.length > MAX_POINTS,
    data: rows.slice(0, MAX_POINTS).map(({ category, location, assignedTo, latitude, longitude, ...item }) => ({
      ...item,
      latitude: Number(latitude), longitude: Number(longitude),
      categoryName: category?.name ?? null, locationName: location?.name ?? null, assignedToName: personName(assignedTo),
    })),
  }
}
