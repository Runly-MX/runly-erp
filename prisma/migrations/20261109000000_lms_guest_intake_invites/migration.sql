-- runly.lms: guest intake answers and email invitations for shared courses (spec 17)

ALTER TABLE "lms_learner" ADD COLUMN "guest_profile" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE "lms_guest_invite" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "code_hash" TEXT NOT NULL,
    "link_token" TEXT NOT NULL,
    "learner_id" UUID,
    "invited_by_id" UUID,
    "sent_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lms_guest_invite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lms_guest_invite_link_token_key" ON "lms_guest_invite"("link_token");
CREATE UNIQUE INDEX "lms_guest_invite_course_id_email_key" ON "lms_guest_invite"("course_id", "email");
CREATE INDEX "lms_guest_invite_company_id_course_id_idx" ON "lms_guest_invite"("company_id", "course_id");
