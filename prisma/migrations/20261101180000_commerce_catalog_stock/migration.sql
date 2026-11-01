BEGIN;
ALTER TABLE catalog_product ADD COLUMN pos_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN commercial_tax_rate numeric(8,4), ADD COLUMN commercial_tax_included boolean,
  ADD COLUMN price_version integer NOT NULL DEFAULT 1;
ALTER TABLE catalog_product_variant ADD COLUMN price_inherited boolean NOT NULL DEFAULT false,
  ADD COLUMN price_version integer NOT NULL DEFAULT 1;
ALTER TABLE catalog_stock_movement ADD COLUMN balance_applied boolean NOT NULL DEFAULT false;

CREATE TABLE catalog_stock_balance (
  id uuid PRIMARY KEY DEFAULT uuidv7(), company_id uuid NOT NULL, product_id uuid NOT NULL REFERENCES catalog_product(id) ON DELETE RESTRICT,
  variant_id uuid REFERENCES catalog_product_variant(id) ON DELETE RESTRICT, outlet_id uuid REFERENCES pos_outlet(id) ON DELETE RESTRICT,
  scope text NOT NULL CHECK(scope IN ('OUTLET','LEGACY_UNALLOCATED')), quantity integer NOT NULL DEFAULT 0,
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((scope='OUTLET' AND outlet_id IS NOT NULL AND quantity>=0) OR (scope='LEGACY_UNALLOCATED' AND outlet_id IS NULL))
);
CREATE UNIQUE INDEX catalog_stock_balance_identity ON catalog_stock_balance(company_id,product_id,variant_id,outlet_id) NULLS NOT DISTINCT;
CREATE INDEX catalog_stock_balance_company_id_product_id_idx ON catalog_stock_balance(company_id,product_id);
CREATE TABLE catalog_pos_availability (
  id uuid PRIMARY KEY DEFAULT uuidv7(), company_id uuid NOT NULL, product_id uuid NOT NULL REFERENCES catalog_product(id) ON DELETE RESTRICT,
  outlet_id uuid NOT NULL REFERENCES pos_outlet(id) ON DELETE RESTRICT, enabled boolean,
  updated_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,product_id,outlet_id)
);
-- Copy balances, never fabricate historic sale movements or infer a branch.
CREATE FUNCTION commerce_initialize_stock_balances() RETURNS void LANGUAGE sql AS $$
  INSERT INTO catalog_stock_balance(company_id,product_id,variant_id,outlet_id,scope,quantity)
    SELECT company_id,id,NULL,NULL,'LEGACY_UNALLOCATED',stock FROM catalog_product
    ON CONFLICT DO NOTHING;
  INSERT INTO catalog_stock_balance(company_id,product_id,variant_id,outlet_id,scope,quantity)
    SELECT company_id,product_id,id,NULL,'LEGACY_UNALLOCATED',stock FROM catalog_product_variant
    ON CONFLICT DO NOTHING;
$$;
REVOKE ALL ON FUNCTION commerce_initialize_stock_balances() FROM PUBLIC;
SELECT commerce_initialize_stock_balances();

CREATE FUNCTION commerce_stock_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM catalog_product WHERE id=NEW.product_id AND company_id=NEW.company_id) OR
    (NEW.variant_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM catalog_product_variant WHERE id=NEW.variant_id AND company_id=NEW.company_id AND product_id=NEW.product_id)) OR
    (NEW.outlet_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pos_outlet WHERE id=NEW.outlet_id AND company_id=NEW.company_id)) THEN
    RAISE EXCEPTION 'commerce_reference_scope' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER commerce_balance_scope BEFORE INSERT OR UPDATE ON catalog_stock_balance FOR EACH ROW EXECUTE FUNCTION commerce_stock_scope_guard();
-- Availability has no variant column, so give it a separate explicit guard.
CREATE FUNCTION commerce_availability_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM catalog_product WHERE id=NEW.product_id AND company_id=NEW.company_id) OR
     NOT EXISTS(SELECT 1 FROM pos_outlet WHERE id=NEW.outlet_id AND company_id=NEW.company_id) THEN
    RAISE EXCEPTION 'commerce_reference_scope' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER commerce_availability_scope BEFORE INSERT OR UPDATE ON catalog_pos_availability FOR EACH ROW EXECUTE FUNCTION commerce_availability_guard();

CREATE FUNCTION commerce_aggregate_stock_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stock IS DISTINCT FROM OLD.stock AND pg_trigger_depth()<2 THEN
    RAISE EXCEPTION 'commerce_stock_requires_ledger' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER commerce_product_stock_guard BEFORE UPDATE OF stock ON catalog_product FOR EACH ROW EXECUTE FUNCTION commerce_aggregate_stock_guard();
CREATE TRIGGER commerce_variant_stock_guard BEFORE UPDATE OF stock ON catalog_product_variant FOR EACH ROW EXECUTE FUNCTION commerce_aggregate_stock_guard();
CREATE FUNCTION commerce_balance_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.variant_id IS NULL THEN
    UPDATE catalog_product SET stock=stock+(NEW.quantity-OLD.quantity),updated_at=now() WHERE id=NEW.product_id AND company_id=NEW.company_id;
  ELSE
    UPDATE catalog_product_variant SET stock=stock+(NEW.quantity-OLD.quantity),updated_at=now() WHERE id=NEW.variant_id AND company_id=NEW.company_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER commerce_balance_projection AFTER UPDATE OF quantity ON catalog_stock_balance FOR EACH ROW EXECUTE FUNCTION commerce_balance_projection();
CREATE FUNCTION commerce_new_stock_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid uuid; vid uuid;
BEGIN
  pid:=NEW.id; vid:=NULL;
  IF TG_TABLE_NAME='catalog_product_variant' THEN
    pid:=NEW.product_id; vid:=NEW.id;
    IF NOT EXISTS(SELECT 1 FROM catalog_product WHERE id=pid AND company_id=NEW.company_id) THEN
      RAISE EXCEPTION 'commerce_reference_scope' USING ERRCODE='23514';
    END IF;
  END IF;
  INSERT INTO catalog_stock_balance(company_id,product_id,variant_id,scope,quantity) VALUES(NEW.company_id,pid,vid,'LEGACY_UNALLOCATED',NEW.stock);
  IF NEW.stock<>0 THEN
    INSERT INTO catalog_stock_movement(company_id,product_id,variant_id,quantity_delta,reason,source_type,source_id,operation_key,balance_applied)
      VALUES(NEW.company_id,pid,vid,NEW.stock,'Saldo inicial de artículo nuevo','OPENING_BALANCE',NEW.id,'opening:'||NEW.id::text,true);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER commerce_new_product AFTER INSERT ON catalog_product FOR EACH ROW EXECUTE FUNCTION commerce_new_stock_item();
CREATE TRIGGER commerce_new_variant AFTER INSERT ON catalog_product_variant FOR EACH ROW EXECUTE FUNCTION commerce_new_stock_item();

CREATE FUNCTION commerce_price_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.price_version:=OLD.price_version+1;
  RETURN NEW;
END $$;
CREATE TRIGGER commerce_product_price BEFORE UPDATE OF price,currency,commercial_tax_rate,commercial_tax_included ON catalog_product FOR EACH ROW EXECUTE FUNCTION commerce_price_revision();
CREATE TRIGGER commerce_variant_price BEFORE UPDATE OF price,price_inherited ON catalog_product_variant FOR EACH ROW EXECUTE FUNCTION commerce_price_revision();
-- These defaults already exist in earlier deployed catalog fixes; also keep raw
-- SQL consumers valid in a clean schema generated from Prisma's datamodel.
ALTER TABLE catalog_product ALTER id SET DEFAULT uuidv7(), ALTER updated_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE catalog_product_variant ALTER id SET DEFAULT uuidv7(), ALTER updated_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE catalog_stock_movement ALTER id SET DEFAULT uuidv7(), ALTER updated_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE catalog_product_option ALTER id SET DEFAULT uuidv7(), ALTER updated_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE catalog_product_option_value ALTER id SET DEFAULT uuidv7(), ALTER updated_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE catalog_stock_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_pos_availability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON catalog_stock_balance,catalog_pos_availability FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON catalog_stock_balance,catalog_pos_availability FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON catalog_stock_balance,catalog_pos_availability FROM authenticated; END IF;
END $$;
COMMIT;
