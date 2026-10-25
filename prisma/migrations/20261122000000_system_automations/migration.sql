-- Automations of a company not tied to a module (event or schedule triggers).
-- Additive: new table only.
CREATE TABLE "system_automation" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "definition" JSONB NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_automation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "system_automation_company_id_key_key" ON "system_automation"("company_id", "key");
CREATE INDEX "system_automation_company_id_enabled_idx" ON "system_automation"("company_id", "enabled");
