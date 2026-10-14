-- Saved user signature, reusable across modules (spec 2026-10-13-inventory-custody-design §9.6)
-- CreateTable
CREATE TABLE "user_signature" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_profile_id" UUID NOT NULL,
    "file_asset_id" UUID NOT NULL,
    "allow_delegation" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_signature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_signature_user_profile_id_key" ON "user_signature"("user_profile_id");

-- AddForeignKey
ALTER TABLE "user_signature" ADD CONSTRAINT "user_signature_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_signature" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "user_signature" FROM PUBLIC, anon, authenticated;
