-- Run log of Builder automations. Additive: new table only.
CREATE TABLE "automation_run" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "module_key" TEXT NOT NULL,
    "automation_key" TEXT NOT NULL,
    "trigger_kind" TEXT NOT NULL,
    "trigger_ref" TEXT,
    "status" TEXT NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_run_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "automation_run_company_id_module_key_created_at_idx" ON "automation_run"("company_id", "module_key", "created_at" DESC);
