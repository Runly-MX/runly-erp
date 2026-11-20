-- runly.bookings phase 5.1 (production hardening of the POS integration).

-- A table physically occupied by an open POS account holds its engine resource through
-- an allocation owned by that account (no booking row, no events, no calendar entry).
-- The exclusion constraint then keeps online and POS reservations off busy tables.
ALTER TABLE "booking_allocation" ADD COLUMN "pos_order_id" UUID REFERENCES "pos_order"("id") ON DELETE CASCADE;
ALTER TABLE "booking_allocation" DROP CONSTRAINT "booking_allocation_owner_check";
ALTER TABLE "booking_allocation" ADD CONSTRAINT "booking_allocation_owner_check" CHECK (num_nonnulls("booking_id", "session_id", "pos_order_id") = 1);
CREATE INDEX "booking_allocation_pos_order_idx" ON "booking_allocation"("pos_order_id") WHERE "pos_order_id" IS NOT NULL;

-- IANA time zone of an outlet (NULL = not set; reservations then need one before activation).
ALTER TABLE "pos_outlet" ADD COLUMN "timezone" TEXT;

-- Defense in depth (same convention as pos_appointment): the API is the only client of these
-- tables. Default privileges already withhold them from the public PostgREST roles; RLS without
-- policies and an explicit revoke keep it so even if a grant is added by mistake. The API's role
-- owns the tables, so RLS does not apply to it.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['booking_space','booking_space_member','booking_service','booking_resource','booking_space_resource',
    'booking_service_resource','booking_schedule_rule','booking_exception','booking_session','booking','booking_allocation',
    'booking_history','booking_idempotency','booking_page','booking_notification','booking_rate_bucket','booking_calendar_sync',
    'pos_booking_link','pos_booking_table'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
  END LOOP;
END $$;
