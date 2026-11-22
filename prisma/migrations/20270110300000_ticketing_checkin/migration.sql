-- runly.ticketing F6D: check-in. Admissions become an append-only audit of every
-- committed scan (admitted or rejected); revoked credential hashes let a gate tell a
-- replaced or cancelled QR from a forged one without storing any secret.

-- A rejected unknown QR has no ticket of this company; an admission always has one.
ALTER TABLE "ticket_admission" ALTER COLUMN "ticket_id" DROP NOT NULL;
ALTER TABLE "ticket_admission" DROP CONSTRAINT "ticket_admission_reason_check";
ALTER TABLE "ticket_admission" ADD CONSTRAINT "ticket_admission_reason_check"
  CHECK ("reason" IN ('ok', 'already_used', 'cancelled', 'wrong_session', 'outside_window', 'unknown', 'revoked', 'not_issued'));
ALTER TABLE "ticket_admission" ADD CONSTRAINT "ticket_admission_result_reason_check" CHECK (("result" = 'admitted') = ("reason" = 'ok'));
ALTER TABLE "ticket_admission" ADD CONSTRAINT "ticket_admission_admitted_ticket_check" CHECK ("result" <> 'admitted' OR "ticket_id" IS NOT NULL);
-- qr: the scanned RT1 credential; code: the printed ticket code typed by the operator.
ALTER TABLE "ticket_admission" ADD COLUMN "method" TEXT NOT NULL DEFAULT 'qr' CHECK ("method" IN ('qr', 'code'));
ALTER TABLE "ticket_admission" ADD COLUMN "credential_version" INTEGER;
CREATE INDEX "ticket_admission_ticket_idx" ON "ticket_admission"("ticket_id");

CREATE FUNCTION ticket_admission_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ticket_admission is append-only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER ticket_admission_append_only BEFORE UPDATE OR DELETE ON "ticket_admission"
  FOR EACH ROW EXECUTE FUNCTION ticket_admission_append_only();

-- Hash of every credential that stopped being valid (reissue, transfer, cancellation).
-- Hashes of dead secrets: useless to an attacker, enough to answer "reemplazado".
CREATE TABLE "ticket_credential_revoked" (
    "id"                 UUID NOT NULL DEFAULT uuidv7(),
    "company_id"         UUID NOT NULL,
    "ticket_id"          UUID NOT NULL,
    "credential_version" INTEGER NOT NULL,
    "credential_hash"    TEXT NOT NULL,
    "reason"             TEXT NOT NULL CHECK ("reason" IN ('reissued', 'transferred', 'cancelled', 'expired')),
    "revoked_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_credential_revoked_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ticket_credential_revoked_hash_key" UNIQUE ("ticket_id", "credential_hash"),
    CONSTRAINT "ticket_credential_revoked_ticket_fkey" FOREIGN KEY ("company_id", "ticket_id") REFERENCES "ticket"("company_id", "id")
);

ALTER TABLE public.ticket_credential_revoked ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticket_credential_revoked FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.ticket_credential_revoked FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.ticket_credential_revoked FROM authenticated; END IF;
END $$;
