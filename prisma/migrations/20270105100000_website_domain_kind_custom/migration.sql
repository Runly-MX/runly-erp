-- Customer-owned hostnames use kind = 'custom'. Their released state reuses 'quarantined' (already allowed).
ALTER TABLE "website_domain" DROP CONSTRAINT IF EXISTS "website_domain_kind_check";
ALTER TABLE "website_domain" ADD CONSTRAINT "website_domain_kind_check" CHECK (kind IN ('legacy', 'platform', 'reserved', 'custom'));
