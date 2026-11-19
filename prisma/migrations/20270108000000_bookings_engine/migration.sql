-- runly.bookings phase 1: Booking Engine (spec 2026-11-18-bookings-engine-design).
-- Intervals are half-open [start, end): back-to-back bookings coexist.
-- Composite (company_id, id) foreign keys make cross-company references impossible.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "booking_status" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'COMPLETED', 'NO_SHOW', 'EXPIRED');

CREATE TABLE "booking_space" (
    "id"            UUID NOT NULL DEFAULT uuidv7(),
    "company_id"    UUID NOT NULL REFERENCES "company"("id") ON DELETE CASCADE,
    "name"          TEXT NOT NULL,
    "slug"          TEXT NOT NULL,
    "description"   TEXT,
    "mode"          TEXT NOT NULL DEFAULT 'internal' CHECK ("mode" IN ('internal', 'online', 'hybrid')),
    "timezone"      TEXT NOT NULL,
    "published"     BOOLEAN NOT NULL DEFAULT false,
    "policy"        JSONB NOT NULL DEFAULT '{}',
    "enabled"       BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_space_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_space_company_id_id_key" UNIQUE ("company_id", "id"),
    CONSTRAINT "booking_space_company_id_slug_key" UNIQUE ("company_id", "slug")
);

CREATE TABLE "booking_space_member" (
    "id"         UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "space_id"   UUID NOT NULL,
    "user_id"    UUID NOT NULL REFERENCES "user_profile"("id") ON DELETE CASCADE,
    "role"       TEXT NOT NULL CHECK ("role" IN ('admin', 'agent', 'viewer')),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_space_member_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_space_member_space_id_user_id_key" UNIQUE ("space_id", "user_id"),
    CONSTRAINT "booking_space_member_space_fkey" FOREIGN KEY ("company_id", "space_id") REFERENCES "booking_space"("company_id", "id") ON DELETE CASCADE
);
CREATE INDEX "booking_space_member_user_id_idx" ON "booking_space_member"("user_id");

CREATE TABLE "booking_service" (
    "id"                    UUID NOT NULL DEFAULT uuidv7(),
    "company_id"            UUID NOT NULL,
    "space_id"              UUID NOT NULL,
    "name"                  TEXT NOT NULL,
    "description"           TEXT,
    "kind"                  TEXT NOT NULL CHECK ("kind" IN ('appointment', 'session')),
    "duration_minutes"      INTEGER NOT NULL CHECK ("duration_minutes" BETWEEN 1 AND 1440),
    "buffer_before_minutes" INTEGER NOT NULL DEFAULT 0 CHECK ("buffer_before_minutes" BETWEEN 0 AND 720),
    "buffer_after_minutes"  INTEGER NOT NULL DEFAULT 0 CHECK ("buffer_after_minutes" BETWEEN 0 AND 720),
    "slot_step_minutes"     INTEGER NOT NULL DEFAULT 30 CHECK ("slot_step_minutes" BETWEEN 5 AND 1440),
    "capacity"              INTEGER NOT NULL DEFAULT 1 CHECK ("capacity" >= 1),
    "min_party"             INTEGER NOT NULL DEFAULT 1 CHECK ("min_party" >= 1),
    "max_party"             INTEGER NOT NULL DEFAULT 1 CHECK ("max_party" >= "min_party"),
    "enabled"               BOOLEAN NOT NULL DEFAULT true,
    "created_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_service_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_service_company_id_id_key" UNIQUE ("company_id", "id"),
    CONSTRAINT "booking_service_space_fkey" FOREIGN KEY ("company_id", "space_id") REFERENCES "booking_space"("company_id", "id") ON DELETE CASCADE
);
CREATE INDEX "booking_service_space_id_idx" ON "booking_service"("space_id");

-- Company-level: a resource linked to several spaces is shared between them.
CREATE TABLE "booking_resource" (
    "id"         UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL REFERENCES "company"("id") ON DELETE CASCADE,
    "name"       TEXT NOT NULL,
    "type"       TEXT NOT NULL DEFAULT 'other' CHECK ("type" IN ('staff', 'room', 'equipment', 'table', 'other')),
    "user_id"    UUID REFERENCES "user_profile"("id") ON DELETE SET NULL,
    "enabled"    BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_resource_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_resource_company_id_id_key" UNIQUE ("company_id", "id")
);

CREATE TABLE "booking_space_resource" (
    "company_id"  UUID NOT NULL,
    "space_id"    UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    CONSTRAINT "booking_space_resource_pkey" PRIMARY KEY ("space_id", "resource_id"),
    CONSTRAINT "booking_space_resource_space_fkey" FOREIGN KEY ("company_id", "space_id") REFERENCES "booking_space"("company_id", "id") ON DELETE CASCADE,
    CONSTRAINT "booking_space_resource_resource_fkey" FOREIGN KEY ("company_id", "resource_id") REFERENCES "booking_resource"("company_id", "id") ON DELETE CASCADE
);

CREATE TABLE "booking_service_resource" (
    "company_id"  UUID NOT NULL,
    "service_id"  UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    CONSTRAINT "booking_service_resource_pkey" PRIMARY KEY ("service_id", "resource_id"),
    CONSTRAINT "booking_service_resource_service_fkey" FOREIGN KEY ("company_id", "service_id") REFERENCES "booking_service"("company_id", "id") ON DELETE CASCADE,
    CONSTRAINT "booking_service_resource_resource_fkey" FOREIGN KEY ("company_id", "resource_id") REFERENCES "booking_resource"("company_id", "id") ON DELETE CASCADE
);

-- Weekly hours in the space's local wall clock; end <= start crosses midnight.
CREATE TABLE "booking_schedule_rule" (
    "id"          UUID NOT NULL DEFAULT uuidv7(),
    "company_id"  UUID NOT NULL,
    "space_id"    UUID,
    "resource_id" UUID,
    "weekday"     SMALLINT NOT NULL CHECK ("weekday" BETWEEN 0 AND 6),
    "start_time"  TIME(0) NOT NULL,
    "end_time"    TIME(0) NOT NULL,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_schedule_rule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_schedule_rule_owner_check" CHECK (num_nonnulls("space_id", "resource_id") = 1),
    CONSTRAINT "booking_schedule_rule_span_check" CHECK ("start_time" <> "end_time"),
    CONSTRAINT "booking_schedule_rule_space_fkey" FOREIGN KEY ("company_id", "space_id") REFERENCES "booking_space"("company_id", "id") ON DELETE CASCADE,
    CONSTRAINT "booking_schedule_rule_resource_fkey" FOREIGN KEY ("company_id", "resource_id") REFERENCES "booking_resource"("company_id", "id") ON DELETE CASCADE
);
CREATE INDEX "booking_schedule_rule_space_id_idx" ON "booking_schedule_rule"("space_id");
CREATE INDEX "booking_schedule_rule_resource_id_idx" ON "booking_schedule_rule"("resource_id");

CREATE TABLE "booking_exception" (
    "id"          UUID NOT NULL DEFAULT uuidv7(),
    "company_id"  UUID NOT NULL,
    "space_id"    UUID,
    "resource_id" UUID,
    "starts_at"   TIMESTAMPTZ(6) NOT NULL,
    "ends_at"     TIMESTAMPTZ(6) NOT NULL,
    "kind"        TEXT NOT NULL CHECK ("kind" IN ('closed', 'open')),
    "reason"      TEXT,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_exception_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_exception_owner_check" CHECK (num_nonnulls("space_id", "resource_id") = 1),
    CONSTRAINT "booking_exception_span_check" CHECK ("ends_at" > "starts_at"),
    CONSTRAINT "booking_exception_space_fkey" FOREIGN KEY ("company_id", "space_id") REFERENCES "booking_space"("company_id", "id") ON DELETE CASCADE,
    CONSTRAINT "booking_exception_resource_fkey" FOREIGN KEY ("company_id", "resource_id") REFERENCES "booking_resource"("company_id", "id") ON DELETE CASCADE
);
CREATE INDEX "booking_exception_company_id_starts_at_idx" ON "booking_exception"("company_id", "starts_at");

-- Shared-capacity occurrence; seats_taken only moves through conditional UPDATEs.
CREATE TABLE "booking_session" (
    "id"          UUID NOT NULL DEFAULT uuidv7(),
    "company_id"  UUID NOT NULL,
    "space_id"    UUID NOT NULL,
    "service_id"  UUID NOT NULL,
    "resource_id" UUID,
    "starts_at"   TIMESTAMPTZ(6) NOT NULL,
    "ends_at"     TIMESTAMPTZ(6) NOT NULL,
    "capacity"    INTEGER NOT NULL CHECK ("capacity" >= 1),
    "seats_taken" INTEGER NOT NULL DEFAULT 0,
    "status"      TEXT NOT NULL DEFAULT 'scheduled' CHECK ("status" IN ('scheduled', 'cancelled')),
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_session_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_session_company_id_id_key" UNIQUE ("company_id", "id"),
    CONSTRAINT "booking_session_seats_check" CHECK ("seats_taken" BETWEEN 0 AND "capacity"),
    CONSTRAINT "booking_session_span_check" CHECK ("ends_at" > "starts_at"),
    CONSTRAINT "booking_session_space_fkey" FOREIGN KEY ("company_id", "space_id") REFERENCES "booking_space"("company_id", "id") ON DELETE CASCADE,
    CONSTRAINT "booking_session_service_fkey" FOREIGN KEY ("company_id", "service_id") REFERENCES "booking_service"("company_id", "id") ON DELETE CASCADE,
    CONSTRAINT "booking_session_resource_fkey" FOREIGN KEY ("company_id", "resource_id") REFERENCES "booking_resource"("company_id", "id")
);
CREATE INDEX "booking_session_service_id_starts_at_idx" ON "booking_session"("service_id", "starts_at");

CREATE TABLE "booking" (
    "id"                UUID NOT NULL DEFAULT uuidv7(),
    "company_id"        UUID NOT NULL,
    "space_id"          UUID NOT NULL,
    "service_id"        UUID NOT NULL,
    "session_id"        UUID,
    "status"            "booking_status" NOT NULL,
    "starts_at"         TIMESTAMPTZ(6) NOT NULL,
    "ends_at"           TIMESTAMPTZ(6) NOT NULL,
    "party_size"        INTEGER NOT NULL DEFAULT 1 CHECK ("party_size" >= 1),
    "contact_id"        UUID REFERENCES "contact"("id") ON DELETE SET NULL,
    "guest_name"        TEXT,
    "guest_email"       TEXT,
    "guest_phone"       TEXT,
    "notes"             TEXT,
    "channel"           TEXT NOT NULL DEFAULT 'backoffice' CHECK ("channel" IN ('backoffice', 'portal', 'website', 'pos', 'api')),
    "hold_expires_at"   TIMESTAMPTZ(6),
    "manage_token_hash" TEXT,
    "created_by_id"     UUID,
    "version"           INTEGER NOT NULL DEFAULT 1,
    "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_company_id_id_key" UNIQUE ("company_id", "id"),
    CONSTRAINT "booking_manage_token_hash_key" UNIQUE ("manage_token_hash"),
    CONSTRAINT "booking_span_check" CHECK ("ends_at" > "starts_at"),
    CONSTRAINT "booking_space_fkey" FOREIGN KEY ("company_id", "space_id") REFERENCES "booking_space"("company_id", "id"),
    CONSTRAINT "booking_service_fkey" FOREIGN KEY ("company_id", "service_id") REFERENCES "booking_service"("company_id", "id"),
    CONSTRAINT "booking_session_fkey" FOREIGN KEY ("company_id", "session_id") REFERENCES "booking_session"("company_id", "id")
);
CREATE INDEX "booking_company_id_starts_at_idx" ON "booking"("company_id", "starts_at");
CREATE INDEX "booking_company_id_status_idx" ON "booking"("company_id", "status");
CREATE INDEX "booking_space_id_starts_at_idx" ON "booking"("space_id", "starts_at");
CREATE INDEX "booking_session_id_idx" ON "booking"("session_id");

-- What actually occupies a resource: a booking (with buffers) or a session.
-- The exclusion constraint is the final guard against double booking.
CREATE TABLE "booking_allocation" (
    "id"          UUID NOT NULL DEFAULT uuidv7(),
    "company_id"  UUID NOT NULL,
    "booking_id"  UUID,
    "session_id"  UUID,
    "resource_id" UUID NOT NULL,
    "during"      TSTZRANGE NOT NULL,
    "active"      BOOLEAN NOT NULL DEFAULT true,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_allocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_allocation_owner_check" CHECK (num_nonnulls("booking_id", "session_id") = 1),
    CONSTRAINT "booking_allocation_during_check" CHECK (NOT isempty("during") AND lower_inc("during") AND NOT upper_inc("during")),
    CONSTRAINT "booking_allocation_booking_fkey" FOREIGN KEY ("company_id", "booking_id") REFERENCES "booking"("company_id", "id"),
    CONSTRAINT "booking_allocation_session_fkey" FOREIGN KEY ("company_id", "session_id") REFERENCES "booking_session"("company_id", "id"),
    CONSTRAINT "booking_allocation_resource_fkey" FOREIGN KEY ("company_id", "resource_id") REFERENCES "booking_resource"("company_id", "id"),
    CONSTRAINT "booking_allocation_no_overlap" EXCLUDE USING gist ("resource_id" WITH =, "during" WITH &&) WHERE ("active")
);
CREATE INDEX "booking_allocation_booking_id_idx" ON "booking_allocation"("booking_id");
CREATE INDEX "booking_allocation_session_id_idx" ON "booking_allocation"("session_id");

-- Append-only change history (guarded by trigger below).
CREATE TABLE "booking_history" (
    "id"          UUID NOT NULL DEFAULT uuidv7(),
    "company_id"  UUID NOT NULL,
    "booking_id"  UUID NOT NULL,
    "actor_id"    UUID,
    "actor_kind"  TEXT NOT NULL DEFAULT 'user' CHECK ("actor_kind" IN ('user', 'portal', 'system')),
    "action"      TEXT NOT NULL,
    "from_status" "booking_status",
    "to_status"   "booking_status",
    "before"      JSONB,
    "after"       JSONB,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_history_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_history_booking_fkey" FOREIGN KEY ("company_id", "booking_id") REFERENCES "booking"("company_id", "id")
);
CREATE INDEX "booking_history_booking_id_created_at_idx" ON "booking_history"("booking_id", "created_at");

CREATE FUNCTION booking_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'booking_history is append-only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER booking_history_append_only BEFORE UPDATE OR DELETE ON "booking_history"
  FOR EACH ROW EXECUTE FUNCTION booking_history_append_only();

-- Idempotency per (company, scope = actor or client, operation, key). Written inside
-- the operation's transaction, so a rolled-back attempt leaves no record.
CREATE TABLE "booking_idempotency" (
    "id"           UUID NOT NULL DEFAULT uuidv7(),
    "company_id"   UUID NOT NULL REFERENCES "company"("id") ON DELETE CASCADE,
    "scope"        TEXT NOT NULL,
    "operation"    TEXT NOT NULL,
    "key"          TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "booking_id"   UUID,
    "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_idempotency_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_idempotency_key_key" UNIQUE ("company_id", "scope", "operation", "key")
);
