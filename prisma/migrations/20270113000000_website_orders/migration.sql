-- Website orders: what a published site sold through its cart. Website-owned tables, no dependency on POS or any optional module.
-- A checkout stores a `pending` order (prices read from the catalog on the server) before redirecting to Stripe; the payment is confirmed
-- with the site's own key and the order becomes `paid`. Customer links are soft: contact and account ids, never required.
CREATE TABLE website_order (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id uuid NOT NULL,
  site_id uuid NOT NULL,
  order_number integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  currency text NOT NULL CHECK (char_length(currency) BETWEEN 3 AND 8),
  subtotal_amount numeric(12,2) NOT NULL CHECK (subtotal_amount >= 0),
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  stripe_session_id text,
  customer_email text,
  customer_name text,
  contact_id uuid,
  external_account_id uuid,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, order_number),
  UNIQUE (stripe_session_id),
  FOREIGN KEY (company_id, site_id) REFERENCES website_site(company_id, id)
);
CREATE INDEX website_order_site_status_idx ON website_order (company_id, site_id, status, created_at DESC);
CREATE INDEX website_order_account_idx ON website_order (external_account_id) WHERE external_account_id IS NOT NULL;

CREATE TABLE website_order_line (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES website_order(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  variant_id uuid,
  name text NOT NULL,
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  quantity integer NOT NULL CHECK (quantity > 0 AND quantity <= 1000),
  currency text NOT NULL
);
CREATE INDEX website_order_line_order_idx ON website_order_line (order_id);

DO $$ DECLARE t text; r text; BEGIN
  FOREACH t IN ARRAY ARRAY['website_order','website_order_line'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY website_backend_only ON %I AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false)',t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC',t);
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I',t,r);
      END IF;
    END LOOP;
  END LOOP;
END $$;
