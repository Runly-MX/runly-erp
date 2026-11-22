-- runly.ticketing F6E: public portal, delivery by email, Website and embeds, Calendar.
-- Nothing here changes how seats, quotas or admissions work.

-- Publication: sites allowed to frame the portal (besides the company's own Runly
-- websites and the ERP itself) and when the event went public.
ALTER TABLE "ticket_event" ADD COLUMN "embed_origins" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "ticket_event" ADD COLUMN "published_at" TIMESTAMPTZ(6);

-- Buyer's personal link (HMAC of order id + version, bookings pattern): only its hash is kept.
ALTER TABLE "ticket_order" ADD COLUMN "manage_token_expires_at" TIMESTAMPTZ(6);

-- The current QR secret of a ticket, sealed with AES-256-GCM under a key that lives
-- outside the database (TICKETING_CREDENTIAL_KEYS). The ciphertext is bound (AAD) to
-- company, ticket and credential version; one row per ticket, replaced on reissue or
-- transfer and deleted when the ticket stops being valid. Only the mail worker opens it.
CREATE TABLE "ticket_credential_secret" (
    "ticket_id"          UUID NOT NULL,
    "company_id"         UUID NOT NULL,
    "credential_version" INTEGER NOT NULL,
    "key_id"             TEXT NOT NULL CHECK ("key_id" ~ '^[A-Za-z0-9_-]{1,32}$'),
    "nonce"              BYTEA NOT NULL CHECK (octet_length("nonce") = 12),
    "ciphertext"         BYTEA NOT NULL,
    "tag"                BYTEA NOT NULL CHECK (octet_length("tag") = 16),
    "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_credential_secret_pkey" PRIMARY KEY ("ticket_id"),
    CONSTRAINT "ticket_credential_secret_ticket_fkey" FOREIGN KEY ("company_id", "ticket_id") REFERENCES "ticket"("company_id", "id") ON DELETE CASCADE
);
CREATE INDEX "ticket_credential_secret_key_idx" ON "ticket_credential_secret"("key_id");

-- Ticket emails, written in the issuing transaction and sent by the worker (outbox).
-- dedupe_key makes retries and replays enqueue once; a resend gets its own key.
CREATE TABLE "ticket_notification" (
    "id"              UUID NOT NULL DEFAULT uuidv7(),
    "company_id"      UUID NOT NULL,
    "order_id"        UUID NOT NULL,
    "ticket_ids"      UUID[] NOT NULL,
    "kind"            TEXT NOT NULL CHECK ("kind" IN ('issued', 'resend', 'reissued', 'transferred')),
    "dedupe_key"      TEXT NOT NULL,
    "recipient"       TEXT NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
    "attempts"        INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until"    TIMESTAMPTZ(6),
    "last_error"      TEXT,
    "sent_at"         TIMESTAMPTZ(6),
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_notification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_notification_dedupe_key" UNIQUE ("dedupe_key"),
    CONSTRAINT "ticket_notification_order_fkey" FOREIGN KEY ("company_id", "order_id") REFERENCES "ticket_order"("company_id", "id") ON DELETE CASCADE
);
CREATE INDEX "ticket_notification_due_idx" ON "ticket_notification"("status", "next_attempt_at");

-- Calendar mirror of functions: what was last projected for each one.
CREATE TABLE "ticket_session_calendar_sync" (
    "session_id"  UUID NOT NULL,
    "company_id"  UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "synced_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_session_calendar_sync_pkey" PRIMARY KEY ("session_id"),
    CONSTRAINT "ticket_session_calendar_sync_session_fkey" FOREIGN KEY ("company_id", "session_id") REFERENCES "ticket_session"("company_id", "id") ON DELETE CASCADE
);

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['ticket_credential_secret', 'ticket_notification', 'ticket_session_calendar_sync'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon', t); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t); END IF;
  END LOOP;
END $$;
