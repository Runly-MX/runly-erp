-- Cooldown ledger for "visitors are seeing errors" alerts: one row per site + route.
CREATE TABLE "growth_error_alert" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "route_key" TEXT NOT NULL,
    "last_notified_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "growth_error_alert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "growth_error_alert_property_id_route_key_key" ON "growth_error_alert"("property_id", "route_key");
