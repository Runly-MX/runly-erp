-- runly.purchases: one immutable movement per supplier-invoice payment.
-- Additive only: purchase_invoice is not altered and no existing row is
-- touched. paid_amount stays on the invoice as a cache of SUM(amount); invoices
-- paid before this migration keep their accumulated amount and get no rows
-- here until the reviewed backfill (scripts/purchases/payments-reconciliation.mjs)
-- or their first new payment records them as one OPENING movement.
-- Rollback: scripts/purchases/payments-rollback.sql.

CREATE TABLE "purchase_payment" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'PAYMENT',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "paid_at" DATE,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" VARCHAR(40),
    "reference" VARCHAR(120),
    "origin" VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
    "reverses_id" UUID,
    "reason" VARCHAR(500),
    "idempotency_key" VARCHAR(100),
    "created_by_id" UUID,
    "metadata" JSONB,

    CONSTRAINT "purchase_payment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_payment_kind_check" CHECK ("kind" IN ('PAYMENT', 'OPENING', 'REVERSAL')),
    CONSTRAINT "purchase_payment_origin_check" CHECK ("origin" IN ('MANUAL', 'MIGRATED', 'IMPORT', 'INTEGRATION')),
    -- Reversals are negative and name the movement and the reason; everything else is positive.
    CONSTRAINT "purchase_payment_amount_sign_check" CHECK (
      ("kind" = 'REVERSAL' AND "amount" < 0 AND "reverses_id" IS NOT NULL AND "reason" IS NOT NULL AND length(btrim("reason")) > 0)
      OR ("kind" <> 'REVERSAL' AND "amount" > 0 AND "reverses_id" IS NULL)
    ),
    CONSTRAINT "purchase_payment_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

-- A movement can be reversed once.
CREATE UNIQUE INDEX "purchase_payment_reverses_id_key" ON "purchase_payment"("reverses_id");
CREATE INDEX "purchase_payment_company_id_invoice_id_recorded_at_idx" ON "purchase_payment"("company_id", "invoice_id", "recorded_at");
-- A retried request with the same key never records a second movement.
CREATE UNIQUE INDEX "purchase_payment_company_id_idempotency_key_key" ON "purchase_payment"("company_id", "idempotency_key");

ALTER TABLE "purchase_payment" ADD CONSTRAINT "purchase_payment_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "purchase_invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_payment" ADD CONSTRAINT "purchase_payment_reverses_id_fkey" FOREIGN KEY ("reverses_id") REFERENCES "purchase_payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial history is append-only. The only exception is the company
-- deletion purge, which sets runly.lifecycle_purge for its own transaction.
CREATE FUNCTION "purchase_payment_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('runly.lifecycle_purge', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'purchase_payment rows are immutable; record a REVERSAL instead'
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "purchase_payment_immutable"
  BEFORE UPDATE OR DELETE ON "purchase_payment"
  FOR EACH ROW EXECUTE FUNCTION "purchase_payment_immutable"();
