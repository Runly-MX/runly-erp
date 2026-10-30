-- Rollback of prisma/migrations/20261214120000_purchase_payments.
-- Only safe while purchase_payment holds no movement that must be kept:
-- export it first (SELECT * FROM purchase_payment) if it has rows.
-- purchase_invoice.paid_amount was never removed, so invoices keep their
-- accumulated amounts. Afterwards mark the migration as rolled back:
--   prisma migrate resolve --rolled-back 20261214120000_purchase_payments
DROP TRIGGER IF EXISTS "purchase_payment_immutable" ON "purchase_payment";
DROP FUNCTION IF EXISTS "purchase_payment_immutable"();
DROP TABLE IF EXISTS "purchase_payment";
