-- runly.bookings v1.2 R2: online meetings. A service may run its appointments as a
-- Runly Chat/Llamadas meeting or at an external https URL. Each confirmed booking of a
-- "runly" service owns one private meeting channel and one lobby guest link, created,
-- moved and revoked by the meetings projection (never by the browser).
ALTER TABLE "booking_service" ADD COLUMN "meeting" JSONB NOT NULL DEFAULT '{"kind":"none"}';

CREATE TABLE "booking_meeting" (
    "booking_id"      UUID NOT NULL,
    "company_id"      UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "call_link_id"    UUID NOT NULL,
    "version"         INTEGER NOT NULL,
    "revoked_at"      TIMESTAMPTZ(6),
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_meeting_pkey" PRIMARY KEY ("booking_id"),
    CONSTRAINT "booking_meeting_booking_fkey" FOREIGN KEY ("company_id", "booking_id") REFERENCES "booking"("company_id", "id") ON DELETE CASCADE,
    CONSTRAINT "booking_meeting_conversation_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE,
    CONSTRAINT "booking_meeting_call_link_fkey" FOREIGN KEY ("call_link_id") REFERENCES "call_link"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "booking_meeting_conversation_key" ON "booking_meeting"("conversation_id");

DO $$ BEGIN
  ALTER TABLE public.booking_meeting ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.booking_meeting FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.booking_meeting FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.booking_meeting FROM authenticated; END IF;
END $$;
