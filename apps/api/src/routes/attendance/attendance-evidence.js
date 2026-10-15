// Evidence retention: selfies and punch coordinates are kept only for the
// company's retention window (default 30 days). The punch itself (hours, flags)
// stays; the photo file, its FileAsset row and the coordinates are removed.
// Evidence FileAssets are owned by the punch (entityType AttPunch), so the
// Files module never lists them.
const DEFAULT_DAYS = 30
const BATCH = 200

export async function purgeExpiredEvidence({ prisma, supabaseAdmin = null, now = new Date(), batch = BATCH }) {
  const settings = await prisma.attSettings.findMany({ select: { companyId: true, evidenceRetentionDays: true } })
  const daysByCompany = new Map(settings.map((s) => [s.companyId, s.evidenceRetentionDays]))
  const companies = await prisma.attPunch.groupBy({ by: ['companyId'], where: { evidencePurgedAt: null, OR: [{ selfieFileId: { not: null } }, { latitude: { not: null } }] } })
  const totals = { punches: 0, files: 0, companies: companies.length }
  for (const { companyId } of companies) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { enabled: true } })
    if (!company?.enabled) continue
    const cutoff = new Date(now.getTime() - (daysByCompany.get(companyId) ?? DEFAULT_DAYS) * 86_400_000)
    for (;;) {
      const punches = await prisma.attPunch.findMany({
        where: { companyId, evidencePurgedAt: null, occurredAt: { lt: cutoff }, OR: [{ selfieFileId: { not: null } }, { latitude: { not: null } }] },
        select: { id: true, selfieFileId: true }, take: batch,
      })
      if (!punches.length) break
      const fileIds = punches.map((p) => p.selfieFileId).filter(Boolean)
      if (fileIds.length) {
        const assets = await prisma.fileAsset.findMany({ where: { id: { in: fileIds }, moduleKey: 'runly.attendance' }, select: { id: true, bucket: true, objectKey: true } })
        if (supabaseAdmin) {
          const byBucket = new Map()
          for (const a of assets) byBucket.set(a.bucket, [...(byBucket.get(a.bucket) ?? []), a.objectKey])
          for (const [bucket, keys] of byBucket) await supabaseAdmin.storage.from(bucket).remove(keys).catch(() => {})
        }
        await prisma.fileAsset.deleteMany({ where: { id: { in: assets.map((a) => a.id) } } })
        totals.files += assets.length
      }
      await prisma.attPunch.updateMany({ where: { id: { in: punches.map((p) => p.id) } }, data: { selfieFileId: null, latitude: null, longitude: null, evidencePurgedAt: now } })
      totals.punches += punches.length
      if (punches.length < batch) break
    }
  }
  return totals
}
