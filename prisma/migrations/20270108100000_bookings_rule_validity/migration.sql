-- runly.bookings phase 2: optional validity window for weekly hours, in the
-- space's local calendar dates (inclusive). NULL = open-ended.
ALTER TABLE "booking_schedule_rule" ADD COLUMN "valid_from" DATE;
ALTER TABLE "booking_schedule_rule" ADD COLUMN "valid_to" DATE;
ALTER TABLE "booking_schedule_rule" ADD CONSTRAINT "booking_schedule_rule_validity_check"
  CHECK ("valid_from" IS NULL OR "valid_to" IS NULL OR "valid_to" >= "valid_from");
