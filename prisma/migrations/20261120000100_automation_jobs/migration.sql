-- Waits and schedules of Builder automations (stage B). Additive: new tables only.
CREATE TABLE "automation_job" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "module_key" TEXT NOT NULL,
    "automation_key" TEXT NOT NULL,
    "run_id" UUID,
    "from_step" INTEGER NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "run_at" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "dedupe_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_job_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "automation_job_dedupe_key_key" ON "automation_job"("dedupe_key");
CREATE INDEX "automation_job_status_run_at_idx" ON "automation_job"("status", "run_at");
CREATE INDEX "automation_job_company_id_module_key_status_idx" ON "automation_job"("company_id", "module_key", "status");

CREATE TABLE "automation_schedule" (
    "company_id" UUID NOT NULL,
    "module_key" TEXT NOT NULL,
    "automation_key" TEXT NOT NULL,
    "next_run_at" TIMESTAMPTZ(6) NOT NULL,
    "last_run_at" TIMESTAMPTZ(6),
    "last_error" TEXT,

    CONSTRAINT "automation_schedule_pkey" PRIMARY KEY ("company_id", "module_key", "automation_key")
);

CREATE INDEX "automation_schedule_next_run_at_idx" ON "automation_schedule"("next_run_at");
