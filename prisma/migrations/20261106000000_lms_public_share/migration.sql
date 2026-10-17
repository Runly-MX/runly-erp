-- runly.lms: public course share link and external guest learners (spec 17)

ALTER TABLE "lms_course" ADD COLUMN "share_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "share_token" TEXT,
    ADD COLUMN "share_settings" JSONB NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX "lms_course_share_token_key" ON "lms_course"("share_token");

ALTER TABLE "lms_learner" ADD COLUMN "guest_token_hash" TEXT;
CREATE UNIQUE INDEX "lms_learner_guest_token_hash_key" ON "lms_learner"("guest_token_hash");

-- A learner is exactly one of: internal user, contact, or share-link guest.
ALTER TABLE "lms_learner" DROP CONSTRAINT IF EXISTS "lms_learner_subject_chk";
ALTER TABLE "lms_learner" ADD CONSTRAINT "lms_learner_subject_chk" CHECK (
    (("user_profile_id" IS NOT NULL)::int + ("contact_id" IS NOT NULL)::int + ("guest_token_hash" IS NOT NULL)::int) = 1
);
