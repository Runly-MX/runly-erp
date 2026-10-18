// Recovery: set the platform owner (instance_config platform_owner_profile_id)
// to the enabled, non-bot user with the given email. Run on the server:
//   node --env-file=.env scripts/set-platform-owner.mjs --email <email>
// Uses DATABASE_URL from the environment. Prints only the new owner's display
// name; no URLs, keys or other users' data.
// Spec: docs/superpowers/specs/2026-10-18-platform-owner-design.md §6
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const KEY = 'platform_owner_profile_id';
const index = process.argv.indexOf('--email');
const email = index > -1 ? String(process.argv[index + 1] ?? '').trim().toLowerCase() : '';
if (!email) {
  console.error('Uso: node scripts/set-platform-owner.mjs --email <email>');
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL no está definido.');
  process.exit(2);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  const profile = await prisma.userProfile.findUnique({ where: { email }, select: { id: true, displayName: true, enabled: true, isBot: true } });
  if (!profile || !profile.enabled || profile.isBot) {
    console.error('No hay un usuario habilitado con ese correo.');
    process.exitCode = 1;
  } else {
    await prisma.instanceConfig.upsert({ where: { key: KEY }, update: { value: profile.id }, create: { key: KEY, value: profile.id } });
    await prisma.auditLog.create({ data: { actorId: null, moduleKey: 'runly.core', entityType: 'UserProfile', entityId: profile.id, action: 'platform.owner.recovered', after: { ownerProfileId: profile.id } } });
    console.log(`Propietario de la plataforma: ${profile.displayName}`);
  }
} catch (err) {
  console.error('No se pudo actualizar el propietario:', err?.code ?? err?.name ?? 'error');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
