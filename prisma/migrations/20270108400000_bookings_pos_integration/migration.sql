-- runly.bookings phase 5: POS restaurant tables and POS appointments on the Booking Engine.
-- Forward only; legacy pos_reservation / pos_appointment rows and columns stay untouched.

-- Seats of a resource (a table). NULL = not limited by party size.
ALTER TABLE "booking_resource" ADD COLUMN "capacity" INTEGER CHECK ("capacity" IS NULL OR "capacity" > 0);

-- Origin of a booking created by an integration (idempotent legacy migration) and the
-- POS account opened when the guest arrived.
ALTER TABLE "booking" ADD COLUMN "source_module" TEXT;
ALTER TABLE "booking" ADD COLUMN "source_id" UUID;
ALTER TABLE "booking" ADD COLUMN "pos_order_id" UUID REFERENCES "pos_order"("id") ON DELETE SET NULL;
ALTER TABLE "booking" ADD COLUMN "arrived_at" TIMESTAMPTZ(6);
CREATE UNIQUE INDEX "booking_source_key" ON "booking"("company_id", "source_module", "source_id") WHERE "source_id" IS NOT NULL;
CREATE UNIQUE INDEX "booking_pos_order_key" ON "booking"("pos_order_id") WHERE "pos_order_id" IS NOT NULL;

-- Which engine space serves an outlet's tables or appointments, and whether POS
-- already writes through the engine (mode = 'engine') or still uses the legacy tables.
CREATE TABLE "pos_booking_link" (
    "id"              UUID PRIMARY KEY DEFAULT uuidv7(),
    "company_id"      UUID NOT NULL REFERENCES "company"("id") ON DELETE CASCADE,
    "outlet_id"       UUID NOT NULL REFERENCES "pos_outlet"("id") ON DELETE CASCADE,
    "kind"            TEXT NOT NULL CHECK ("kind" IN ('tables', 'appointments')),
    "space_id"        UUID NOT NULL REFERENCES "booking_space"("id"),
    "service_id"      UUID NOT NULL REFERENCES "booking_service"("id"),
    "mode"            TEXT NOT NULL DEFAULT 'engine' CHECK ("mode" IN ('engine', 'legacy')),
    "activated_at"    TIMESTAMPTZ(6),
    "activated_by_id" UUID,
    "rolled_back_at"  TIMESTAMPTZ(6),
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("company_id", "outlet_id", "kind")
);

-- A POS table is one engine resource (capacity = table seats).
CREATE TABLE "pos_booking_table" (
    "table_id"    UUID PRIMARY KEY REFERENCES "pos_table"("id") ON DELETE CASCADE,
    "company_id"  UUID NOT NULL,
    "resource_id" UUID NOT NULL UNIQUE REFERENCES "booking_resource"("id")
);

-- Legacy rows that were carried into the engine (or copied back by a rollback).
ALTER TABLE "pos_reservation" ADD COLUMN "booking_id" UUID UNIQUE REFERENCES "booking"("id") ON DELETE SET NULL;
ALTER TABLE "pos_appointment" ADD COLUMN "booking_id" UUID UNIQUE REFERENCES "booking"("id") ON DELETE SET NULL;
