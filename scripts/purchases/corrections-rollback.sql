-- Rollback of prisma/migrations/20261215120000_purchase_corrections.
-- The four tables are new; dropping them leaves orders, invoices and receipts
-- as they were EXCEPT that receipt reversals already applied stay subtracted
-- from purchase_line.received_quantity. Export purchase_document_revision,
-- purchase_receipt_reversal and purchase_receipt_reversal_line first if they
-- hold rows, and decide with the business how to treat those reversals.
-- Afterwards: prisma migrate resolve --rolled-back 20261215120000_purchase_corrections
DROP TABLE IF EXISTS "purchase_receipt_reversal_line";
DROP TABLE IF EXISTS "purchase_receipt_reversal";
DROP TABLE IF EXISTS "purchase_document_revision";
DROP TABLE IF EXISTS "purchase_document_version";
DROP FUNCTION IF EXISTS "purchase_history_immutable"();
