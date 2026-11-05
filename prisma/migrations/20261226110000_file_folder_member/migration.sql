-- People a runly.files folder is shared with by name.
CREATE TABLE "file_folder_member" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "folder_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_folder_member_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "file_folder_member_folder_id_user_id_key" ON "file_folder_member"("folder_id", "user_id");
CREATE INDEX "file_folder_member_user_id_idx" ON "file_folder_member"("user_id");

ALTER TABLE "file_folder_member" ADD CONSTRAINT "file_folder_member_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "file_folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
