-- runly.bookings phase 4: distribution (embeds, shared rate limits).

-- Origins (scheme://host[:port]) allowed to show a page inside an iframe.
ALTER TABLE "booking_page" ADD COLUMN "embed_origins" TEXT[] NOT NULL DEFAULT '{}';

-- Token buckets of the public portal shared by every API instance. Keys are
-- hashes (no client IPs at rest). UNLOGGED: losing them on a crash only resets limits.
CREATE UNLOGGED TABLE "booking_rate_bucket" (
    "key"        TEXT PRIMARY KEY,
    "tokens"     DOUBLE PRECISION NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX "booking_rate_bucket_updated_idx" ON "booking_rate_bucket"("updated_at");

-- Calendar projection bookkeeping: the booking version last mirrored onto
-- runly.calendar. The engine never reads it back (availability stays in bookings).
CREATE TABLE "booking_calendar_sync" (
    "booking_id" UUID PRIMARY KEY REFERENCES "booking"("id") ON DELETE CASCADE,
    "company_id" UUID NOT NULL,
    "version"    INTEGER NOT NULL,
    "synced_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "booking_updated_idx" ON "booking"("updated_at");
