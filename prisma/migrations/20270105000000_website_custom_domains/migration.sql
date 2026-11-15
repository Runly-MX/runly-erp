-- Customer-owned hostnames (kind = 'custom'): DNS TXT ownership proof and informational HTTPS state.
ALTER TABLE "website_domain" ADD COLUMN IF NOT EXISTS "verification_token" TEXT;
ALTER TABLE "website_domain" ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMPTZ;
ALTER TABLE "website_domain" ADD COLUMN IF NOT EXISTS "dns_target" TEXT;
ALTER TABLE "website_domain" ADD COLUMN IF NOT EXISTS "https_state" TEXT;
ALTER TABLE "website_domain" ADD COLUMN IF NOT EXISTS "https_checked_at" TIMESTAMPTZ;
ALTER TABLE "website_domain" ADD COLUMN IF NOT EXISTS "last_error" TEXT;
CREATE INDEX IF NOT EXISTS "website_domain_kind_state_idx" ON "website_domain"("kind", "state");
