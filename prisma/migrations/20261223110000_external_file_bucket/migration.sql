-- external_file carries its bucket so the company deletion inventory (bucket + object_key) purges these objects.
ALTER TABLE "external_file" ADD COLUMN "bucket" TEXT NOT NULL DEFAULT 'runly-external';
