-- Preserve historical visibility; new sites explicitly opt in through the API.
ALTER TABLE website_site ADD COLUMN catalog_mode text NOT NULL DEFAULT 'legacy_all';
ALTER TABLE website_site ALTER COLUMN catalog_mode SET DEFAULT 'explicit';
ALTER TABLE website_site ADD CONSTRAINT website_catalog_mode_check CHECK(catalog_mode IN ('legacy_all','explicit'));
CREATE UNIQUE INDEX IF NOT EXISTS catalog_product_website_owner_key ON catalog_product(company_id,id);
CREATE TABLE website_catalog_product (
  company_id uuid NOT NULL,
  site_id uuid NOT NULL,
  product_id uuid NOT NULL,
  included boolean NOT NULL,
  PRIMARY KEY(company_id,site_id,product_id),
  FOREIGN KEY(company_id,site_id) REFERENCES website_site(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,product_id) REFERENCES catalog_product(company_id,id) ON DELETE RESTRICT
);
CREATE INDEX website_catalog_product_product_idx ON website_catalog_product(company_id,product_id,site_id);
ALTER TABLE website_catalog_product ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON website_catalog_product FROM anon,authenticated;
