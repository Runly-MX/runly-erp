-- runly.ticketing core (spec 2026-11-20-ticketing-design, phase F6B).
-- Seats of a function live in the Booking Engine (booking_session.seats_taken, taken
-- through one engine booking per order); Ticketing adds per-type quotas, orders,
-- tickets, credentials (SHA-256 only), history and idempotency.
-- Composite (company_id, id) foreign keys make cross-company references impossible.

CREATE TABLE "ticket_event" (
    "id"                   UUID NOT NULL DEFAULT uuidv7(),
    "company_id"           UUID NOT NULL REFERENCES "company"("id") ON DELETE CASCADE,
    "space_id"             UUID NOT NULL,
    "service_id"           UUID NOT NULL,
    "title"                TEXT NOT NULL CHECK (length("title") BETWEEN 1 AND 160),
    "slug"                 TEXT NOT NULL CHECK ("slug" ~ '^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$'),
    "description"          TEXT,
    "venue"                TEXT,
    "image_file_id"        UUID,
    "organizer_contact_id" UUID,
    "published"            BOOLEAN NOT NULL DEFAULT false,
    "sales_open"           BOOLEAN NOT NULL DEFAULT false,
    "policy"               JSONB NOT NULL DEFAULT '{}',
    "policy_version"       INTEGER NOT NULL DEFAULT 1,
    "enabled"              BOOLEAN NOT NULL DEFAULT true,
    "created_by_id"        UUID,
    "version"              INTEGER NOT NULL DEFAULT 1,
    "created_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_event_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_event_company_id_id_key" UNIQUE ("company_id", "id"),
    -- Global: the public page (F6E) resolves the company from the slug alone.
    CONSTRAINT "ticket_event_slug_key" UNIQUE ("slug"),
    CONSTRAINT "ticket_event_space_key" UNIQUE ("space_id"),
    CONSTRAINT "ticket_event_space_fkey" FOREIGN KEY ("company_id", "space_id") REFERENCES "booking_space"("company_id", "id"),
    CONSTRAINT "ticket_event_service_fkey" FOREIGN KEY ("company_id", "service_id") REFERENCES "booking_service"("company_id", "id"),
    CONSTRAINT "ticket_event_contact_fkey" FOREIGN KEY ("organizer_contact_id") REFERENCES "contact"("id") ON DELETE SET NULL
);
CREATE INDEX "ticket_event_company_id_idx" ON "ticket_event"("company_id", "created_at");

-- A function of the event: exactly one booking_session (time and room capacity).
CREATE TABLE "ticket_session" (
    "id"                   UUID NOT NULL DEFAULT uuidv7(),
    "company_id"           UUID NOT NULL,
    "event_id"             UUID NOT NULL,
    "booking_session_id"   UUID NOT NULL,
    "status"               TEXT NOT NULL DEFAULT 'scheduled' CHECK ("status" IN ('scheduled', 'cancelled', 'finished')),
    "doors_open_at"        TIMESTAMPTZ(6),
    "admit_before_minutes" INTEGER NOT NULL DEFAULT 120 CHECK ("admit_before_minutes" BETWEEN 0 AND 1440),
    "admit_after_minutes"  INTEGER NOT NULL DEFAULT 60 CHECK ("admit_after_minutes" BETWEEN 0 AND 1440),
    "version"              INTEGER NOT NULL DEFAULT 1,
    "created_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_session_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_session_company_id_id_key" UNIQUE ("company_id", "id"),
    CONSTRAINT "ticket_session_booking_session_key" UNIQUE ("booking_session_id"),
    CONSTRAINT "ticket_session_event_fkey" FOREIGN KEY ("company_id", "event_id") REFERENCES "ticket_event"("company_id", "id") ON DELETE CASCADE,
    CONSTRAINT "ticket_session_booking_session_fkey" FOREIGN KEY ("company_id", "booking_session_id") REFERENCES "booking_session"("company_id", "id")
);
CREATE INDEX "ticket_session_event_id_idx" ON "ticket_session"("event_id");

CREATE TABLE "ticket_type" (
    "id"                 UUID NOT NULL DEFAULT uuidv7(),
    "company_id"         UUID NOT NULL,
    "event_id"           UUID NOT NULL,
    "name"               TEXT NOT NULL CHECK (length("name") BETWEEN 1 AND 120),
    "description"        TEXT,
    "price_mode"         TEXT NOT NULL DEFAULT 'free' CHECK ("price_mode" IN ('free', 'pos')),
    "catalog_product_id" UUID,
    "currency"           TEXT,
    "per_order_max"      INTEGER NOT NULL DEFAULT 10 CHECK ("per_order_max" BETWEEN 1 AND 100),
    "sales_start"        TIMESTAMPTZ(6),
    "sales_end"          TIMESTAMPTZ(6),
    "visibility"         TEXT NOT NULL DEFAULT 'public' CHECK ("visibility" IN ('public', 'private', 'box_office')),
    "sort"               INTEGER NOT NULL DEFAULT 0,
    "enabled"            BOOLEAN NOT NULL DEFAULT true,
    "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_type_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_type_company_id_id_key" UNIQUE ("company_id", "id"),
    CONSTRAINT "ticket_type_price_check" CHECK (("price_mode" = 'free') = ("catalog_product_id" IS NULL)),
    CONSTRAINT "ticket_type_sales_check" CHECK ("sales_end" IS NULL OR "sales_start" IS NULL OR "sales_end" > "sales_start"),
    CONSTRAINT "ticket_type_event_fkey" FOREIGN KEY ("company_id", "event_id") REFERENCES "ticket_event"("company_id", "id") ON DELETE CASCADE,
    CONSTRAINT "ticket_type_product_fkey" FOREIGN KEY ("company_id", "catalog_product_id") REFERENCES "catalog_product"("company_id", "id")
);
CREATE INDEX "ticket_type_event_id_idx" ON "ticket_type"("event_id", "sort");

-- Per type and function. issued only moves through conditional UPDATEs; NULL quota =
-- only the function's room capacity limits it.
CREATE TABLE "ticket_quota" (
    "id"             UUID NOT NULL DEFAULT uuidv7(),
    "company_id"     UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    "session_id"     UUID NOT NULL,
    "quota"          INTEGER CHECK ("quota" >= 0),
    "issued"         INTEGER NOT NULL DEFAULT 0,
    "updated_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_quota_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_quota_type_session_key" UNIQUE ("ticket_type_id", "session_id"),
    CONSTRAINT "ticket_quota_issued_check" CHECK ("issued" >= 0 AND ("quota" IS NULL OR "issued" <= "quota")),
    CONSTRAINT "ticket_quota_type_fkey" FOREIGN KEY ("company_id", "ticket_type_id") REFERENCES "ticket_type"("company_id", "id") ON DELETE CASCADE,
    CONSTRAINT "ticket_quota_session_fkey" FOREIGN KEY ("company_id", "session_id") REFERENCES "ticket_session"("company_id", "id") ON DELETE CASCADE
);

CREATE TABLE "ticket_order" (
    "id"                   UUID NOT NULL DEFAULT uuidv7(),
    "company_id"           UUID NOT NULL,
    "event_id"             UUID NOT NULL,
    "session_id"           UUID NOT NULL,
    "status"               TEXT NOT NULL CHECK ("status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'REFUNDED')),
    "channel"              TEXT NOT NULL CHECK ("channel" IN ('box_office', 'portal', 'website', 'api')),
    "reference"            TEXT NOT NULL DEFAULT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
    "quantity"             INTEGER NOT NULL CHECK ("quantity" BETWEEN 1 AND 100),
    "contact_id"           UUID,
    "buyer_name"           TEXT,
    "buyer_email"          TEXT,
    "buyer_phone"          TEXT,
    "pos_order_id"         UUID,
    "booking_id"           UUID,
    "hold_expires_at"      TIMESTAMPTZ(6),
    "totals"               JSONB NOT NULL DEFAULT '{}',
    "policy_version"       INTEGER NOT NULL,
    "manage_token_hash"    TEXT UNIQUE,
    "manage_token_version" INTEGER NOT NULL DEFAULT 0,
    "created_by_id"        UUID,
    "version"              INTEGER NOT NULL DEFAULT 1,
    "created_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_order_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_order_company_id_id_key" UNIQUE ("company_id", "id"),
    CONSTRAINT "ticket_order_reference_key" UNIQUE ("company_id", "reference"),
    CONSTRAINT "ticket_order_booking_key" UNIQUE ("booking_id"),
    CONSTRAINT "ticket_order_pos_order_key" UNIQUE ("pos_order_id"),
    CONSTRAINT "ticket_order_hold_check" CHECK (("status" = 'PENDING_PAYMENT') = ("hold_expires_at" IS NOT NULL)),
    CONSTRAINT "ticket_order_event_fkey" FOREIGN KEY ("company_id", "event_id") REFERENCES "ticket_event"("company_id", "id"),
    CONSTRAINT "ticket_order_session_fkey" FOREIGN KEY ("company_id", "session_id") REFERENCES "ticket_session"("company_id", "id"),
    CONSTRAINT "ticket_order_booking_fkey" FOREIGN KEY ("company_id", "booking_id") REFERENCES "booking"("company_id", "id"),
    CONSTRAINT "ticket_order_contact_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE SET NULL
);
CREATE INDEX "ticket_order_session_id_idx" ON "ticket_order"("session_id", "status");
CREATE INDEX "ticket_order_hold_idx" ON "ticket_order"("hold_expires_at") WHERE "status" = 'PENDING_PAYMENT';

-- The right to enter. Only the SHA-256 of the current QR secret is stored; a reissue
-- or transfer replaces it, so earlier QRs stop matching at once.
CREATE TABLE "ticket" (
    "id"                 UUID NOT NULL DEFAULT uuidv7(),
    "company_id"         UUID NOT NULL,
    "order_id"           UUID NOT NULL,
    "session_id"         UUID NOT NULL,
    "type_id"            UUID NOT NULL,
    "code"               TEXT NOT NULL DEFAULT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
    "status"             TEXT NOT NULL CHECK ("status" IN ('PENDING_PAYMENT', 'ISSUED', 'USED', 'CANCELLED', 'EXPIRED')),
    "holder_name"        TEXT,
    "holder_email"       TEXT,
    "credential_version" INTEGER NOT NULL DEFAULT 0,
    "credential_hash"    TEXT UNIQUE,
    "issued_at"          TIMESTAMPTZ(6),
    "cancelled_at"       TIMESTAMPTZ(6),
    "version"            INTEGER NOT NULL DEFAULT 1,
    "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_company_id_id_key" UNIQUE ("company_id", "id"),
    CONSTRAINT "ticket_code_key" UNIQUE ("company_id", "code"),
    CONSTRAINT "ticket_credential_check" CHECK (("status" IN ('ISSUED', 'USED')) = ("credential_hash" IS NOT NULL AND "credential_version" >= 1)),
    CONSTRAINT "ticket_order_fkey" FOREIGN KEY ("company_id", "order_id") REFERENCES "ticket_order"("company_id", "id"),
    CONSTRAINT "ticket_session_fkey" FOREIGN KEY ("company_id", "session_id") REFERENCES "ticket_session"("company_id", "id"),
    CONSTRAINT "ticket_type_fkey" FOREIGN KEY ("company_id", "type_id") REFERENCES "ticket_type"("company_id", "id")
);
CREATE INDEX "ticket_order_id_idx" ON "ticket"("order_id");
CREATE INDEX "ticket_session_status_idx" ON "ticket"("session_id", "status");

-- Check-in results (written from F6D). One admission per ticket in v1.
CREATE TABLE "ticket_admission" (
    "id"          UUID NOT NULL DEFAULT uuidv7(),
    "company_id"  UUID NOT NULL,
    "ticket_id"   UUID NOT NULL,
    "session_id"  UUID NOT NULL,
    "result"      TEXT NOT NULL CHECK ("result" IN ('admitted', 'rejected')),
    "reason"      TEXT NOT NULL CHECK ("reason" IN ('ok', 'already_used', 'cancelled', 'wrong_session', 'outside_window', 'unknown', 'revoked')),
    "device_id"   TEXT,
    "operator_id" UUID,
    "offline"     BOOLEAN NOT NULL DEFAULT false,
    "scanned_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_admission_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_admission_ticket_fkey" FOREIGN KEY ("company_id", "ticket_id") REFERENCES "ticket"("company_id", "id"),
    CONSTRAINT "ticket_admission_session_fkey" FOREIGN KEY ("company_id", "session_id") REFERENCES "ticket_session"("company_id", "id")
);
CREATE UNIQUE INDEX "ticket_admission_once_key" ON "ticket_admission"("ticket_id") WHERE "result" = 'admitted';
CREATE INDEX "ticket_admission_session_idx" ON "ticket_admission"("session_id", "scanned_at");

-- Append-only audit of orders and tickets (guarded by the trigger below).
CREATE TABLE "ticket_history" (
    "id"         UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL REFERENCES "company"("id") ON DELETE CASCADE,
    "entity"     TEXT NOT NULL CHECK ("entity" IN ('event', 'session', 'type', 'quota', 'order', 'ticket')),
    "entity_id"  UUID NOT NULL,
    "action"     TEXT NOT NULL,
    "actor_id"   UUID,
    "actor_kind" TEXT NOT NULL DEFAULT 'user' CHECK ("actor_kind" IN ('user', 'portal', 'system')),
    "before"     JSONB,
    "after"      JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ticket_history_entity_idx" ON "ticket_history"("entity_id", "created_at");

CREATE FUNCTION ticket_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ticket_history is append-only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER ticket_history_append_only BEFORE UPDATE OR DELETE ON "ticket_history"
  FOR EACH ROW EXECUTE FUNCTION ticket_history_append_only();

-- Written inside the operation's transaction: a rolled-back attempt leaves no record.
CREATE TABLE "ticket_idempotency" (
    "id"           UUID NOT NULL DEFAULT uuidv7(),
    "company_id"   UUID NOT NULL REFERENCES "company"("id") ON DELETE CASCADE,
    "scope"        TEXT NOT NULL,
    "operation"    TEXT NOT NULL,
    "key"          TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "result_id"    UUID,
    "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_idempotency_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_idempotency_key_key" UNIQUE ("company_id", "scope", "operation", "key")
);

-- The API and worker use the owner role through Prisma (not subject to RLS, no FORCE).
-- Supabase client roles must not read or write ticketing data directly.
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'ticket\_%' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon', t); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t); END IF;
  END LOOP;
  ALTER TABLE public.ticket ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.ticket FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.ticket FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.ticket FROM authenticated; END IF;
END $$;
