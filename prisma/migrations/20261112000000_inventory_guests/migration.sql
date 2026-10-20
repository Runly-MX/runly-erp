-- runly.inventory: external supplier guests (magic link) and guest area membership. Additive.

CREATE TABLE "inv_guest" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(150),
    "contact_id" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMPTZ(6),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inv_guest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inv_guest_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inv_guest_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "inv_guest_company_id_email_idx" ON "inv_guest"("company_id", "email");
CREATE UNIQUE INDEX "inv_guest_company_email_key" ON "inv_guest"("company_id", lower("email")) WHERE "enabled";

CREATE TABLE "inv_guest_invite" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "code_hash" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inv_guest_invite_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inv_guest_invite_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inv_guest_invite_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "inv_guest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "inv_guest_invite_token_hash_key" ON "inv_guest_invite"("token_hash");
CREATE INDEX "inv_guest_invite_guest_id_idx" ON "inv_guest_invite"("guest_id");

CREATE TABLE "inv_guest_session" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "invite_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inv_guest_session_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inv_guest_session_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inv_guest_session_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "inv_guest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inv_guest_session_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "inv_guest_invite"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "inv_guest_session_token_hash_key" ON "inv_guest_session"("token_hash");
CREATE INDEX "inv_guest_session_guest_id_idx" ON "inv_guest_session"("guest_id");

ALTER TABLE "inv_area_member" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "inv_area_member" ADD COLUMN "guest_id" UUID;
ALTER TABLE "inv_area_member" ADD CONSTRAINT "inv_area_member_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "inv_guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inv_area_member" ADD CONSTRAINT "inv_area_member_one_principal_check" CHECK (("user_id" IS NOT NULL) <> ("guest_id" IS NOT NULL));
-- A supplier can read or edit, never manage.
ALTER TABLE "inv_area_member" ADD CONSTRAINT "inv_area_member_guest_role_check" CHECK ("guest_id" IS NULL OR "role" IN ('viewer','editor'));
CREATE UNIQUE INDEX "inv_area_member_area_id_guest_id_key" ON "inv_area_member"("area_id", "guest_id");
CREATE INDEX "inv_area_member_guest_id_idx" ON "inv_area_member"("guest_id");
