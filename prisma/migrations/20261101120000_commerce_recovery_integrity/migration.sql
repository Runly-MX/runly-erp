-- Phase 1 is additive. Unknown historic currency/tender/change stays NULL.
-- Fail before any DDL when existing OPEN containers need reconciliation.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pos_session WHERE status = 'OPEN' GROUP BY company_id, terminal_id HAVING count(*) > 1)
     OR EXISTS (SELECT 1 FROM pos_waiter_shift WHERE status = 'OPEN' GROUP BY company_id, outlet_id, waiter_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'commerce_recovery_preflight: duplicate OPEN containers require explicit reconciliation';
  END IF;
END $$;
-- AlterTable
ALTER TABLE "catalog_stock_movement" ADD COLUMN     "operation_key" TEXT,
ADD COLUMN     "outlet_id" UUID,
ADD COLUMN     "reversal_of_id" UUID,
ADD COLUMN     "source_id" UUID,
ADD COLUMN     "source_line_id" UUID,
ADD COLUMN     "source_type" TEXT;

-- AlterTable
ALTER TABLE "pos_session" ADD COLUMN     "currency" TEXT;

-- AlterTable
ALTER TABLE "pos_order" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "experience" TEXT,
ADD COLUMN     "refunded_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "stock_status" TEXT NOT NULL DEFAULT 'LEGACY_UNKNOWN',
ADD COLUMN     "tax_snapshot" JSONB,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "pos_order_line" ADD COLUMN     "base_unit_price" DECIMAL(12,2),
ADD COLUMN     "price_version" INTEGER,
ADD COLUMN     "returned_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
ADD COLUMN     "tax_included" BOOLEAN,
ADD COLUMN     "voided" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "pos_payment" ADD COLUMN     "change_amount" DECIMAL(12,2),
ADD COLUMN     "tendered_amount" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "pos_command" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_command_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_refund" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_refund_line" (
    "subtotal_amount" DECIMAL(12,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL,
    "stock_restored" BOOLEAN NOT NULL DEFAULT false,
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "refund_id" UUID NOT NULL,
    "order_line_id" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "restock" BOOLEAN NOT NULL,

    CONSTRAINT "pos_refund_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_refund_payment" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "refund_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT,

    CONSTRAINT "pos_refund_payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pos_command_company_id_operation_key_key" ON "pos_command"("company_id", "operation", "key");

-- CreateIndex
CREATE INDEX "pos_refund_company_id_order_id_idx" ON "pos_refund"("company_id", "order_id");

-- CreateIndex
CREATE INDEX "pos_refund_line_order_line_id_idx" ON "pos_refund_line"("order_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_refund_line_refund_id_order_line_id_key" ON "pos_refund_line"("refund_id", "order_line_id");

-- CreateIndex
CREATE INDEX "pos_refund_payment_payment_id_idx" ON "pos_refund_payment"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_refund_payment_refund_id_payment_id_key" ON "pos_refund_payment"("refund_id", "payment_id");

-- AddForeignKey
ALTER TABLE "pos_refund" ADD CONSTRAINT "pos_refund_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "pos_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_refund_line" ADD CONSTRAINT "pos_refund_line_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "pos_refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_refund_line" ADD CONSTRAINT "pos_refund_line_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "pos_order_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_refund_payment" ADD CONSTRAINT "pos_refund_payment_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "pos_refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_refund_payment" ADD CONSTRAINT "pos_refund_payment_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "pos_payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PostgreSQL partial uniqueness is authoritative, not a read-before-write check.
CREATE UNIQUE INDEX pos_session_one_open_terminal ON pos_session(company_id, terminal_id) WHERE status = 'OPEN';
CREATE UNIQUE INDEX pos_waiter_shift_one_open_operator ON pos_waiter_shift(company_id, outlet_id, waiter_id) WHERE status = 'OPEN';
CREATE UNIQUE INDEX catalog_stock_movement_operation ON catalog_stock_movement(company_id, operation_key) WHERE operation_key IS NOT NULL;
CREATE INDEX catalog_stock_movement_pos_source ON catalog_stock_movement(company_id, source_id, source_line_id) WHERE source_type = 'POS_SALE';
ALTER TABLE pos_payment ADD CONSTRAINT pos_payment_tender_check CHECK
  ((tendered_amount IS NULL AND change_amount IS NULL) OR
   (tendered_amount IS NOT NULL AND change_amount IS NOT NULL AND tendered_amount >= amount AND change_amount = tendered_amount - amount)) NOT VALID;
ALTER TABLE pos_refund ADD CONSTRAINT pos_refund_positive CHECK (amount > 0 AND length(trim(reason)) > 0);
ALTER TABLE pos_refund_line ADD CONSTRAINT pos_refund_line_positive CHECK (quantity > 0 AND amount >= 0);
ALTER TABLE pos_refund_payment ADD CONSTRAINT pos_refund_payment_positive CHECK (amount > 0);
ALTER TABLE pos_order ADD CONSTRAINT pos_order_recovery_totals CHECK (refunded_amount >= 0 AND refunded_amount <= paid_amount AND version > 0) NOT VALID;
ALTER TABLE pos_command ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_refund ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_refund_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_refund_payment ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos_command, pos_refund, pos_refund_line, pos_refund_payment FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON pos_command, pos_refund, pos_refund_line, pos_refund_payment FROM anon;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON pos_command, pos_refund, pos_refund_line, pos_refund_payment FROM authenticated;
  END IF;
END $$;
-- No public policies: financial documents are written only by the backend owner.
COMMIT;
