-- Active site monitoring for runly.growth: monitors, check results and incidents.
CREATE TABLE "growth_monitor" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'http',
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "interval_seconds" INTEGER NOT NULL DEFAULT 300,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_checked_at" TIMESTAMP(3),
    "last_change_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "growth_monitor_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "growth_monitor_enabled_last_checked_at_idx" ON "growth_monitor"("enabled", "last_checked_at");
CREATE INDEX "growth_monitor_company_id_property_id_idx" ON "growth_monitor"("company_id", "property_id");

CREATE TABLE "growth_monitor_check" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "monitor_id" UUID NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "status_code" INTEGER,
    "latency_ms" INTEGER,
    "error" TEXT,
    "detail" JSONB,
    CONSTRAINT "growth_monitor_check_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "growth_monitor_check_monitor_id_checked_at_idx" ON "growth_monitor_check"("monitor_id", "checked_at" DESC);
CREATE INDEX "growth_monitor_check_checked_at_idx" ON "growth_monitor_check"("checked_at");

CREATE TABLE "growth_incident" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "monitor_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "cause" TEXT,
    "last_notified_at" TIMESTAMP(3),
    CONSTRAINT "growth_incident_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "growth_incident_company_id_resolved_at_idx" ON "growth_incident"("company_id", "resolved_at");
CREATE INDEX "growth_incident_monitor_id_started_at_idx" ON "growth_incident"("monitor_id", "started_at" DESC);
