-- Incoming webhooks for company automations. Additive: one nullable column and one new table.
ALTER TABLE "system_automation" ADD COLUMN "webhook_token" TEXT;
CREATE UNIQUE INDEX "system_automation_webhook_token_key" ON "system_automation"("webhook_token");

CREATE TABLE "automation_webhook_event" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "automation_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "source_ip" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_webhook_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "automation_webhook_event_company_id_automation_key_created_at_idx" ON "automation_webhook_event"("company_id", "automation_key", "created_at" DESC);
