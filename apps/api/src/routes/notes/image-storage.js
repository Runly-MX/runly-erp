import { createNoteImageService } from './image-service.js'
import { NOTE_IMAGE_BUCKETS } from './image-references.js'

export async function ensureNotesStoragePolicy(prisma) {
  const [policy] = await prisma.$queryRaw`SELECT p.polpermissive, p.polcmd::text,
    pg_get_expr(p.polqual,p.polrelid) AS using_expr,
    pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr,
    ARRAY(SELECT rolname::text FROM pg_roles WHERE oid=ANY(p.polroles) ORDER BY rolname) AS roles
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='storage' AND c.relname='objects' AND p.polname='runly_notes_private_images_v1'`
  if (!policy) {
    try {
      await prisma.$executeRaw`CREATE POLICY runly_notes_private_images_v1 ON storage.objects
        AS RESTRICTIVE FOR ALL TO anon, authenticated
        USING (bucket_id NOT IN ('runly-notes','atlas-notes'))
        WITH CHECK (bucket_id NOT IN ('runly-notes','atlas-notes'))`
    } catch (error) {
      if (/already exists|duplicate_object/i.test(error.message)) return ensureNotesStoragePolicy(prisma)
      throw Error('NOTES_STORAGE_OWNER_PREPARATION_REQUIRED')
    }
    return ensureNotesStoragePolicy(prisma)
  }
  const expected="(bucket_id<>ALL(ARRAY['runly-notes'::text,'atlas-notes'::text]))"
  const normalize=value=>value.replace(/'[^']*(?:''[^']*)*'|\s+/g,part=>part.startsWith("'")?part:'')
  if (policy.polpermissive || policy.polcmd !== '*' || JSON.stringify(policy.roles)!==JSON.stringify(['anon','authenticated']) || normalize(policy.using_expr??'')!==expected || normalize(policy.check_expr??'')!==expected)
    throw Error('NOTES_STORAGE_POLICY_MISMATCH')
}

// Read-only: reports which Storage invariants are missing without creating or
// changing anything, so an installer can refuse to start an incompatible API.
// Codes only; never connection strings or object data.
export async function inspectNotesStorage(prisma) {
  const problems = []
  for (const [code, check] of [['POLICY', ensureNotesStoragePolicyReadOnly], ['GUARD', inspectGuard]]) {
    try { const issue = await check(prisma); if (issue) problems.push(issue) } catch { problems.push(`NOTES_STORAGE_${code}_UNREADABLE`) }
  }
  // A bucket that is still public (or not created yet) is the expected state
  // before the new API's first boot: the API closes or creates it. It is reported,
  // not failed; the post-start anonymous probe is what proves it is closed.
  const pending = []
  try {
    const buckets = await prisma.$queryRaw`SELECT id::text, public FROM storage.buckets WHERE id = ANY(${NOTE_IMAGE_BUCKETS}::text[])`
    for (const bucket of buckets) if (bucket.public) pending.push(`NOTES_BUCKET_STILL_PUBLIC:${bucket.id}`)
  } catch { problems.push('NOTES_STORAGE_BUCKETS_UNREADABLE') }
  return { ok: problems.length === 0, problems, pending }
}

async function ensureNotesStoragePolicyReadOnly(prisma) {
  const [policy] = await prisma.$queryRaw`SELECT 1 AS present FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='storage' AND c.relname='objects' AND p.polname='runly_notes_private_images_v1'`
  if (!policy) return 'NOTES_STORAGE_POLICY_MISSING'
  // Definition is validated by the same routine the API runs at boot; with the
  // policy present it never writes.
  try { await ensureNotesStoragePolicy(prisma) } catch { return 'NOTES_STORAGE_POLICY_MISMATCH' }
  return null
}

async function inspectGuard(prisma) {
  const [guard] = await prisma.$queryRaw`SELECT 1 AS present FROM pg_trigger t WHERE t.tgrelid='storage.buckets'::regclass AND t.tgname='runly_notes_bucket_private_v1' AND NOT t.tgisinternal`
  if (!guard) return 'NOTES_STORAGE_GUARD_MISSING'
  try { await ensureNotesBucketGuard(prisma) } catch { return 'NOTES_STORAGE_GUARD_MISMATCH' }
  return null
}

export async function prepareNotesPrivateStorage({ prisma, supabaseAdmin }) {
  await ensureNotesStoragePolicy(prisma)
  await ensureNotesBucketGuard(prisma)
  const [done] = await prisma.$queryRaw`SELECT id FROM note_image_storage_state WHERE id`
  if (!done) {
    const report = await createNoteImageService({ prisma, supabaseAdmin }).inventoryLegacy()
    if (report.problems.length) throw Error('NOTES_STORAGE_INVENTORY_REQUIRES_REVIEW')
  }
  // No object is copied, moved or deleted. A failed update is fatal; an older
  // startup must never silently reopen these buckets on rollback.
  for (const name of NOTE_IMAGE_BUCKETS) {
    const existing = await supabaseAdmin.storage.getBucket(name)
    if (existing.error) {
      if (name === 'atlas-notes' && String(existing.error.status ?? existing.error.statusCode) === '404') continue
      if (name === 'atlas-notes' && /not found/i.test(existing.error.message)) continue
      if (name !== 'runly-notes') throw Error('NOTES_STORAGE_BUCKET_LOOKUP_FAILED')
      const created = await supabaseAdmin.storage.createBucket(name, { public: false })
      if (created.error) throw Error('NOTES_STORAGE_BUCKET_CREATE_FAILED')
    }
    const updated = await supabaseAdmin.storage.updateBucket(name, {
      public: false, ...(name === 'runly-notes' ? { fileSizeLimit: 20971520, allowedMimeTypes: ['image/*'] } : {}),
    })
    if (updated.error) throw Error('NOTES_STORAGE_BUCKET_CLOSE_FAILED')
    const checked = await supabaseAdmin.storage.getBucket(name)
    if (checked.error || checked.data.public) throw Error('NOTES_STORAGE_BUCKET_STILL_PUBLIC')
  }
}

export async function ensureNotesBucketGuard(prisma) {
  const body="BEGIN IF NEW.id IN ('runly-notes','atlas-notes') AND NEW.public THEN RAISE EXCEPTION 'NOTES_BUCKET_MUST_REMAIN_PRIVATE'; END IF; RETURN NEW; END;"
  const [guard]=await prisma.$queryRaw`SELECT t.tgenabled::text,t.tgtype,p.prosrc,n.nspname::text,p.proname::text
    FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE t.tgrelid='storage.buckets'::regclass AND t.tgname='runly_notes_bucket_private_v1' AND NOT t.tgisinternal`
  if(guard) {
    if(guard.tgenabled!=='O'||guard.tgtype!==23||guard.nspname!=='storage'||guard.proname!=='runly_notes_require_private_bucket'||guard.prosrc.trim()!==body)throw Error('NOTES_STORAGE_BUCKET_GUARD_MISMATCH')
    return
  }
  try {
    await prisma.$executeRaw`CREATE OR REPLACE FUNCTION storage.runly_notes_require_private_bucket()
      RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS
      'BEGIN IF NEW.id IN (''runly-notes'',''atlas-notes'') AND NEW.public THEN RAISE EXCEPTION ''NOTES_BUCKET_MUST_REMAIN_PRIVATE''; END IF; RETURN NEW; END;'`
    await prisma.$executeRaw`CREATE TRIGGER runly_notes_bucket_private_v1 BEFORE INSERT OR UPDATE ON storage.buckets
      FOR EACH ROW EXECUTE FUNCTION storage.runly_notes_require_private_bucket()`
  } catch(error) {
    if(/already exists|duplicate_object/i.test(error.message))return ensureNotesBucketGuard(prisma)
    throw Error('NOTES_STORAGE_OWNER_PREPARATION_REQUIRED')
  }
  await ensureNotesBucketGuard(prisma)
}
