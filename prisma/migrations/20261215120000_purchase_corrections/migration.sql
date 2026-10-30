-- runly.purchases: document versions, audited corrections and receipt
-- reversals. Runs after 20261214120000_purchase_payments. Additive only: four
-- NEW tables; purchase_order, purchase_invoice and purchase_receipt are not
-- altered, so code with or without this migration reads the same columns (the
-- code detects these tables and degrades when they are missing). No existing
-- row is written. Rollback: scripts/purchases/corrections-rollback.sql.

-- Version counter of an order or invoice. Missing row = version 1.
CREATE TABLE "purchase_document_version" (
    "document_type" VARCHAR(40) NOT NULL,
    "document_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_document_version_pkey" PRIMARY KEY ("document_type","document_id"),
    CONSTRAINT "purchase_document_version_type_check" CHECK ("document_type" IN ('purchase_order', 'purchase_invoice')),
    CONSTRAINT "purchase_document_version_positive_check" CHECK ("version" >= 1)
);
CREATE INDEX "purchase_document_version_company_id_idx" ON "purchase_document_version"("company_id");

CREATE TABLE "purchase_document_revision" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "document_type" VARCHAR(40) NOT NULL,
    "document_id" UUID NOT NULL,
    "version_from" INTEGER NOT NULL,
    "version_to" INTEGER NOT NULL,
    "changes" JSONB NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "actor_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_document_revision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_document_revision_type_check" CHECK ("document_type" IN ('purchase_order', 'purchase_invoice')),
    CONSTRAINT "purchase_document_revision_version_check" CHECK ("version_to" > "version_from"),
    CONSTRAINT "purchase_document_revision_reason_check" CHECK (length(btrim("reason")) > 0)
);
CREATE INDEX "purchase_document_revision_company_id_document_type_documen_idx" ON "purchase_document_revision"("company_id", "document_type", "document_id", "created_at");
CREATE UNIQUE INDEX "purchase_document_revision_document_type_document_id_versio_key" ON "purchase_document_revision"("document_type", "document_id", "version_to");

CREATE TABLE "purchase_receipt_reversal" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "reversed_at" DATE NOT NULL,
    "idempotency_key" VARCHAR(100),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_receipt_reversal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_receipt_reversal_reason_check" CHECK (length(btrim("reason")) > 0)
);
CREATE INDEX "purchase_receipt_reversal_company_id_receipt_id_idx" ON "purchase_receipt_reversal"("company_id", "receipt_id");
CREATE INDEX "purchase_receipt_reversal_order_id_idx" ON "purchase_receipt_reversal"("order_id");
CREATE UNIQUE INDEX "purchase_receipt_reversal_company_id_idempotency_key_key" ON "purchase_receipt_reversal"("company_id", "idempotency_key");

CREATE TABLE "purchase_receipt_reversal_line" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "reversal_id" UUID NOT NULL,
    "receipt_line_id" UUID NOT NULL,
    "order_line_id" UUID NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_receipt_reversal_line_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_receipt_reversal_line_quantity_check" CHECK ("quantity" > 0)
);
CREATE INDEX "purchase_receipt_reversal_line_reversal_id_idx" ON "purchase_receipt_reversal_line"("reversal_id");
CREATE INDEX "purchase_receipt_reversal_line_receipt_line_id_idx" ON "purchase_receipt_reversal_line"("receipt_line_id");

ALTER TABLE "purchase_receipt_reversal" ADD CONSTRAINT "purchase_receipt_reversal_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "purchase_receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_receipt_reversal_line" ADD CONSTRAINT "purchase_receipt_reversal_line_reversal_id_fkey" FOREIGN KEY ("reversal_id") REFERENCES "purchase_receipt_reversal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_receipt_reversal_line" ADD CONSTRAINT "purchase_receipt_reversal_line_receipt_line_id_fkey" FOREIGN KEY ("receipt_line_id") REFERENCES "purchase_receipt_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- History rows are append-only; only the company deletion purge
-- (runly.lifecycle_purge) may remove them, as with purchase_payment.
CREATE FUNCTION "purchase_history_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('runly.lifecycle_purge', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "purchase_document_revision_immutable" BEFORE UPDATE OR DELETE ON "purchase_document_revision"
  FOR EACH ROW EXECUTE FUNCTION "purchase_history_immutable"();
CREATE TRIGGER "purchase_receipt_reversal_immutable" BEFORE UPDATE OR DELETE ON "purchase_receipt_reversal"
  FOR EACH ROW EXECUTE FUNCTION "purchase_history_immutable"();
CREATE TRIGGER "purchase_receipt_reversal_line_immutable" BEFORE UPDATE OR DELETE ON "purchase_receipt_reversal_line"
  FOR EACH ROW EXECUTE FUNCTION "purchase_history_immutable"();
