// Remove profile avatars that no profile points at any more (left behind by
// uploads made before replacing an avatar purged the previous one). Deletes the
// storage object first, then its file_asset row; a row whose object could not be
// removed is kept for the next run.
//
// Dry run (default): prints counts only.
//   node --env-file=.env scripts/sweep-orphan-avatars.mjs
// Apply:
//   node --env-file=.env scripts/sweep-orphan-avatars.mjs --apply
//
// Only objects under modules/atlas-identity/userprofile/ owned by runly.identity
// and not referenced by any UserProfile.avatarFileId are touched; anything
// younger than one hour is skipped. No keys, URLs or identifiers are printed.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const PREFIX = 'modules/atlas-identity/userprofile/';
const MIN_AGE_MS = 60 * 60 * 1000;
const BATCH = 100;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const timeout = setTimeout(() => {
  console.error('Timed out.');
  process.exit(1);
}, 10 * 60 * 1000);

try {
  const inUse = new Set(
    (await prisma.userProfile.findMany({ where: { avatarFileId: { not: null } }, select: { avatarFileId: true } })).map(
      (p) => p.avatarFileId,
    ),
  );
  const candidates = await prisma.fileAsset.findMany({
    where: {
      moduleKey: 'runly.identity',
      entityType: 'UserProfile',
      objectKey: { startsWith: PREFIX },
      createdAt: { lt: new Date(Date.now() - MIN_AGE_MS) },
    },
    select: { id: true, bucket: true, objectKey: true },
  });
  const orphans = candidates.filter((a) => !inUse.has(a.id));
  console.log(`avatars: ${candidates.length} total, ${inUse.size} in use, ${orphans.length} orphaned`);

  if (!APPLY) {
    console.log('Dry run. Re-run with --apply to delete the orphaned avatars.');
  } else {
    let removed = 0;
    let failed = 0;
    for (let i = 0; i < orphans.length; i += BATCH) {
      const chunk = orphans.slice(i, i + BATCH);
      const byBucket = new Map();
      for (const a of chunk) byBucket.set(a.bucket, [...(byBucket.get(a.bucket) ?? []), a]);
      for (const [bucket, group] of byBucket) {
        const { error } = await supabase.storage.from(bucket).remove(group.map((a) => a.objectKey));
        if (error) {
          failed += group.length;
          continue;
        }
        await prisma.fileAsset.deleteMany({ where: { id: { in: group.map((a) => a.id) } } });
        removed += group.length;
      }
    }
    console.log(`removed ${removed}, failed ${failed}`);
  }
} finally {
  clearTimeout(timeout);
  await prisma.$disconnect();
}
