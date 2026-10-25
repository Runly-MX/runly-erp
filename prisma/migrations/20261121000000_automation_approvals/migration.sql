-- Approval step of Builder automations (stage C). Additive: new table only.
CREATE TABLE "automation_approval" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "module_key" TEXT NOT NULL,
    "automation_key" TEXT NOT NULL,
    "run_id" UUID,
    "job_id" UUID NOT NULL,
    "approver_ids" UUID[],
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "comment" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_approval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "automation_approval_job_id_key" ON "automation_approval"("job_id");
CREATE INDEX "automation_approval_company_id_status_idx" ON "automation_approval"("company_id", "status");
CREATE INDEX "automation_approval_status_expires_at_idx" ON "automation_approval"("status", "expires_at");
