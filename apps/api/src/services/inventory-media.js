// Company-wide list of the files attached to inventory items (photos and
// documents), newest first, for the Multimedia gallery.
const MAX_PAGE_SIZE = 200
const IMAGE = { startsWith: 'image/' }

export function mediaWhere(companyId, { kind, search, itemId } = {}) {
  const term = String(search ?? '').trim()
  return {
    item: { companyId, enabled: true },
    ...(itemId ? { itemId } : {}),
    fileAsset: {
      enabled: true,
      ...(kind === 'image' ? { mimeType: IMAGE } : {}),
      ...(kind === 'file' ? { NOT: { mimeType: IMAGE } } : {}),
    },
    ...(term ? {
      OR: [
        { label: { contains: term, mode: 'insensitive' } },
        { fileAsset: { originalName: { contains: term, mode: 'insensitive' } } },
        { item: { name: { contains: term, mode: 'insensitive' } } },
        { item: { assetTag: { contains: term, mode: 'insensitive' } } },
      ],
    } : {}),
  }
}

export async function listInventoryMedia(prisma, companyId, query = {}) {
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.pageSize) || 120))
  const page = Math.max(1, Number(query.page) || 1)
  const where = mediaWhere(companyId, query)
  const [rows, total] = await Promise.all([
    prisma.invItemFile.findMany({
      where,
      include: {
        fileAsset: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
        item: { select: { id: true, name: true, assetTag: true } },
      },
      orderBy: [{ createdAt: query.sort === 'asc' ? 'asc' : 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invItemFile.count({ where }),
  ])
  return {
    data: rows.map((row) => ({
      id: row.id,
      fileAssetId: row.fileAssetId,
      name: row.label || row.fileAsset.originalName,
      originalName: row.fileAsset.originalName,
      mimeType: row.fileAsset.mimeType,
      sizeBytes: row.fileAsset.sizeBytes == null ? null : Number(row.fileAsset.sizeBytes),
      createdAt: row.createdAt,
      isCover: row.isCover,
      itemId: row.item.id,
      itemName: row.item.name,
      assetTag: row.item.assetTag,
    })),
    pagination: { page, pageSize, total },
  }
}
