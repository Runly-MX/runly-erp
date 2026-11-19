-- runly.bookings phase 3: public Booking Portal (spec 2026-11-18-bookings-engine-design §7.3).

-- A public page of a space. The slug is global because the public URL carries
-- no company: /app/p/reservar/<slug>. Pages are never hard-deleted (enabled).
CREATE TABLE "booking_page" (
    "id"                    UUID NOT NULL DEFAULT uuidv7(),
    "company_id"            UUID NOT NULL,
    "space_id"              UUID NOT NULL,
    "slug"                  TEXT NOT NULL,
    "title"                 TEXT NOT NULL,
    "description"           TEXT,
    "location"              TEXT,
    "instructions"          TEXT,
    "service_ids"           UUID[] NOT NULL DEFAULT '{}',
    "published"             BOOLEAN NOT NULL DEFAULT false,
    "allow_resource_choice" BOOLEAN NOT NULL DEFAULT false,
    "require_phone"         BOOLEAN NOT NULL DEFAULT false,
    "cancellation_policy"   TEXT,
    "reschedule_policy"     TEXT,
    "punctuality_policy"    TEXT,
    "privacy_notice"        TEXT,
    "policy_version"        INTEGER NOT NULL DEFAULT 1,
    "accent_color"          TEXT,
    "enabled"               BOOLEAN NOT NULL DEFAULT true,
    "created_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_page_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_page_company_id_id_key" UNIQUE ("company_id", "id"),
    CONSTRAINT "booking_page_slug_key" UNIQUE ("slug"),
    CONSTRAINT "booking_page_slug_check" CHECK ("slug" ~ '^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$'),
    CONSTRAINT "booking_page_accent_check" CHECK ("accent_color" IS NULL OR "accent_color" ~ '^#[0-9a-fA-F]{6}$'),
    CONSTRAINT "booking_page_space_fkey" FOREIGN KEY ("company_id", "space_id") REFERENCES "booking_space"("company_id", "id") ON DELETE CASCADE
);
CREATE INDEX "booking_page_space_id_idx" ON "booking_page"("space_id");

-- Public reference (folio), page of origin, accepted policies and the manage
-- link: only a SHA-256 of the token is stored; the token itself is an HMAC of
-- (booking id, version), so rotating = bumping the version.
ALTER TABLE "booking" ADD COLUMN "page_id" UUID;
ALTER TABLE "booking" ADD COLUMN "reference" TEXT NOT NULL DEFAULT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
ALTER TABLE "booking" ADD COLUMN "manage_token_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "booking" ADD COLUMN "manage_token_expires_at" TIMESTAMPTZ(6);
ALTER TABLE "booking" ADD COLUMN "policy_acceptance" JSONB;
ALTER TABLE "booking" ADD CONSTRAINT "booking_company_id_reference_key" UNIQUE ("company_id", "reference");
ALTER TABLE "booking" ADD CONSTRAINT "booking_page_fkey" FOREIGN KEY ("company_id", "page_id") REFERENCES "booking_page"("company_id", "id");

-- Transactional emails to the customer. Written in the booking transaction
-- (dedupe_key = booking:kind:version), sent by the worker outside it.
CREATE TABLE "booking_notification" (
    "id"              UUID NOT NULL DEFAULT uuidv7(),
    "company_id"      UUID NOT NULL,
    "booking_id"      UUID NOT NULL,
    "kind"            TEXT NOT NULL CHECK ("kind" IN ('pending', 'confirmed', 'rescheduled', 'cancelled', 'rejected', 'manage_link')),
    "dedupe_key"      TEXT NOT NULL,
    "recipient"       TEXT NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
    "attempts"        INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until"    TIMESTAMPTZ(6),
    "last_error"      TEXT,
    "sent_at"         TIMESTAMPTZ(6),
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_notification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_notification_dedupe_key_key" UNIQUE ("dedupe_key"),
    CONSTRAINT "booking_notification_booking_fkey" FOREIGN KEY ("company_id", "booking_id") REFERENCES "booking"("company_id", "id")
);
CREATE INDEX "booking_notification_status_next_attempt_at_idx" ON "booking_notification"("status", "next_attempt_at");
CREATE INDEX "booking_notification_booking_id_idx" ON "booking_notification"("booking_id");
CREATE INDEX "booking_status_hold_expires_at_idx" ON "booking"("status", "hold_expires_at") WHERE "status" = 'PENDING';
