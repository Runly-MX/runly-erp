-- Folders for the runly.files explorer.
CREATE TABLE "file_folder" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'PRIVATE',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "file_folder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "file_folder_company_id_parent_id_idx" ON "file_folder"("company_id", "parent_id");

ALTER TABLE "file_folder" ADD CONSTRAINT "file_folder_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "file_folder" ADD CONSTRAINT "file_folder_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "file_folder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "file_asset" ADD COLUMN "folder_id" UUID;
CREATE INDEX "file_asset_folder_id_idx" ON "file_asset"("folder_id");
ALTER TABLE "file_asset" ADD CONSTRAINT "file_asset_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "file_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
