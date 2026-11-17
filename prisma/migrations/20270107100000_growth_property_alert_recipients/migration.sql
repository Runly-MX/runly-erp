-- Extra recipients for a Growth property's site monitor alerts, on top of the company's Growth managers:
-- company users (no extra permissions needed) and external email addresses (for example a site owner without a Runly account).
ALTER TABLE "growth_property" ADD COLUMN "alert_user_ids" UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE "growth_property" ADD COLUMN "alert_emails" TEXT[] NOT NULL DEFAULT '{}';
