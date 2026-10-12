-- runly.attendance foundation (spec 2026-10-11-attendance)

-- CreateTable
CREATE TABLE "att_site" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "radius_m" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "att_site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "att_group" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'contractor',
    "notes" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "att_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "att_category" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "att_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "att_shift" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "days" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "grace_minutes" INTEGER NOT NULL DEFAULT 10,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "att_shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "att_person" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'internal',
    "group_id" UUID,
    "category_id" UUID,
    "shift_id" UUID,
    "hr_employee_id" UUID,
    "photo_file_id" UUID,
    "pin_hash" TEXT,
    "enroll_code" TEXT,
    "enroll_expires_at" TIMESTAMPTZ(6),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "att_person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "att_credential" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "uid" TEXT,
    "public_key" JSONB,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "att_credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "att_kiosk" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "site_id" UUID,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'both',
    "link_token" TEXT NOT NULL,
    "require_selfie" BOOLEAN NOT NULL DEFAULT false,
    "allow_pin" BOOLEAN NOT NULL DEFAULT true,
    "pairing_code" TEXT,
    "pairing_secret_hash" TEXT,
    "pairing_label" TEXT,
    "pairing_requested_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),
    "device_token_hash" TEXT,
    "paired_at" TIMESTAMPTZ(6),
    "last_seen_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "att_kiosk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "att_punch" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "site_id" UUID,
    "kiosk_id" UUID,
    "direction" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "device_time" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,
    "offline" BOOLEAN NOT NULL DEFAULT false,
    "clock_skew_ms" INTEGER,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "selfie_file_id" UUID,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'valid',
    "note" TEXT,
    "created_by_id" UUID,

    CONSTRAINT "att_punch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "att_quota" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "name" TEXT,
    "group_id" UUID,
    "category_id" UUID,
    "site_id" UUID,
    "min_count" INTEGER NOT NULL,
    "days" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "att_quota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "att_site_company_id_name_key" ON "att_site"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "att_group_company_id_name_key" ON "att_group"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "att_category_company_id_name_key" ON "att_category"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "att_shift_company_id_name_key" ON "att_shift"("company_id", "name");

-- CreateIndex
CREATE INDEX "att_person_company_id_kind_enabled_idx" ON "att_person"("company_id", "kind", "enabled");

-- CreateIndex
CREATE INDEX "att_person_company_id_group_id_idx" ON "att_person"("company_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "att_person_company_id_code_key" ON "att_person"("company_id", "code");

-- CreateIndex
CREATE INDEX "att_credential_company_id_type_uid_idx" ON "att_credential"("company_id", "type", "uid");

-- CreateIndex
CREATE INDEX "att_credential_person_id_status_idx" ON "att_credential"("person_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "att_kiosk_link_token_key" ON "att_kiosk"("link_token");

-- CreateIndex
CREATE INDEX "att_kiosk_company_id_enabled_idx" ON "att_kiosk"("company_id", "enabled");

-- CreateIndex
CREATE INDEX "att_kiosk_device_token_hash_idx" ON "att_kiosk"("device_token_hash");

-- CreateIndex
CREATE INDEX "att_punch_company_id_occurred_at_idx" ON "att_punch"("company_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "att_punch_person_id_occurred_at_idx" ON "att_punch"("person_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "att_punch_kiosk_id_occurred_at_idx" ON "att_punch"("kiosk_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "att_quota_company_id_enabled_idx" ON "att_quota"("company_id", "enabled");

-- AddForeignKey
ALTER TABLE "att_credential" ADD CONSTRAINT "att_credential_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "att_person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "att_punch" ADD CONSTRAINT "att_punch_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "att_person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

