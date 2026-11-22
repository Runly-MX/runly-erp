-- runly.bookings v1.2 R1: reservations of rooms and equipment by employees, on the same
-- engine (allocations + exclusion constraint). A "resources" space owns one hidden
-- internal service, so nobody configures a commercial service to book a room.
ALTER TABLE "booking_space" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'services' CHECK ("purpose" IN ('services', 'resources'));
ALTER TABLE "booking_service" ADD COLUMN "internal" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "booking_service_internal_key" ON "booking_service"("space_id") WHERE "internal";

ALTER TABLE "booking" ADD COLUMN "title" TEXT;
ALTER TABLE "booking" ADD COLUMN "organizer_id" UUID REFERENCES "user_profile"("id") ON DELETE SET NULL;
CREATE INDEX "booking_organizer_id_idx" ON "booking"("organizer_id", "starts_at");

CREATE TABLE "booking_participant" (
    "id"         UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "user_id"    UUID NOT NULL REFERENCES "user_profile"("id") ON DELETE CASCADE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_participant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_participant_booking_user_key" UNIQUE ("booking_id", "user_id"),
    CONSTRAINT "booking_participant_booking_fkey" FOREIGN KEY ("company_id", "booking_id") REFERENCES "booking"("company_id", "id") ON DELETE CASCADE
);
CREATE INDEX "booking_participant_user_id_idx" ON "booking_participant"("user_id");

DO $$ BEGIN
  ALTER TABLE public.booking_participant ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.booking_participant FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.booking_participant FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.booking_participant FROM authenticated; END IF;
END $$;
