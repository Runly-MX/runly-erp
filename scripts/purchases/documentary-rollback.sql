-- Execute only after disabling the profile, and only before documentary use.
-- Refuses loss of any reference, null amount or company configuration.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT FROM purchase_documentary_reference)
    OR EXISTS (SELECT FROM purchase_order WHERE total IS NULL)
    OR EXISTS (SELECT FROM purchase_invoice WHERE total IS NULL)
    OR EXISTS (SELECT FROM instance_config WHERE key LIKE 'purchases.economicMode.%' AND value = 'DOCUMENTARY') THEN
    RAISE EXCEPTION 'Documentary data/configuration exists; rollback refused without data loss';
  END IF;
END $$;
DROP TRIGGER purchase_order_economic_mode ON purchase_order;
DROP TRIGGER purchase_invoice_economic_mode ON purchase_invoice;
DROP FUNCTION purchase_preserve_economic_mode();
ALTER TABLE purchase_order DROP CONSTRAINT purchase_order_economic_shape;
ALTER TABLE purchase_invoice DROP CONSTRAINT purchase_invoice_economic_shape;
DROP TABLE purchase_documentary_reference;
ALTER TABLE purchase_order ALTER COLUMN issue_date SET NOT NULL,
  ALTER COLUMN subtotal SET NOT NULL, ALTER COLUMN tax SET NOT NULL, ALTER COLUMN total SET NOT NULL;
ALTER TABLE purchase_invoice ALTER COLUMN issue_date SET NOT NULL,
  ALTER COLUMN subtotal SET NOT NULL, ALTER COLUMN tax SET NOT NULL, ALTER COLUMN total SET NOT NULL,
  ALTER COLUMN paid_amount SET NOT NULL;
ALTER TABLE purchase_line ALTER COLUMN quantity SET NOT NULL,
  ALTER COLUMN unit_amount SET NOT NULL, ALTER COLUMN tax_amount SET NOT NULL,
  ALTER COLUMN total SET NOT NULL, ALTER COLUMN tax_rate SET NOT NULL;
COMMIT;
