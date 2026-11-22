-- runly.lms standalone evaluations, phase 4 (spec 2026-11-21 section 8): the
-- consent a public participant gave when registering: { version, acceptedAt, text }.
-- NULL when the evaluation asks for none (and for every course enrollment).
ALTER TABLE "lms_enrollment" ADD COLUMN "consent" JSONB;
