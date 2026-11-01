BEGIN;
ALTER TABLE pos_order_line ADD COLUMN variant_label text;
CREATE TABLE pos_print_job (
  id uuid PRIMARY KEY DEFAULT uuidv7(), company_id uuid NOT NULL,
  receipt_id uuid NOT NULL REFERENCES pos_receipt(id) ON DELETE RESTRICT,
  outlet_id uuid NOT NULL REFERENCES pos_outlet(id) ON DELETE RESTRICT,
  created_by_id uuid NOT NULL REFERENCES user_profile(id) ON DELETE RESTRICT,
  transport text NOT NULL CHECK(transport IN ('BROWSER','BLUETOOTH')),
  status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','SUBMITTED','FAILED')),
  copy boolean NOT NULL DEFAULT false, reason text, error_code text, payload jsonb NOT NULL,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, finished_at timestamp(3)
);
CREATE INDEX pos_print_job_company_id_receipt_id_created_at_idx ON pos_print_job(company_id,receipt_id,created_at);
CREATE FUNCTION commerce_print_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pos_receipt r JOIN pos_order o ON o.id=r.order_id
    WHERE r.id=NEW.receipt_id AND r.company_id=NEW.company_id AND o.company_id=NEW.company_id AND o.outlet_id=NEW.outlet_id)
    OR NOT EXISTS(SELECT 1 FROM pos_outlet WHERE id=NEW.outlet_id AND company_id=NEW.company_id) THEN
    RAISE EXCEPTION 'commerce_print_reference_scope' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF (NEW.company_id,NEW.receipt_id,NEW.outlet_id,NEW.created_by_id,NEW.transport,NEW.copy,NEW.reason,NEW.payload,NEW.created_at)
      IS DISTINCT FROM (OLD.company_id,OLD.receipt_id,OLD.outlet_id,OLD.created_by_id,OLD.transport,OLD.copy,OLD.reason,OLD.payload,OLD.created_at)
      OR OLD.status<>'QUEUED' OR NEW.status NOT IN ('SUBMITTED','FAILED') OR NEW.finished_at IS NULL THEN
      RAISE EXCEPTION 'commerce_print_immutable_attempt' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER commerce_print_scope BEFORE INSERT OR UPDATE ON pos_print_job FOR EACH ROW EXECUTE FUNCTION commerce_print_scope_guard();
CREATE FUNCTION commerce_receipt_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'commerce_receipt_immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER commerce_receipt_immutable BEFORE UPDATE ON pos_receipt FOR EACH ROW EXECUTE FUNCTION commerce_receipt_snapshot_guard();
ALTER TABLE pos_print_job ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos_print_job FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON pos_print_job FROM anon; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON pos_print_job FROM authenticated; END IF;
END $$;
COMMIT;
