import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ensureNotesStoragePolicy,ensureNotesBucketGuard } from '../image-storage.js'

test('Policy validation preserves significant whitespace in bucket names',async()=>{
  const expression="(bucket_id <> ALL (ARRAY['runly-notes'::text, 'atlas-notes'::text]))"
  const row={polpermissive:false,polcmd:'*',roles:['anon','authenticated'],using_expr:expression,check_expr:expression}
  await ensureNotesStoragePolicy({$queryRaw:async()=>[row]})
  const unsafe={...row,using_expr:expression.replace('runly-notes','runly- notes')}
  await assert.rejects(ensureNotesStoragePolicy({$queryRaw:async()=>[unsafe]}),/POLICY_MISMATCH/)
})
test('Bucket guard with the wrong literal does not pass preparation checks',async()=>{
  const row={tgenabled:'O',tgtype:23,nspname:'storage',proname:'runly_notes_require_private_bucket',prosrc:"BEGIN IF NEW.id IN ('runly- notes','atlas-notes') AND NEW.public THEN RAISE EXCEPTION 'NOTES_BUCKET_MUST_REMAIN_PRIVATE'; END IF; RETURN NEW; END;"}
  await assert.rejects(ensureNotesBucketGuard({$queryRaw:async()=>[row]}),/BUCKET_GUARD_MISMATCH/)
})
