-- Expand only: no historical row is rewritten, no new legacy model columns.
BEGIN;
ALTER TABLE purchase_order ALTER COLUMN issue_date DROP NOT NULL,
  ALTER COLUMN subtotal DROP NOT NULL, ALTER COLUMN tax DROP NOT NULL, ALTER COLUMN total DROP NOT NULL;
ALTER TABLE purchase_invoice ALTER COLUMN issue_date DROP NOT NULL,
  ALTER COLUMN subtotal DROP NOT NULL, ALTER COLUMN tax DROP NOT NULL, ALTER COLUMN total DROP NOT NULL,
  ALTER COLUMN paid_amount DROP NOT NULL;
ALTER TABLE purchase_line ALTER COLUMN quantity DROP NOT NULL,
  ALTER COLUMN unit_amount DROP NOT NULL, ALTER COLUMN tax_amount DROP NOT NULL,
  ALTER COLUMN total DROP NOT NULL, ALTER COLUMN tax_rate DROP NOT NULL;

CREATE TABLE purchase_documentary_reference (
  company_id uuid NOT NULL REFERENCES company(id) ON DELETE RESTRICT,
  document_type varchar(30) NOT NULL CHECK (document_type IN ('purchase_order', 'purchase_invoice')),
  document_id uuid NOT NULL,
  economic_mode text NOT NULL DEFAULT 'DOCUMENTARY' CHECK (economic_mode = 'DOCUMENTARY'),
  reference varchar(255) NOT NULL CHECK (length(btrim(reference)) > 0),
  description varchar(2000),
  idempotency_key varchar(120),
  request_fingerprint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_type, document_id),
  UNIQUE (company_id, idempotency_key)
);
CREATE INDEX purchase_documentary_company ON purchase_documentary_reference(company_id, document_type);
ALTER TABLE purchase_documentary_reference ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON purchase_documentary_reference FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON purchase_documentary_reference FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON purchase_documentary_reference FROM authenticated;
  END IF;
END $$;

-- Null is the durable economic discriminator, also safe for old raw SQL consumers:
-- SUM ignores null and REGISTERED is never a financial payable status.
ALTER TABLE purchase_order ADD CONSTRAINT purchase_order_economic_shape CHECK (
  (total IS NULL AND subtotal IS NULL AND tax IS NULL AND status IN ('REGISTERED','CANCELLED')) OR
  (total IS NOT NULL AND subtotal IS NOT NULL AND tax IS NOT NULL AND issue_date IS NOT NULL AND status <> 'REGISTERED'));
ALTER TABLE purchase_invoice ADD CONSTRAINT purchase_invoice_economic_shape CHECK (
  (total IS NULL AND subtotal IS NULL AND tax IS NULL AND paid_amount IS NULL AND due_date IS NULL AND paid_at IS NULL AND status IN ('REGISTERED','CANCELLED')) OR
  (total IS NOT NULL AND subtotal IS NOT NULL AND tax IS NOT NULL AND paid_amount IS NOT NULL AND issue_date IS NOT NULL AND status <> 'REGISTERED'));

-- Block implicit conversion even through integrations or administrative edits.
CREATE FUNCTION purchase_preserve_economic_mode() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.total IS NULL) IS DISTINCT FROM (NEW.total IS NULL) THEN
    RAISE EXCEPTION 'purchase economic mode is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER purchase_order_economic_mode BEFORE UPDATE ON purchase_order FOR EACH ROW EXECUTE FUNCTION purchase_preserve_economic_mode();
CREATE TRIGGER purchase_invoice_economic_mode BEFORE UPDATE ON purchase_invoice FOR EACH ROW EXECUTE FUNCTION purchase_preserve_economic_mode();
COMMIT;
