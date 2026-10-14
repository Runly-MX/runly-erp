// `targets` command: read-only. Shows which Runly instance the environment points
// to (host only, never credentials) and the companies with their member profiles,
// so the operator copies the right --company / --actor for that instance.
import { createRunlyContext } from './runly-context.mjs'

export async function runTargets(log) {
  const ctx = await createRunlyContext({ source: 'sinabe', needStorage: false })
  try {
    let host = 'desconocido'
    try { host = new URL(process.env.DATABASE_URL ?? process.env.DIRECT_URL).hostname } catch { /* keep default */ }
    log(`Base de datos: ${host}`)
    const companies = await ctx.prisma.company.findMany({ select: { id: true, name: true }, orderBy: { createdAt: 'asc' } })
    for (const company of companies) {
      log(`\nEmpresa: ${company.name}\n  --company ${company.id}`)
      const members = await ctx.prisma.membership.findMany({ where: { companyId: company.id, enabled: true }, select: { user: { select: { id: true, displayName: true } } }, orderBy: { createdAt: 'asc' }, take: 15 })
      for (const { user } of members) log(`  perfil: ${user.displayName}  --actor ${user.id}`)
    }
    return 0
  } finally {
    await ctx.close()
  }
}
