import { buildInventoryWhere } from './inventory-query.js'

// shortcut: one capped query with no paging; upgrade to bbox queries if a company passes MAX_POINTS geolocated items.
export const MAX_POINTS = 5000

const personName = (p) => (p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || null : null)

// Geolocated items for the inventory map, with the same filters as the item list
// (filters/scope/mine as in buildInventoryWhere). Without an adminStatus filter,
// deregistered items are left out.
export async function listGeoItems(prisma, companyId, scope = null, filters = {}, mine = null) {
  const where = buildInventoryWhere(companyId, filters, scope, mine)
  if (!where.adminStatus) where.adminStatus = { not: 'deregistered' }
  where.AND = [...(where.AND ?? []), { latitude: { not: null } }, { longitude: { not: null } }]
  const rows = await prisma.invItem.findMany({
    where,
    select: {
      id: true, name: true, folio: true, assetTag: true, serialNumber: true, status: true, latitude: true, longitude: true,
      category: { select: { id: true, name: true, icon: true, color: true } },
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
      categoryId: category?.id ?? null, categoryName: category?.name ?? null, categoryIcon: category?.icon ?? null, categoryColor: category?.color ?? null,
      locationName: location?.name ?? null, assignedToName: personName(assignedTo),
    })),
  }
}
