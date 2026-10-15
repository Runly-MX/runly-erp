// One-off backfill for the "custom modules are opt-in per company" rule
// (apps/api/src/services/company-module-service.js).
//
// For every INSTALLED custom (non-official, non-core) module, the company that
// installed it (activity "core.module.install" with payload.moduleKey) keeps it
// enabled; every other company gets an explicit disabled row, which also
// overrides the enabled rows written by the 2026-09-11 multi-tenant backfill.
// Modules with no recorded installer are left untouched and reported.
//
// Dry run (default): prints counts only.
//   node --env-file=.env scripts/backfill-custom-module-companies.mjs
// Apply:
//   node --env-file=.env scripts/backfill-custom-module-companies.mjs --apply
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { isOfficialModuleKey } from '../apps/api/src/services/module-manifests-service.js';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const timeout = setTimeout(() => {
  console.error('Timed out connecting to the database.');
  process.exit(1);
}, 30000);

try {
  const [modules, companies] = await Promise.all([
    prisma.runlyModule.findMany({ where: { status: 'INSTALLED', core: false }, select: { id: true, key: true } }),
    prisma.company.findMany({ select: { id: true } }),
  ]);
  const custom = modules.filter((m) => !isOfficialModuleKey(m.key));
  const orphans = [];
  let enable = 0;
  let disable = 0;

  for (const mod of custom) {
    const installers = await prisma.activity.findMany({
      where: { type: 'core.module.install', payload: { path: ['moduleKey'], equals: mod.key } },
      select: { companyId: true },
      distinct: ['companyId'],
    });
    if (!installers.length) {
      orphans.push(mod.key);
      continue;
    }
    const installerIds = new Set(installers.map((a) => a.companyId));
    for (const company of companies) {
      const enabled = installerIds.has(company.id);
      if (enabled) enable += 1; else disable += 1;
      if (!APPLY) continue;
      await prisma.companyModule.upsert({
        where: { companyId_moduleId: { companyId: company.id, moduleId: mod.id } },
        update: { enabled },
        create: { companyId: company.id, moduleId: mod.id, enabled },
      });
    }
  }

  console.log(`${APPLY ? 'Applied' : 'Dry run'}: ${custom.length} custom module(s), ${enable} enable, ${disable} disable.`);
  if (orphans.length) console.log(`No recorded installer (left untouched, enable manually): ${orphans.join(', ')}`);
} finally {
  clearTimeout(timeout);
  await prisma.$disconnect();
}
