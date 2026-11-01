BEGIN;
ALTER TABLE pos_table ADD COLUMN outlet_id uuid REFERENCES pos_outlet(id) ON DELETE RESTRICT;
ALTER TABLE pos_table ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE pos_table ALTER COLUMN floor_id DROP NOT NULL;
UPDATE pos_table t SET outlet_id=f.outlet_id FROM pos_floor f JOIN pos_outlet o ON o.id=f.outlet_id AND o.company_id=f.company_id
 WHERE t.floor_id=f.id AND t.company_id=f.company_id;
CREATE INDEX pos_table_company_outlet_idx ON pos_table(company_id,outlet_id);
CREATE UNIQUE INDEX pos_simple_table_name_idx ON pos_table(company_id,outlet_id,lower(name)) WHERE floor_id IS NULL;
CREATE FUNCTION commerce_table_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f pos_floor;
BEGIN
  IF NEW.floor_id IS NOT NULL THEN
    SELECT * INTO f FROM pos_floor WHERE id=NEW.floor_id AND company_id=NEW.company_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'commerce_table_floor_scope' USING ERRCODE='23514'; END IF;
    IF NEW.outlet_id IS NULL THEN NEW.outlet_id:=f.outlet_id; END IF;
    IF NEW.outlet_id<>f.outlet_id THEN RAISE EXCEPTION 'commerce_table_outlet_scope' USING ERRCODE='23514'; END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pos_outlet WHERE id=NEW.outlet_id AND company_id=NEW.company_id) THEN
    RAISE EXCEPTION 'commerce_table_outlet_scope' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.outlet_id IS NOT NULL AND
    (NEW.company_id,NEW.outlet_id) IS DISTINCT FROM (OLD.company_id,OLD.outlet_id) THEN
    RAISE EXCEPTION 'commerce_table_immutable_outlet' USING ERRCODE='23514'; END IF;
  IF NEW.status NOT IN ('OCCUPIED','BILL_REQUESTED') AND EXISTS(SELECT 1 FROM pos_order WHERE table_id=NEW.id AND company_id=NEW.company_id AND status NOT IN ('PAID','CANCELLED','REFUNDED')) THEN
    RAISE EXCEPTION 'commerce_table_active_order' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND NEW.version=OLD.version AND
    (NEW.name,NEW.capacity,NEW.enabled,NEW.status,NEW.waiter_id,NEW.floor_id,NEW.zone_id) IS DISTINCT FROM
    (OLD.name,OLD.capacity,OLD.enabled,OLD.status,OLD.waiter_id,OLD.floor_id,OLD.zone_id) THEN
    NEW.version:=OLD.version+1;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER commerce_table_scope BEFORE INSERT OR UPDATE ON pos_table FOR EACH ROW EXECUTE FUNCTION commerce_table_scope_guard();

ALTER TABLE pos_order_line ADD COLUMN dispatched_at timestamp(3), ADD COLUMN preparation_tracked boolean NOT NULL DEFAULT false;
CREATE TABLE pos_kitchen_dispatch (
 id uuid PRIMARY KEY DEFAULT uuidv7(), company_id uuid NOT NULL, order_id uuid NOT NULL REFERENCES pos_order(id) ON DELETE RESTRICT,
 sequence integer NOT NULL CHECK(sequence>0), snapshot jsonb NOT NULL, dispatched_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(order_id,sequence)
);
CREATE INDEX pos_kitchen_dispatch_company_order_idx ON pos_kitchen_dispatch(company_id,order_id);
ALTER TABLE pos_kitchen_ticket ADD COLUMN dispatch_id uuid REFERENCES pos_kitchen_dispatch(id) ON DELETE RESTRICT,
 ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE pos_kitchen_ticket_line ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0), ADD COLUMN snapshot jsonb,
 ADD COLUMN previous_status pos_kitchen_status, ADD COLUMN transition_at timestamp(3), ADD COLUMN transition_by_id uuid;
CREATE INDEX pos_kitchen_ticket_dispatch_idx ON pos_kitchen_ticket(dispatch_id);
CREATE INDEX pos_kitchen_ticket_line_order_line_idx ON pos_kitchen_ticket_line(order_line_id);
CREATE FUNCTION commerce_dispatch_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'commerce_dispatch_immutable' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pos_order WHERE id=NEW.order_id AND company_id=NEW.company_id) THEN
   RAISE EXCEPTION 'commerce_dispatch_order_scope' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commerce_dispatch_scope BEFORE INSERT OR UPDATE OR DELETE ON pos_kitchen_dispatch FOR EACH ROW EXECUTE FUNCTION commerce_dispatch_scope_guard();
CREATE FUNCTION commerce_ticket_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.dispatch_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM pos_kitchen_dispatch d JOIN pos_order o ON o.id=d.order_id JOIN pos_kitchen_station s ON s.id=NEW.station_id
   WHERE d.id=NEW.dispatch_id AND d.order_id=NEW.order_id AND d.company_id=NEW.company_id
    AND s.company_id=NEW.company_id AND s.outlet_id=o.outlet_id) THEN
   RAISE EXCEPTION 'commerce_ticket_scope' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND OLD.dispatch_id IS NOT NULL AND
   (NEW.dispatch_id,NEW.order_id,NEW.station_id,NEW.company_id,NEW.sent_at) IS DISTINCT FROM
   (OLD.dispatch_id,OLD.order_id,OLD.station_id,OLD.company_id,OLD.sent_at) THEN
   RAISE EXCEPTION 'commerce_ticket_immutable_origin' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commerce_ticket_scope BEFORE INSERT OR UPDATE ON pos_kitchen_ticket FOR EACH ROW EXECUTE FUNCTION commerce_ticket_scope_guard();
CREATE FUNCTION commerce_ticket_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.snapshot IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pos_order_line l JOIN pos_kitchen_ticket t ON t.order_id=l.order_id
   WHERE t.id=NEW.ticket_id AND l.id=NEW.order_line_id) THEN RAISE EXCEPTION 'commerce_ticket_line_scope' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND OLD.snapshot IS NOT NULL AND
   (NEW.ticket_id,NEW.order_line_id,NEW.quantity,NEW.note,NEW.snapshot) IS DISTINCT FROM
   (OLD.ticket_id,OLD.order_line_id,OLD.quantity,OLD.note,OLD.snapshot) THEN
   RAISE EXCEPTION 'commerce_ticket_line_immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commerce_ticket_line_scope BEFORE INSERT OR UPDATE ON pos_kitchen_ticket_line FOR EACH ROW EXECUTE FUNCTION commerce_ticket_line_guard();

CREATE TABLE pos_payment_allocation (
 id uuid PRIMARY KEY DEFAULT uuidv7(), company_id uuid NOT NULL, order_id uuid NOT NULL REFERENCES pos_order(id) ON DELETE RESTRICT,
 payment_id uuid NOT NULL REFERENCES pos_payment(id) ON DELETE RESTRICT,
 order_line_id uuid NOT NULL REFERENCES pos_order_line(id) ON DELETE RESTRICT, amount numeric(12,2) NOT NULL CHECK(amount>=0),
 UNIQUE(payment_id,order_line_id)
);
CREATE INDEX pos_payment_allocation_company_order_idx ON pos_payment_allocation(company_id,order_id);
CREATE FUNCTION commerce_allocation_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pos_payment p JOIN pos_order_line l ON l.order_id=p.order_id
   WHERE p.id=NEW.payment_id AND p.company_id=NEW.company_id AND p.order_id=NEW.order_id AND l.id=NEW.order_line_id) THEN
   RAISE EXCEPTION 'commerce_allocation_scope' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commerce_allocation_scope BEFORE INSERT OR UPDATE ON pos_payment_allocation FOR EACH ROW EXECUTE FUNCTION commerce_allocation_scope_guard();

ALTER TABLE pos_print_job ALTER COLUMN receipt_id DROP NOT NULL;
ALTER TABLE pos_print_job ADD COLUMN ticket_id uuid REFERENCES pos_kitchen_ticket(id) ON DELETE RESTRICT;
ALTER TABLE pos_print_job ADD CONSTRAINT pos_print_job_document_xor CHECK(num_nonnulls(receipt_id,ticket_id)=1);
CREATE INDEX pos_print_job_ticket_idx ON pos_print_job(company_id,ticket_id,created_at);
CREATE OR REPLACE FUNCTION commerce_print_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pos_outlet WHERE id=NEW.outlet_id AND company_id=NEW.company_id) OR
   (NEW.receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pos_receipt r JOIN pos_order o ON o.id=r.order_id
      WHERE r.id=NEW.receipt_id AND r.company_id=NEW.company_id AND o.company_id=NEW.company_id AND o.outlet_id=NEW.outlet_id)) OR
   (NEW.ticket_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pos_kitchen_ticket t JOIN pos_order o ON o.id=t.order_id
      WHERE t.id=NEW.ticket_id AND t.company_id=NEW.company_id AND o.company_id=NEW.company_id AND o.outlet_id=NEW.outlet_id)) THEN
   RAISE EXCEPTION 'commerce_print_reference_scope' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND ((NEW.company_id,NEW.receipt_id,NEW.ticket_id,NEW.outlet_id,NEW.created_by_id,NEW.transport,NEW.copy,NEW.reason,NEW.payload,NEW.created_at)
   IS DISTINCT FROM (OLD.company_id,OLD.receipt_id,OLD.ticket_id,OLD.outlet_id,OLD.created_by_id,OLD.transport,OLD.copy,OLD.reason,OLD.payload,OLD.created_at)
   OR OLD.status<>'QUEUED' OR NEW.status NOT IN ('SUBMITTED','FAILED') OR NEW.finished_at IS NULL) THEN
   RAISE EXCEPTION 'commerce_print_immutable_attempt' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
ALTER TABLE pos_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_kitchen_station ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_kitchen_ticket ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_kitchen_ticket_line ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos_table,pos_kitchen_station,pos_kitchen_ticket,pos_kitchen_ticket_line FROM PUBLIC;
ALTER TABLE pos_kitchen_dispatch ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_payment_allocation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos_kitchen_dispatch,pos_payment_allocation FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON pos_table,pos_kitchen_station,pos_kitchen_ticket,pos_kitchen_ticket_line,pos_kitchen_dispatch,pos_payment_allocation FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON pos_table,pos_kitchen_station,pos_kitchen_ticket,pos_kitchen_ticket_line,pos_kitchen_dispatch,pos_payment_allocation FROM authenticated; END IF;
END $$;
COMMIT;
