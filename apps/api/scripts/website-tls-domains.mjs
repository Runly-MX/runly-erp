// Read-only: prints the customer-owned hostnames this installation serves (verified, assigned, ready) as a JSON
// array, so the host-side TLS sync (infra/installer/website-domains.mjs) can issue certificates and nginx blocks.
// Hostnames only: no company, site or connection data leaves the container.
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

if (!process.env.DATABASE_URL) throw Error('EXPLICIT_DATABASE_CONFIGURATION_REQUIRED')
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
try {
  const rows = await prisma.websiteDomain.findMany({ where: { kind: 'custom', state: 'assigned', ready: true }, select: { hostname: true }, orderBy: { hostname: 'asc' } })
  process.stdout.write(JSON.stringify(rows.map((row) => row.hostname)))
} finally {
  await prisma.$disconnect()
}
