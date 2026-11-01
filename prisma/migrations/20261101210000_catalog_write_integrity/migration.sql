BEGIN;
ALTER TABLE catalog_product ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE catalog_product_variant ADD COLUMN revision integer NOT NULL DEFAULT 1;
CREATE FUNCTION commerce_catalog_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  -- Keep legacy clientUpdatedAt preconditions reliable even for two updates
  -- in one millisecond or writers that omit updated_at.
  NEW.updated_at := GREATEST(NEW.updated_at, clock_timestamp()::timestamp, OLD.updated_at + interval '1 millisecond');
  RETURN NEW;
END $$;
-- Covers all writers, including availability, stock projections and legacy sync.
CREATE TRIGGER commerce_product_revision BEFORE UPDATE ON catalog_product
  FOR EACH ROW EXECUTE FUNCTION commerce_catalog_revision();
CREATE TRIGGER commerce_variant_revision BEFORE UPDATE ON catalog_product_variant
  FOR EACH ROW EXECUTE FUNCTION commerce_catalog_revision();
COMMIT;
