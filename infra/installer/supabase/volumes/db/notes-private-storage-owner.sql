-- Run only with the owner of storage.objects (or a role allowed to manage it).
-- This is NOT a Prisma migration. The API checks the exact policy before serving.
-- Reapplying is safe. Never drop this policy as a rollback of the application.
DO $notes_storage$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='storage.objects'::regclass
    AND polname='runly_notes_private_images_v1') THEN
    CREATE POLICY runly_notes_private_images_v1 ON storage.objects
      AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING (bucket_id NOT IN ('runly-notes','atlas-notes'))
      WITH CHECK (bucket_id NOT IN ('runly-notes','atlas-notes'));
  END IF;
END $notes_storage$;

CREATE OR REPLACE FUNCTION storage.runly_notes_require_private_bucket()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS
'BEGIN IF NEW.id IN (''runly-notes'',''atlas-notes'') AND NEW.public THEN RAISE EXCEPTION ''NOTES_BUCKET_MUST_REMAIN_PRIVATE''; END IF; RETURN NEW; END;';

DO $notes_bucket_guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='storage.buckets'::regclass
    AND tgname='runly_notes_bucket_private_v1' AND NOT tgisinternal) THEN
    CREATE TRIGGER runly_notes_bucket_private_v1 BEFORE INSERT OR UPDATE ON storage.buckets
      FOR EACH ROW EXECUTE FUNCTION storage.runly_notes_require_private_bucket();
  END IF;
END $notes_bucket_guard$;
