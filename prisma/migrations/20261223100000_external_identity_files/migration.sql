-- External Identity files: uploads of external accounts (private bucket runly-external).
ALTER TABLE "external_account" ADD COLUMN "avatar_file_id" UUID;

CREATE TABLE "external_file" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "realm_id" UUID NOT NULL,
  "account_id" UUID NOT NULL REFERENCES "external_account"("id") ON DELETE CASCADE,
  "company_id" UUID NOT NULL REFERENCES "company"("id") ON DELETE CASCADE,
  "purpose" TEXT NOT NULL,
  "object_key" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "external_file_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "external_file_object_key_key" ON "external_file"("object_key");
CREATE INDEX "external_file_account_id_purpose_idx" ON "external_file"("account_id", "purpose");
CREATE INDEX "external_file_realm_id_idx" ON "external_file"("realm_id");
