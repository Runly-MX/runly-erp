-- One optional primary address per site: the public gateway redirects the site's other servable addresses to it.
ALTER TABLE "website_domain" ADD COLUMN "is_primary" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "website_domain_one_primary_per_site" ON "website_domain" ("site_id") WHERE "is_primary";
