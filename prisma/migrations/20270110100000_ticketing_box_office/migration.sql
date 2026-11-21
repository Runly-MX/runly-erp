-- runly.ticketing F6C: booking spaces owned by another module, and the price snapshot
-- a paid ticket order is confirmed against.

-- A space created and administered by another module (Ticketing events). Reservaciones
-- shows it read-only and links to its owner; the owner writes through the engine.
ALTER TABLE "booking_space" ADD COLUMN "owner_module" TEXT;
ALTER TABLE "booking_space" ADD COLUMN "owner_id" UUID;
ALTER TABLE "booking_space" ADD CONSTRAINT "booking_space_owner_check" CHECK (("owner_module" IS NULL) = ("owner_id" IS NULL));
CREATE UNIQUE INDEX "booking_space_owner_key" ON "booking_space"("owner_module", "owner_id") WHERE "owner_id" IS NOT NULL;

-- Ticketing events created in F6B own their spaces.
UPDATE "booking_space" s SET "owner_module" = 'runly.ticketing', "owner_id" = e."id"
  FROM "ticket_event" e WHERE e."space_id" = s."id" AND e."company_id" = s."company_id";

-- Paid orders: when Caja's sale was linked and confirmed.
ALTER TABLE "ticket_order" ADD COLUMN "paid_at" TIMESTAMPTZ(6);
-- Tickets voided after a Commerce refund keep the refund that justified them.
ALTER TABLE "ticket" ADD COLUMN "pos_refund_id" UUID;
